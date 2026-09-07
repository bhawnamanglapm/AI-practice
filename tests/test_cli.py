"""Command line behaviour."""

import io
import json
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

from youtube_transcript_extractor import cli

from .test_extractor import StubClient


def run(argv, client=None):
    """Run the CLI with a stubbed HTTP client, capturing its output."""
    out, err = io.StringIO(), io.StringIO()
    with mock.patch.object(cli, "YouTubeClient", lambda **kwargs: client or StubClient()):
        with redirect_stdout(out), redirect_stderr(err):
            code = cli.main(argv)
    return code, out.getvalue(), err.getvalue()


class CliTests(unittest.TestCase):
    def test_prints_a_transcript_to_stdout(self):
        code, out, _ = run(["https://youtu.be/dQw4w9WgXcQ"])
        self.assertEqual(code, 0)
        self.assertIn("Learning AI: a short introduction", out)
        self.assertIn("Welcome to AI practice", out)

    def test_quiet_suppresses_progress_but_not_output(self):
        _, out, err = run(["dQw4w9WgXcQ", "--quiet"])
        self.assertEqual(err, "")
        self.assertIn("Welcome to AI practice", out)

    def test_format_and_no_metadata(self):
        _, out, _ = run(["dQw4w9WgXcQ", "-f", "srt", "--no-metadata", "-q"])
        self.assertTrue(out.startswith("1\n00:00:00,040 --> "))

    def test_json_format(self):
        _, out, _ = run(["dQw4w9WgXcQ", "-f", "json", "-q"])
        document = json.loads(out)
        self.assertEqual(len(document["segments"]), 4)

    def test_list_languages(self):
        _, out, _ = run(["dQw4w9WgXcQ", "--list-languages"])
        self.assertIn("en", out)
        self.assertIn("Hindi", out)
        self.assertIn("[auto, translatable]", out)

    def test_metadata_only(self):
        _, out, _ = run(["dQw4w9WgXcQ", "--metadata-only"])
        self.assertEqual(json.loads(out)["duration"], 213)

    def test_writes_to_a_file(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "nested" / "subs.vtt"
            code, out, _ = run(["dQw4w9WgXcQ", "-f", "vtt", "-o", str(target), "-q"])
            self.assertEqual(code, 0)
            self.assertEqual(out, "")
            self.assertTrue(target.read_text().startswith("WEBVTT"))

    def test_several_videos_write_named_files_into_a_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "out"
            code, _, _ = run(["dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ", "-o", str(target), "-q"])
            self.assertEqual(code, 0)
            written = list(target.iterdir())
            self.assertEqual(len(written), 1)
            self.assertEqual(
                written[0].name, "Learning_AI_a_short_introduction-dQw4w9WgXcQ.txt"
            )

    def test_invalid_url_reports_an_error_and_exits_nonzero(self):
        code, out, err = run(["https://vimeo.com/1"])
        self.assertEqual(code, 1)
        self.assertEqual(out, "")
        self.assertIn("could not find a YouTube video id", err)

    def test_one_bad_video_does_not_stop_the_others(self):
        code, out, err = run(["nope", "dQw4w9WgXcQ", "-q"])
        self.assertEqual(code, 1)
        self.assertIn("Welcome to AI practice", out)
        self.assertIn("error:", err)


if __name__ == "__main__":
    unittest.main()
