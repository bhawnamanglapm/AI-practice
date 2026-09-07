"""Command line interface: ``python -m youtube_transcript_extractor URL``."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from . import __version__
from .errors import ExtractorError
from .extractor import TranscriptExtractor, YouTubeClient
from .formats import FORMATS, render
from .models import Transcript
from .urls import extract_video_id

EXTENSIONS = {"txt": ".txt", "srt": ".srt", "vtt": ".vtt", "json": ".json", "md": ".md"}


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="youtube-transcript-extractor",
        description="Extract the transcript and content of YouTube videos.",
        epilog=(
            "examples:\n"
            "  %(prog)s https://youtu.be/dQw4w9WgXcQ\n"
            "  %(prog)s dQw4w9WgXcQ --format srt -o subs.srt\n"
            "  %(prog)s URL --languages hi,en --paragraphs --timestamps\n"
            "  %(prog)s URL --list-languages\n"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("videos", nargs="+", metavar="VIDEO", help="URL or video id")
    parser.add_argument(
        "-l",
        "--languages",
        default="en",
        help="comma separated language codes, best first (default: %(default)s)",
    )
    parser.add_argument(
        "-f",
        "--format",
        dest="fmt",
        choices=FORMATS,
        default="txt",
        help="output format (default: %(default)s)",
    )
    parser.add_argument(
        "-o",
        "--output",
        help="write to this file, or into this directory when it exists "
        "or several videos are given (default: stdout)",
    )
    parser.add_argument(
        "-t",
        "--timestamps",
        action="store_true",
        help="prefix each line with its start time (txt format)",
    )
    parser.add_argument(
        "-p",
        "--paragraphs",
        action="store_true",
        help="merge short cues into readable paragraphs",
    )
    parser.add_argument(
        "--width",
        type=int,
        default=0,
        help="wrap text output at this column (0 = no wrapping)",
    )
    parser.add_argument(
        "--translate",
        metavar="LANG",
        help="ask YouTube to machine-translate the transcript into LANG",
    )
    parser.add_argument(
        "--prefer-generated",
        action="store_true",
        help="prefer auto-generated captions over uploaded ones",
    )
    parser.add_argument(
        "--no-metadata",
        action="store_true",
        help="omit the title/channel/description header",
    )
    parser.add_argument(
        "--list-languages",
        action="store_true",
        help="list the available caption tracks and exit",
    )
    parser.add_argument(
        "--metadata-only",
        action="store_true",
        help="print the video's content details as JSON and exit",
    )
    parser.add_argument(
        "--timeout", type=float, default=20.0, help="HTTP timeout in seconds"
    )
    parser.add_argument("--proxy", help="HTTP(S) proxy URL")
    parser.add_argument(
        "-q", "--quiet", action="store_true", help="suppress progress messages"
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    extractor = TranscriptExtractor(
        YouTubeClient(timeout=args.timeout, proxy=args.proxy)
    )
    languages = [code.strip() for code in args.languages.split(",") if code.strip()]
    many = len(args.videos) > 1
    failures = 0

    for video in args.videos:
        try:
            if args.list_languages:
                _print_tracks(extractor, video)
                continue
            if args.metadata_only:
                metadata = extractor.metadata(video)
                print(json.dumps(metadata.as_dict(), indent=2, ensure_ascii=False))
                continue

            _log(args, f"fetching {video} ...")
            transcript = extractor.get_transcript(
                video,
                languages=languages,
                prefer_manual=not args.prefer_generated,
                translate_to=args.translate,
                paragraphs=args.paragraphs,
            )
            text = render(
                transcript,
                args.fmt,
                timestamps=args.timestamps,
                metadata=not args.no_metadata,
                width=args.width,
            )
            _emit(text, transcript, args, many)
        except ExtractorError as exc:
            failures += 1
            print(f"error: {exc}", file=sys.stderr)
        except OSError as exc:
            failures += 1
            print(f"error: could not write output: {exc}", file=sys.stderr)

    return 1 if failures else 0


def _emit(text: str, transcript: Transcript, args: argparse.Namespace, many: bool) -> None:
    if not args.output:
        sys.stdout.write(text)
        return

    destination = Path(args.output)
    if destination.is_dir() or many:
        destination.mkdir(parents=True, exist_ok=True)
        destination = destination / (
            _safe_name(transcript) + EXTENSIONS[args.fmt]
        )
    elif destination.parent != Path(""):
        destination.parent.mkdir(parents=True, exist_ok=True)

    destination.write_text(text, encoding="utf-8")
    _log(args, f"wrote {destination} ({len(transcript)} cues)")


def _safe_name(transcript: Transcript) -> str:
    """A filesystem-safe ``<title>-<video id>`` stem."""
    title = transcript.video.title or transcript.video.video_id
    slug = re.sub(r"[^0-9A-Za-z]+", "_", title).strip("_")[:80].strip("_")
    return f"{slug or 'transcript'}-{transcript.video.video_id}"


def _print_tracks(extractor: TranscriptExtractor, video: str) -> None:
    video_id = extract_video_id(video)
    tracks = extractor.list_tracks(video)
    if not tracks:
        print(f"{video_id}: no caption tracks")
        return
    print(f"{video_id}:")
    for track in tracks:
        flags = []
        if track.is_generated:
            flags.append("auto")
        if track.is_translatable:
            flags.append("translatable")
        suffix = f"  [{', '.join(flags)}]" if flags else ""
        print(f"  {track.language_code:<10} {track.language}{suffix}")


def _log(args: argparse.Namespace, message: str) -> None:
    if not args.quiet:
        print(message, file=sys.stderr)


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
