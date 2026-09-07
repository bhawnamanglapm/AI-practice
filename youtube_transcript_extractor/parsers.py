"""Parse the caption payloads YouTube serves from its timedtext endpoint.

Two shapes are handled:

``json3``
    ``{"events": [{"tStartMs": 0, "dDurationMs": 1200, "segs": [...]}, ...]}``
    Requested by appending ``&fmt=json3`` to a caption ``baseUrl``.

``xml``
    ``<transcript><text start="0" dur="1.2">hello</text></transcript>``
    The legacy default, still returned when ``fmt`` is omitted.
"""

from __future__ import annotations

import html
import json
import re
import xml.etree.ElementTree as ET

from .errors import TranscriptParseError
from .models import Segment

_WHITESPACE_RE = re.compile(r"\s+")


def clean_text(text: str, keep_newlines: bool = False) -> str:
    """Collapse caption whitespace and undo YouTube's double escaping."""
    # Caption text arrives escaped once by the XML layer and, for older
    # tracks, a second time in the text itself ("&amp;#39;" -> "'").
    text = html.unescape(html.unescape(text))
    text = text.replace("​", "").replace("\xa0", " ")
    if keep_newlines:
        lines = (_WHITESPACE_RE.sub(" ", line).strip() for line in text.splitlines())
        return "\n".join(line for line in lines if line)
    return _WHITESPACE_RE.sub(" ", text).strip()


def parse_json3(payload: str) -> list[Segment]:
    """Parse a ``fmt=json3`` caption document."""
    try:
        document = json.loads(payload)
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive
        raise TranscriptParseError(f"malformed json3 payload: {exc}") from exc

    events = document.get("events")
    if not isinstance(events, list):
        raise TranscriptParseError("json3 payload has no 'events' list")

    segments: list[Segment] = []
    for event in events:
        if not isinstance(event, dict):
            continue
        # Rolling auto-caption events repeat the previous line verbatim.
        if event.get("aAppend"):
            continue
        pieces = event.get("segs")
        if not pieces:
            continue
        text = clean_text("".join(piece.get("utf8", "") for piece in pieces))
        if not text:
            continue
        start = float(event.get("tStartMs", 0)) / 1000.0
        duration = event.get("dDurationMs")
        segments.append(
            Segment(
                start=start,
                duration=float(duration) / 1000.0 if duration is not None else 0.0,
                text=text,
            )
        )
    return _fill_missing_durations(segments)


def parse_xml(payload: str) -> list[Segment]:
    """Parse a legacy ``<transcript>`` caption document."""
    try:
        root = ET.fromstring(payload)
    except ET.ParseError as exc:
        raise TranscriptParseError(f"malformed transcript XML: {exc}") from exc

    segments: list[Segment] = []
    for node in root.iter("text"):
        text = clean_text("".join(node.itertext()))
        if not text:
            continue
        segments.append(
            Segment(
                start=_to_float(node.get("start")),
                duration=_to_float(node.get("dur")),
                text=text,
            )
        )
    return _fill_missing_durations(segments)


def parse_transcript(payload: str) -> list[Segment]:
    """Parse a caption payload, detecting json3 or XML automatically."""
    stripped = (payload or "").strip()
    if not stripped:
        raise TranscriptParseError("empty caption payload")
    if stripped[0] in "{[":
        return parse_json3(stripped)
    if stripped[0] == "<":
        return parse_xml(stripped)
    raise TranscriptParseError("caption payload is neither json3 nor XML")


def _to_float(value: str | None) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _fill_missing_durations(segments: list[Segment]) -> list[Segment]:
    """Give zero-duration cues a length reaching the next cue."""
    filled: list[Segment] = []
    for index, segment in enumerate(segments):
        if segment.duration > 0:
            filled.append(segment)
            continue
        if index + 1 < len(segments):
            gap = segments[index + 1].start - segment.start
        else:
            gap = 0.0
        filled.append(
            Segment(
                start=segment.start,
                duration=max(gap, 0.0) or 2.0,
                text=segment.text,
            )
        )
    return filled


def group_paragraphs(
    segments: list[Segment], max_gap: float = 2.0, max_chars: int = 500
) -> list[Segment]:
    """Merge cues into paragraph-sized blocks.

    Auto-generated captions arrive as two- or three-word fragments, which are
    unreadable as prose. Cues are joined until either a pause longer than
    *max_gap* seconds or *max_chars* characters of text.
    """
    if not segments:
        return []

    paragraphs: list[Segment] = []
    buffer = [segments[0]]
    for previous, current in zip(segments, segments[1:]):
        gap = current.start - previous.end
        length = sum(len(item.text) + 1 for item in buffer)
        if gap > max_gap or length >= max_chars:
            paragraphs.append(_merge(buffer))
            buffer = []
        buffer.append(current)
    if buffer:
        paragraphs.append(_merge(buffer))
    return paragraphs


def _merge(segments: list[Segment]) -> Segment:
    start = segments[0].start
    return Segment(
        start=start,
        duration=max(segments[-1].end - start, 0.0),
        text=" ".join(segment.text for segment in segments),
    )
