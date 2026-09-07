"""Fetch video metadata and caption tracks from YouTube.

Nothing here needs a third-party HTTP client or an API key: the same two
public endpoints the website itself uses are enough.

1. The InnerTube ``player`` endpoint returns a JSON *player response* that
   carries ``videoDetails`` and the list of caption tracks.
2. Each caption track exposes a ``baseUrl`` on YouTube's ``timedtext``
   host, which serves the cues as json3 or XML.

If InnerTube is unhappy the watch page is scraped for the same player
response object, which is embedded there as ``ytInitialPlayerResponse``.
"""

from __future__ import annotations

import gzip
import json
import re
import urllib.error
import urllib.parse
import urllib.request
import zlib

from .errors import (
    LanguageNotAvailable,
    NetworkError,
    NoTranscriptAvailable,
    TranscriptParseError,
    VideoUnavailable,
)
from .models import TrackInfo, Transcript, VideoMetadata
from .parsers import group_paragraphs, parse_transcript
from .urls import extract_video_id, watch_url

INNERTUBE_URL = "https://www.youtube.com/youtubei/v1/player"

#: Clients are tried in order; the first one that yields captions wins.
INNERTUBE_CLIENTS: dict[str, dict] = {
    "web": {
        "key": "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8",
        "client_name": "1",
        "user_agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
        ),
        "context": {
            "clientName": "WEB",
            "clientVersion": "2.20240726.00.00",
            "hl": "en",
            "gl": "US",
        },
    },
    "android": {
        "key": "AIzaSyA8eiZmM1FaDVjRy-df2KTyQ_vz_yYM39w",
        "client_name": "3",
        "user_agent": "com.google.android.youtube/19.29.37 (Linux; U; Android 14)",
        "context": {
            "clientName": "ANDROID",
            "clientVersion": "19.29.37",
            "androidSdkVersion": 34,
            "hl": "en",
            "gl": "US",
        },
    },
    "ios": {
        "key": "AIzaSyB-63vPrdThhKuerbB2N_l7Kwwcxj6yUAc",
        "client_name": "5",
        "user_agent": "com.google.ios.youtube/19.29.1 (iPhone16,2; U; CPU iOS 17_5_1 like Mac OS X)",
        "context": {
            "clientName": "IOS",
            "clientVersion": "19.29.1",
            "hl": "en",
            "gl": "US",
        },
    },
}

_PLAYER_RESPONSE_RE = re.compile(r"ytInitialPlayerResponse\s*=\s*\{")
DEFAULT_TIMEOUT = 20.0


class YouTubeClient:
    """Minimal HTTP client for YouTube's public endpoints."""

    def __init__(
        self,
        timeout: float = DEFAULT_TIMEOUT,
        proxy: str | None = None,
        cookie: str = "CONSENT=YES+cb; SOCS=CAI",
    ) -> None:
        self.timeout = timeout
        self.cookie = cookie
        handlers: list[urllib.request.BaseHandler] = []
        if proxy:
            handlers.append(urllib.request.ProxyHandler({"http": proxy, "https": proxy}))
        self._opener = urllib.request.build_opener(*handlers)

    def get(self, url: str, headers: dict[str, str] | None = None) -> str:
        return self._request(url, None, headers)

    def post_json(self, url: str, payload: dict, headers: dict[str, str]) -> dict:
        body = json.dumps(payload).encode("utf-8")
        raw = self._request(url, body, {**headers, "Content-Type": "application/json"})
        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            raise NetworkError(f"{url} returned invalid JSON: {exc}") from exc

    def _request(
        self, url: str, body: bytes | None, headers: dict[str, str] | None
    ) -> str:
        merged = {
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate",
            "Cookie": self.cookie,
            **(headers or {}),
        }
        merged.setdefault(
            "User-Agent", INNERTUBE_CLIENTS["web"]["user_agent"]
        )
        request = urllib.request.Request(url, data=body, headers=merged)
        try:
            with self._opener.open(request, timeout=self.timeout) as response:
                return _decode(response.read(), response.headers.get("Content-Encoding"))
        except urllib.error.HTTPError as exc:
            raise NetworkError(f"{url} returned HTTP {exc.code} {exc.reason}") from exc
        except urllib.error.URLError as exc:
            raise NetworkError(f"could not reach {url}: {exc.reason}") from exc
        except TimeoutError as exc:
            raise NetworkError(f"timed out after {self.timeout}s requesting {url}") from exc


def _decode(raw: bytes, encoding: str | None) -> str:
    if encoding == "gzip":
        raw = gzip.decompress(raw)
    elif encoding == "deflate":
        raw = zlib.decompress(raw, -zlib.MAX_WBITS)
    return raw.decode("utf-8", errors="replace")


