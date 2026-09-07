"""Entry point for ``python -m youtube_transcript_extractor``."""

from .cli import main

if __name__ == "__main__":
    raise SystemExit(main())
