"""Render a :class:`~youtube_transcript_extractor.models.Transcript`."""

from __future__ import annotations

import json
import textwrap

from .models import Transcript

FORMATS = ("txt", "srt", "vtt", "json", "md")


def format_timestamp(seconds: float, separator: str = ",", hours: bool = True) -> str:
    """Format seconds as ``HH:MM:SS,mmm`` (SRT) or ``HH:MM:SS.mmm`` (VTT)."""
    seconds = max(seconds, 0.0)
    milliseconds = int(round(seconds * 1000))
    milliseconds, fraction = divmod(milliseconds, 1000)
    minutes, second = divmod(milliseconds, 60)
    hour, minute = divmod(minutes, 60)
    if hours or hour:
        return f"{hour:02d}:{minute:02d}:{second:02d}{separator}{fraction:03d}"
    return f"{minute:02d}:{second:02d}{separator}{fraction:03d}"


def format_clock(seconds: float) -> str:
    """Short ``M:SS`` / ``H:MM:SS`` stamp used in text and markdown output."""
    total = int(seconds)
    hour, remainder = divmod(total, 3600)
    minute, second = divmod(remainder, 60)
    if hour:
        return f"{hour}:{minute:02d}:{second:02d}"
    return f"{minute}:{second:02d}"


def to_txt(
    transcript: Transcript,
    timestamps: bool = False,
    metadata: bool = True,
    width: int = 0,
) -> str:
    """Plain text, one block per cue."""
    lines: list[str] = []
    if metadata:
        lines.extend(_metadata_lines(transcript))
        lines.append("")

    for segment in transcript.segments:
        text = segment.text
        if timestamps:
            stamp = f"[{format_clock(segment.start)}] "
            if width:
                text = textwrap.fill(
                    text,
                    width=width,
                    initial_indent=stamp,
                    subsequent_indent=" " * len(stamp),
                )
            else:
                text = stamp + text
        elif width:
            text = textwrap.fill(text, width=width)
        lines.append(text)
    return "\n".join(lines).rstrip() + "\n"


def to_srt(transcript: Transcript, **_: object) -> str:
    """SubRip subtitles."""
    blocks = []
    for index, segment in enumerate(transcript.segments, start=1):
        start = format_timestamp(segment.start)
        end = format_timestamp(max(segment.end, segment.start + 0.001))
        blocks.append(f"{index}\n{start} --> {end}\n{segment.text}\n")
    return "\n".join(blocks)


def to_vtt(transcript: Transcript, **_: object) -> str:
    """WebVTT subtitles."""
    blocks = ["WEBVTT\n"]
    for segment in transcript.segments:
        start = format_timestamp(segment.start, separator=".")
        end = format_timestamp(max(segment.end, segment.start + 0.001), separator=".")
        blocks.append(f"{start} --> {end}\n{segment.text}\n")
    return "\n".join(blocks)


def to_json(transcript: Transcript, metadata: bool = True, **_: object) -> str:
    """Structured output, including the full text as one string."""
    document = transcript.as_dict()
    document["text"] = transcript.text
    if not metadata:
        document.pop("video", None)
    return json.dumps(document, indent=2, ensure_ascii=False) + "\n"


def to_markdown(
    transcript: Transcript, timestamps: bool = True, metadata: bool = True, **_: object
) -> str:
    """Markdown document, handy for pasting into notes or an LLM prompt."""
    video = transcript.video
    lines: list[str] = []
    if metadata:
        lines.append(f"# {video.title or video.video_id}")
        lines.append("")
        if video.author:
            lines.append(f"- **Channel:** {video.author}")
        if video.publish_date:
            lines.append(f"- **Published:** {video.publish_date}")
        if video.duration:
            lines.append(f"- **Duration:** {format_clock(video.duration)}")
        if video.view_count:
            lines.append(f"- **Views:** {video.view_count:,}")
        lines.append(f"- **URL:** {video.url}")
        lines.append(f"- **Transcript:** {transcript.track.label}")
        lines.append("")
        if video.description:
            lines.append("## Description")
            lines.append("")
            lines.append(video.description.strip())
            lines.append("")
        lines.append("## Transcript")
        lines.append("")

    for segment in transcript.segments:
        if timestamps:
            stamp = format_clock(segment.start)
            link = f"{video.url}&t={int(segment.start)}s"
            lines.append(f"**[{stamp}]({link})** {segment.text}")
        else:
            lines.append(segment.text)
        lines.append("")
    return "\n".join(lines).rstrip() + "\n"


def render(transcript: Transcript, fmt: str = "txt", **options: object) -> str:
    """Render *transcript* in one of :data:`FORMATS`."""
    renderers = {
        "txt": to_txt,
        "srt": to_srt,
        "vtt": to_vtt,
        "json": to_json,
        "md": to_markdown,
    }
    try:
        renderer = renderers[fmt]
    except KeyError:
        raise ValueError(
            f"unknown format {fmt!r}; choose from {', '.join(FORMATS)}"
        ) from None
    return renderer(transcript, **options)


def _metadata_lines(transcript: Transcript) -> list[str]:
    video = transcript.video
    lines = [video.title or video.video_id]
    if video.author:
        lines.append(f"Channel: {video.author}")
    if video.publish_date:
        lines.append(f"Published: {video.publish_date}")
    if video.duration:
        lines.append(f"Duration: {format_clock(video.duration)}")
    lines.append(f"URL: {video.url}")
    lines.append(f"Transcript: {transcript.track.label}")
    lines.append("-" * 60)
    return lines