def extract_json_object(text: str, start: int) -> str:
    """Return the JSON object beginning at ``text[start] == '{'``.

    A brace counter is used instead of a regular expression because the
    embedded player response contains braces inside string literals.
    """
    if start >= len(text) or text[start] != "{":
        raise TranscriptParseError("expected a JSON object")
    depth = 0
    in_string = False
    escaped = False
    for index in range(start, len(text)):
        char = text[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[start : index + 1]
    raise TranscriptParseError("unbalanced braces in embedded JSON")


class TranscriptExtractor:
    """Extract metadata and transcripts for YouTube videos."""

    def __init__(self, client: YouTubeClient | None = None) -> None:
        self.client = client or YouTubeClient()

    # -- player response -------------------------------------------------

    def fetch_player_response(self, video_id: str) -> dict:
        """Return the player response for *video_id*, trying each strategy.

        A response carrying caption tracks always wins. Failing that, any
        playable response is returned so the caller can still report metadata
        and raise a precise "this video has no captions" error.
        """
        failures: list[str] = []
        network_failures = 0
        without_captions: dict | None = None

        strategies = [
            (f"innertube/{name}", lambda name=name: self._innertube_player(video_id, name))
            for name in INNERTUBE_CLIENTS
        ]
        strategies.append(("watch page", lambda: self._watch_page_player(video_id)))

        for label, fetch in strategies:
            try:
                response = fetch()
            except (NetworkError, TranscriptParseError) as exc:
                failures.append(f"{label}: {exc}")
                if isinstance(exc, NetworkError):
                    network_failures += 1
                continue
            status, reason = _playability(response)
            if status not in {"OK", ""}:
                failures.append(f"{label}: {status} {reason}".strip())
                continue
            if _caption_tracks(response):
                return response
            without_captions = without_captions or response
            failures.append(f"{label}: no caption tracks")

        if without_captions is not None:
            return without_captions
        detail = "; ".join(failures) or "unknown error"
        if network_failures == len(strategies):
            # Nothing was ever said about the video itself - blame the network,
            # not the video, so the user looks in the right place.
            raise NetworkError(f"could not reach YouTube for {video_id}: {detail}")
        raise VideoUnavailable(video_id, detail)

    def _innertube_player(self, video_id: str, client_name: str) -> dict:
        client = INNERTUBE_CLIENTS[client_name]
        payload = {
            "videoId": video_id,
            "context": {"client": dict(client["context"])},
            "contentCheckOk": True,
            "racyCheckOk": True,
        }
        headers = {
            "User-Agent": client["user_agent"],
            "X-YouTube-Client-Name": client["client_name"],
            "X-YouTube-Client-Version": client["context"]["clientVersion"],
            "Origin": "https://www.youtube.com",
        }
        url = f"{INNERTUBE_URL}?key={client['key']}&prettyPrint=false"
        return self.client.post_json(url, payload, headers)

    def _watch_page_player(self, video_id: str) -> dict:
        page = self.client.get(watch_url(video_id))
        match = _PLAYER_RESPONSE_RE.search(page)
        if not match:
            if "captcha" in page.lower():
                raise TranscriptParseError("YouTube served a CAPTCHA page")
            raise TranscriptParseError("no ytInitialPlayerResponse on the watch page")
        raw = extract_json_object(page, match.end() - 1)
        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            raise TranscriptParseError(f"bad ytInitialPlayerResponse: {exc}") from exc

    # -- public API ------------------------------------------------------

    def metadata(self, video: str) -> VideoMetadata:
        """Fetch the descriptive content (title, channel, description...)."""
        video_id = extract_video_id(video)
        return parse_metadata(self.fetch_player_response(video_id), video_id)

    def list_tracks(self, video: str) -> list[TrackInfo]:
        """List every caption track available for a video."""
        video_id = extract_video_id(video)
        return parse_tracks(self.fetch_player_response(video_id))

    def get_transcript(
        self,
        video: str,
        languages: list[str] | None = None,
        prefer_manual: bool = True,
        translate_to: str | None = None,
        paragraphs: bool = False,
    ) -> Transcript:
        """Download and parse the best matching transcript for a video.

        Args:
            video: URL or video id.
            languages: preferred language codes, best first. ``None`` means
                "English if present, otherwise whatever the video has".
            prefer_manual: prefer human-written captions over auto-generated
                ones at the same language.
            translate_to: ask YouTube to machine-translate the chosen track.
            paragraphs: merge short cues into readable paragraphs.
        """
        video_id = extract_video_id(video)
        player = self.fetch_player_response(video_id)
        metadata = parse_metadata(player, video_id)
        tracks = parse_tracks(player)
        if not tracks:
            raise NoTranscriptAvailable(video_id)

        track = select_track(
            tracks,
            languages or ["en"],
            prefer_manual=prefer_manual,
            allow_any=languages is None,
        )
        if track is None:
            raise LanguageNotAvailable(
                video_id, languages or ["en"], [item.language_code for item in tracks]
            )

        url = _timedtext_url(track.base_url, translate_to)
        payload = self.client.get(url)
        segments = parse_transcript(payload)
        if paragraphs:
            segments = group_paragraphs(segments)
        if translate_to:
            track = TrackInfo(
                language_code=translate_to,
                language=translate_to,
                is_generated=track.is_generated,
                base_url=url,
                is_translatable=True,
                translated_from=track.language_code,
            )
        return Transcript(video=metadata, track=track, segments=segments)


# -- player response helpers ---------------------------------------------


def _playability(player: dict) -> tuple[str, str]:
    status = player.get("playabilityStatus") or {}
    return status.get("status", ""), status.get("reason", "") or ""


def _caption_tracks(player: dict) -> list[dict]:
    captions = player.get("captions") or {}
    renderer = captions.get("playerCaptionsTracklistRenderer") or {}
    return renderer.get("captionTracks") or []


def _name_of(node: dict | None) -> str:
    if not node:
        return ""
    if "simpleText" in node:
        return node["simpleText"]
    return "".join(run.get("text", "") for run in node.get("runs", []))


def parse_metadata(player: dict, video_id: str) -> VideoMetadata:
    """Build :class:`VideoMetadata` from a player response."""
    details = player.get("videoDetails") or {}
    microformat = (player.get("microformat") or {}).get(
        "playerMicroformatRenderer"
    ) or {}
    description = details.get("shortDescription") or _name_of(
        microformat.get("description")
    )
    publish_date = (
        microformat.get("publishDate") or microformat.get("uploadDate") or ""
    )
    return VideoMetadata(
        video_id=details.get("videoId") or video_id,
        title=details.get("title") or _name_of(microformat.get("title")),
        author=details.get("author") or microformat.get("ownerChannelName", ""),
        channel_id=details.get("channelId") or microformat.get("externalChannelId", ""),
        duration=int(details.get("lengthSeconds") or microformat.get("lengthSeconds") or 0),
        description=description or "",
        view_count=int(details.get("viewCount") or microformat.get("viewCount") or 0),
        publish_date=publish_date[:10] if publish_date else "",
        category=microformat.get("category", ""),
        is_live=bool(details.get("isLiveContent")),
        keywords=list(details.get("keywords") or []),
    )


def parse_tracks(player: dict) -> list[TrackInfo]:
    """Build the list of caption tracks from a player response."""
    tracks = []
    for entry in _caption_tracks(player):
        base_url = entry.get("baseUrl") or ""
        if not base_url:
            continue
        tracks.append(
            TrackInfo(
                language_code=entry.get("languageCode", ""),
                language=_name_of(entry.get("name")) or entry.get("languageCode", ""),
                is_generated=entry.get("kind") == "asr",
                base_url=base_url,
                is_translatable=bool(entry.get("isTranslatable")),
            )
        )
    return tracks


def select_track(
    tracks: list[TrackInfo],
    languages: list[str],
    prefer_manual: bool = True,
    allow_any: bool = False,
) -> TrackInfo | None:
    """Pick the track that best matches *languages*.

    For each requested language an exact code match is preferred, then a
    match on the base language (``en`` matches ``en-GB``). Within a language,
    manual captions beat auto-generated ones unless *prefer_manual* is off.
    """

    def rank(track: TrackInfo) -> int:
        return int(track.is_generated) if prefer_manual else int(not track.is_generated)

    for wanted in languages:
        wanted = wanted.strip().lower()
        exact = [t for t in tracks if t.language_code.lower() == wanted]
        if exact:
            return min(exact, key=rank)
        base = [t for t in tracks if t.language_code.lower().split("-")[0] == wanted.split("-")[0]]
        if base:
            return min(base, key=rank)
    if allow_any and tracks:
        return min(tracks, key=rank)
    return None


def _timedtext_url(base_url: str, translate_to: str | None) -> str:
    parts = urllib.parse.urlsplit(base_url)
    query = dict(urllib.parse.parse_qsl(parts.query, keep_blank_values=True))
    query["fmt"] = "json3"
    if translate_to:
        query["tlang"] = translate_to
    return urllib.parse.urlunsplit(
        parts._replace(query=urllib.parse.urlencode(query))
    )
