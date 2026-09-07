"""Data structures shared across the extractor."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Segment:
    """A single caption cue."""

    start: float
    duration: float
    text: str

    @property
    def end(self) -> float:
        return self.start + self.duration

    def as_dict(self) -> dict:
        return {
            "start": round(self.start, 3),
            "duration": round(self.duration, 3),
            "end": round(self.end, 3),
            "text": self.text,
        }


@dataclass(frozen=True)
class TrackInfo:
    """One caption track advertised by YouTube."""

    language_code: str
    language: str
    is_generated: bool
    base_url: str = ""
    is_translatable: bool = False
    translated_from: str | None = None

    @property
    def label(self) -> str:
        parts = [f"{self.language} ({self.language_code})"]
        if self.is_generated:
            parts.append("auto-generated")
        if self.translated_from:
            parts.append(f"translated from {self.translated_from}")
        return " - ".join(parts)

    def as_dict(self) -> dict:
        return {
            "language_code": self.language_code,
            "language": self.language,
            "is_generated": self.is_generated,
            "is_translatable": self.is_translatable,
            "translated_from": self.translated_from,
        }


@dataclass(frozen=True)
class VideoMetadata:
    """The descriptive content of a video, independent of its captions."""

    video_id: str
    title: str = ""
    author: str = ""
    channel_id: str = ""
    duration: int = 0
    description: str = ""
    view_count: int = 0
    publish_date: str = ""
    category: str = ""
    is_live: bool = False
    keywords: list[str] = field(default_factory=list)

    @property
    def url(self) -> str:
        return f"https://www.youtube.com/watch?v={self.video_id}"

    def as_dict(self) -> dict:
        return {
            "video_id": self.video_id,
            "url": self.url,
            "title": self.title,
            "author": self.author,
            "channel_id": self.channel_id,
            "duration": self.duration,
            "view_count": self.view_count,
            "publish_date": self.publish_date,
            "category": self.category,
            "is_live": self.is_live,
            "keywords": list(self.keywords),
            "description": self.description,
        }


@dataclass(frozen=True)
class Transcript:
    """A caption track downloaded and parsed for one video."""

    video: VideoMetadata
    track: TrackInfo
    segments: list[Segment]

    @property
    def text(self) -> str:
        return " ".join(segment.text for segment in self.segments if segment.text)

    def as_dict(self) -> dict:
        return {
            "video": self.video.as_dict(),
            "track": self.track.as_dict(),
            "segments": [segment.as_dict() for segment in self.segments],
        }

    def __len__(self) -> int:
        return len(self.segments)
