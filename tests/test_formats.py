"""Rendering to txt/srt/vtt/json/md."""

import json
import unittest

from youtube_transcript_extractor.formats import (
    format_clock,
    format_timestamp,
    render,
)
from youtube_transcript_extractor.models import Segment, TrackInfo, Transcript, VideoMetadata

TRANSCRIPT = Transcript(
    video=VideoMetadata(
        video_id="dQw4w9WgXcQ",
        title="Learning AI",
        author="AI Practice",
        duration=213,
        description="A practice video.",
        view_count=1465238,
        publish_date="2024-03-05",
    ),
    track=TrackInfo("en", "English", is_generated=False),
    segments=[
        Segment(0.04, 2.96, "Welcome to AI practice"),
        Segment(3.0, 2.5, "it's a short introduction"),
        Segment(3661.5, 3.0, "thanks for watching"),
    ],
)


class TimestampTests(unittest.TestCase):
    def test_srt_and_vtt_stamps(self):
        self.assertEqual(format_timestamp(0.04), "00:00:00,040")
        self.assertEqual(format_timestamp(3661.5, separator="."), "01:01:01.500")

    def test_clock(self):
        self.assertEqual(format_clock(0), "0:00")
        self.assertEqual(format_clock(65), "1:05")
        self.assertEqual(format_clock(3661), "1:01:01")


class RenderTests(unittest.TestCase):
    def test_txt_includes_metadata_header_by_default(self):
        text = render(TRANSCRIPT, "txt")
        self.assertIn("Learning AI", text)
        self.assertIn("Channel: AI Practice", text)
        self.assertIn("Welcome to AI practice", text)

    def test_txt_without_metadata_is_only_the_words(self):
        text = render(TRANSCRIPT, "txt", metadata=False)
        self.assertNotIn("Channel:", text)
        self.assertTrue(text.startswith("Welcome to AI practice"))

    def test_txt_timestamps_and_wrapping(self):
        text = render(TRANSCRIPT, "txt", metadata=False, timestamps=True, width=20)
        self.assertTrue(text.startswith("[0:00] Welcome to"))
        self.assertIn("[1:01:01]", text)
        self.assertTrue(all(len(line) <= 20 for line in text.splitlines()))

    def test_srt_is_numbered_and_uses_commas(self):
        text = render(TRANSCRIPT, "srt")
        self.assertTrue(text.startswith("1\n00:00:00,040 --> 00:00:03,000\n"))
        self.assertIn("3\n01:01:01,500 --> 01:01:04,500", text)

    def test_vtt_has_a_header_and_uses_dots(self):
        text = render(TRANSCRIPT, "vtt")
        self.assertTrue(text.startswith("WEBVTT\n"))
        self.assertIn("00:00:03.000 --> 00:00:05.500", text)

    def test_json_round_trips(self):
        document = json.loads(render(TRANSCRIPT, "json"))
        self.assertEqual(document["video"]["video_id"], "dQw4w9WgXcQ")
        self.assertEqual(document["track"]["language_code"], "en")
        self.assertEqual(len(document["segments"]), 3)
        self.assertEqual(document["segments"][0]["start"], 0.04)
        self.assertTrue(document["text"].startswith("Welcome to AI practice it's"))

    def test_markdown_links_timestamps_to_the_video(self):
        text = render(TRANSCRIPT, "md")
        self.assertIn("# Learning AI", text)
        self.assertIn("- **Channel:** AI Practice", text)
        self.assertIn("## Transcript", text)
        self.assertIn(
            "**[0:00](https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=0s)** "
            "Welcome to AI practice",
            text,
        )

    def test_unknown_format(self):
        with self.assertRaises(ValueError):
            render(TRANSCRIPT, "pdf")


if __name__ == "__main__":
    unittest.main()
