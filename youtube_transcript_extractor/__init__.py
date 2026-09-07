"""Extract the content and transcript of a YouTube video.

Typical use::

    from youtube_transcript_extractor import get_transcript, render

    transcript = get_transcript("https://youtu.be/dQw4w9WgXcQ", ["en"])
    print(render(transcript, "md"))

Everything runs on the Python standard library - no API key, no extra
packages.
"""

from .errors import (
    ExtractorError,
    InvalidVideoURL,
    LanguageNotAvailable,
    NetworkError,
    NoTranscriptAvailable,
    TranscriptParseError,
    VideoUnavailable,
)
from .extractor import TranscriptExtractor, YouTubeClient
from .formats import FORMATS, render
from .models import Segment, TrackInfo, Transcript, VideoMetadata
from .urls import extract_video_id, is_video_id, watch_url

__version__ = "1.0.0"

__all__ = [
    "ExtractorError",
    "FORMATS",
    "InvalidVideoURL",
    "LanguageNotAvailable",
    "NetworkError",
    "NoTranscriptAvailable",
    "Segment",
    "TrackInfo",
    "Transcript",
    "TranscriptExtractor",
    "TranscriptParseError",
    "VideoMetadata",
    "VideoUnavailable",
    "YouTubeClient",
    "__version__",
    "extract_video_id",
    "get_metadata",
    "get_transcript",
    "is_video_id",
    "list_tracks",
    "render",
    "watch_url",
]


def get_transcript(video: str, languages: list[str] | None = None, **options):
    """Convenience wrapper around :meth:`TranscriptExtractor.get_transcript`."""
    return TranscriptExtractor().get_transcript(video, languages, **options)


def get_metadata(video: str) -> VideoMetadata:
    """Convenience wrapper around :meth:`TranscriptExtractor.metadata`."""
    return TranscriptExtractor().metadata(video)


def list_tracks(video: str) -> list[TrackInfo]:
    """Convenience wrapper around :meth:`TranscriptExtractor.list_tracks`."""
    return TranscriptExtractor().list_tracks(video)
