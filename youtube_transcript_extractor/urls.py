"""Turn anything that looks like a YouTube reference into a video id."""

from __future__ import annotations

import re
from urllib.parse import parse_qs, urlparse

from .errors import InvalidVideoURL

#: YouTube video ids are always 11 characters of URL-safe base64.
VIDEO_ID_RE = re.compile(r"^[0-9A-Za-z_-]{11}$")

_YOUTUBE_HOSTS = {
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "music.youtube.com",
    "gaming.youtube.com",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
}
_SHORT_HOSTS = {"youtu.be", "www.youtu.be"}

#: /shorts/<id>, /embed/<id>, /live/<id>, /v/<id>, /e/<id>
_PATH_PREFIXES = ("shorts", "embed", "live", "v", "e")


def is_video_id(value: str) -> bool:
    """True when *value* is exactly a bare 11-character video id."""
    return bool(VIDEO_ID_RE.match(value))


def extract_video_id(value: str) -> str:
    """Return the video id contained in *value*.

    Accepts bare ids, watch URLs, youtu.be links, shorts, embeds, live URLs
    and anything with the usual tracking parameters attached.

    Raises:
        InvalidVideoURL: when no id can be found.
    """
    candidate = (value or "").strip()
    if not candidate:
        raise InvalidVideoURL(value)

    if is_video_id(candidate):
        return candidate

    # urlparse only recognises a host when a scheme is present.
    if "//" not in candidate:
        candidate = "https://" + candidate.lstrip("/")

    parsed = urlparse(candidate)
    host = parsed.netloc.split("@")[-1].split(":")[0].lower()
    path_parts = [part for part in parsed.path.split("/") if part]

    found: str | None = None
    if host in _SHORT_HOSTS:
        found = path_parts[0] if path_parts else None
    elif host in _YOUTUBE_HOSTS:
        query = parse_qs(parsed.query)
        if "v" in query and query["v"]:
            found = query["v"][0]
        elif path_parts and path_parts[0] in _PATH_PREFIXES and len(path_parts) > 1:
            found = path_parts[1]
        elif path_parts and path_parts[0] == "watch" and len(path_parts) > 1:
            # /watch/<id> is used by some embeds.
            found = path_parts[1]
    else:
        raise InvalidVideoURL(value)

    if found and is_video_id(found):
        return found
    raise InvalidVideoURL(value)


def watch_url(video_id: str) -> str:
    """Canonical watch URL for a video id."""
    return f"https://www.youtube.com/watch?v={video_id}"
