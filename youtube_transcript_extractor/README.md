# YouTube Content & Transcript Extractor

Pull the transcript **and** the descriptive content (title, channel, duration,
description, keywords) out of any YouTube video that has captions.

- **No dependencies.** Standard library only - no API key, no `pip install`.
- **No API quota.** It talks to the same public endpoints the website uses.
- **Five output formats:** `txt`, `srt`, `vtt`, `json`, `md`.
- **Usable as a CLI or as a library.**

## Install

Nothing to install - clone the repo and run it:

```bash
python -m youtube_transcript_extractor https://youtu.be/dQw4w9WgXcQ
```

Or install it to get the `yt-transcript` command on your `PATH`:

```bash
pip install -e .
yt-transcript https://youtu.be/dQw4w9WgXcQ
```

Requires Python 3.10+ and outbound access to `youtube.com`.

## Command line

```bash
# plain transcript with a metadata header
yt-transcript https://youtu.be/dQw4w9WgXcQ

# subtitles to a file
yt-transcript dQw4w9WgXcQ --format srt --output subs.srt

# readable paragraphs with clickable timestamps, as markdown
yt-transcript URL --paragraphs --format md --output notes.md

# Hindi if it exists, otherwise English
yt-transcript URL --languages hi,en

# what caption tracks does this video have?
yt-transcript URL --list-languages

# just the video's content details
yt-transcript URL --metadata-only

# machine-translate whatever track was found into German
yt-transcript URL --translate de

# several videos into one directory, named after their titles
yt-transcript URL1 URL2 URL3 --output transcripts/ --format md
```

### Options

| Option | Meaning |
| --- | --- |
| `-l, --languages` | Comma separated language codes, best first (default `en`). `en` also matches `en-GB`. |
| `-f, --format` | `txt`, `srt`, `vtt`, `json` or `md` (default `txt`). |
| `-o, --output` | File, or directory when it exists or several videos are given. Defaults to stdout. |
| `-t, --timestamps` | Prefix each text line with its start time. |
| `-p, --paragraphs` | Merge two-word auto-caption fragments into readable paragraphs. |
| `--width` | Wrap text output at this column. |
| `--translate LANG` | Ask YouTube to machine-translate the transcript. |
| `--prefer-generated` | Prefer auto-generated captions over uploaded ones. |
| `--no-metadata` | Drop the title/channel/description header. |
| `--list-languages` | List available caption tracks and exit. |
| `--metadata-only` | Print the video's content details as JSON and exit. |
| `--timeout`, `--proxy` | Network tuning. |

Exit status is `1` if any video failed; the others are still processed.

## Library

```python
from youtube_transcript_extractor import get_transcript, render

transcript = get_transcript("https://youtu.be/dQw4w9WgXcQ", ["en"], paragraphs=True)

print(transcript.video.title)          # "Learning AI: a short introduction"
print(transcript.video.duration)       # 213
print(transcript.track.label)          # "English (en)"
print(transcript.text)                 # the whole transcript as one string

for segment in transcript.segments:
    print(segment.start, segment.duration, segment.text)

open("notes.md", "w").write(render(transcript, "md"))
```

Other entry points:

```python
from youtube_transcript_extractor import (
    TranscriptExtractor, YouTubeClient, get_metadata, list_tracks,
)

get_metadata("dQw4w9WgXcQ")            # VideoMetadata, no captions needed
list_tracks("dQw4w9WgXcQ")             # [TrackInfo, ...]

# reuse one connection / route through a proxy
extractor = TranscriptExtractor(YouTubeClient(timeout=30, proxy="http://localhost:8080"))
extractor.get_transcript("dQw4w9WgXcQ", ["en"])
```

Errors all derive from `ExtractorError`: `InvalidVideoURL`, `VideoUnavailable`,
`NoTranscriptAvailable`, `LanguageNotAvailable`, `TranscriptParseError`,
`NetworkError`.

## How it works

1. **`urls.py`** turns a watch URL, `youtu.be` link, short, embed, live URL or
   bare id into an 11-character video id.
2. **`extractor.py`** asks YouTube's InnerTube `player` endpoint (web, then
   android, then ios client) for the *player response* JSON. If those fail it
   scrapes `ytInitialPlayerResponse` out of the watch page, using a brace
   scanner rather than a regex so braces inside strings don't break it.
3. The player response yields `videoDetails` (the content) and
   `captionTracks` (the transcripts). The best track is picked by language,
   falling back from `en-GB` to `en`, preferring human captions over
   auto-generated ones.
4. The track's `baseUrl` is fetched with `fmt=json3` and parsed by
   **`parsers.py`**, which also handles the legacy XML format, undoes
   YouTube's double HTML escaping, drops the duplicated rolling
   auto-caption events, and fills in missing cue durations.
5. **`formats.py`** renders the result.

## Tests

```bash
python -m unittest discover -s tests -t .
```

The suite runs entirely offline against recorded payloads in
`tests/fixtures/` - a player response, a `json3` caption document, a legacy
XML document and a watch page - so it never touches the network.

## Limits

- Only works on videos that actually have captions. Many music videos and
  small uploads have none, and YouTube does not auto-generate captions for
  every language.
- Unofficial: it depends on the shape of YouTube's own web payloads, which
  can change. When that happens the parsers in `extractor.py` are the place
  to look.
- Heavy automated use from one IP can get rate-limited or CAPTCHA'd; pass
  `--proxy` or slow down if that happens.
