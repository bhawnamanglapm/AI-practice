"""Exceptions raised by the extractor."""


class ExtractorError(Exception):
    """Base class for every error raised by this package."""


class InvalidVideoURL(ExtractorError):
    """The given string is not a YouTube URL or video id."""

    def __init__(self, value: str) -> None:
        super().__init__(f"could not find a YouTube video id in {value!r}")
        self.value = value


class VideoUnavailable(ExtractorError):
    """YouTube refused to describe the video (private, deleted, geo-blocked...)."""

    def __init__(self, video_id: str, reason: str) -> None:
        super().__init__(f"video {video_id} is unavailable: {reason}")
        self.video_id = video_id
        self.reason = reason


class NoTranscriptAvailable(ExtractorError):
    """The video exists but carries no caption track at all."""

    def __init__(self, video_id: str) -> None:
        super().__init__(
            f"video {video_id} has no captions - neither uploaded nor auto-generated"
        )
        self.video_id = video_id


class LanguageNotAvailable(ExtractorError):
    """No caption track matches the requested languages."""

    def __init__(self, video_id: str, wanted: list[str], available: list[str]) -> None:
        super().__init__(
            f"video {video_id} has no transcript in {wanted}; "
            f"available: {available or ['<none>']}"
        )
        self.video_id = video_id
        self.wanted = wanted
        self.available = available


class TranscriptParseError(ExtractorError):
    """The caption payload could not be understood."""


class NetworkError(ExtractorError):
    """A request to YouTube failed."""
