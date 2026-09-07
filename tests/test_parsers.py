"""Caption payload parsing."""

import unittest
from pathlib import Path

from youtube_transcript_extractor.errors import TranscriptParseError
from youtube_transcript_extractor.models import Segment
from youtube_transcript_extractor.parsers import (
    clean_text,
    group_paragraphs,
    parse_json3,
    parse_transcript,
    parse_xml,
)

FIXTURES = Path(__file__).parent / "fixtures"
EXPECTED_TEXT = [
    "Welcome to AI practice",
    "it's a short introduction",
    "to what models can do",
    "thanks for watching",
]


class CleanTextTests(unittest.TestCase):
    def test_undoes_double_escaping(self):
        self.assertEqual(clean_text("it&amp;#39;s"), "it's")
        self.assertEqual(clean_text("a &amp;amp; b"), "a & b")

    def test_collapses_whitespace(self):
        self.assertEqual(clean_text("  two\n  lines  "), "two lines")
        self.assertEqual(clean_text("two\nlines", keep_newlines=True), "two\nlines")


class Json3Tests(unittest.TestCase):
    def setUp(self):
        self.segments = parse_json3((FIXTURES / "captions.json3").read_text())

    def test_skips_window_append_and_blank_events(self):
        self.assertEqual([s.text for s in self.segments], EXPECTED_TEXT)

    def test_converts_milliseconds_to_seconds(self):
        self.assertAlmostEqual(self.segments[0].start, 0.04)
        self.assertAlmostEqual(self.segments[0].duration, 2.96)
        self.assertAlmostEqual(self.segments[0].end, 3.0)

    def test_fills_a_missing_duration_from_the_next_cue(self):
        # The "to what models can do" event has no dDurationMs.
        self.assertAlmostEqual(self.segments[2].start, 8.0)
        self.assertAlmostEqual(self.segments[2].duration, 3.5)

    def test_rejects_malformed_payloads(self):
        with self.assertRaises(TranscriptParseError):
            parse_json3("{not json")
        with self.assertRaises(TranscriptParseError):
            parse_json3('{"noEvents": true}')


class XmlTests(unittest.TestCase):
    def setUp(self):
        self.segments = parse_xml((FIXTURES / "captions.xml").read_text())

    def test_parses_the_legacy_format(self):
        self.assertEqual([s.text for s in self.segments], EXPECTED_TEXT)
        self.assertAlmostEqual(self.segments[1].start, 3.0)
        self.assertAlmostEqual(self.segments[1].duration, 2.5)

    def test_rejects_malformed_payloads(self):
        with self.assertRaises(TranscriptParseError):
            parse_xml("<transcript><text>unclosed")


class SniffingTests(unittest.TestCase):
    def test_detects_the_format(self):
        json3 = parse_transcript((FIXTURES / "captions.json3").read_text())
        xml = parse_transcript((FIXTURES / "captions.xml").read_text())
        self.assertEqual([s.text for s in json3], [s.text for s in xml])

    def test_rejects_unknown_payloads(self):
        for payload in ["", "   ", "plain text"]:
            with self.assertRaises(TranscriptParseError):
                parse_transcript(payload)


class ParagraphTests(unittest.TestCase):
    def test_merges_cues_until_a_pause(self):
        segments = [
            Segment(0.0, 1.0, "one"),
            Segment(1.0, 1.0, "two"),
            Segment(9.0, 1.0, "far later"),
        ]
        merged = group_paragraphs(segments, max_gap=2.0)
        self.assertEqual([s.text for s in merged], ["one two", "far later"])
        self.assertAlmostEqual(merged[0].duration, 2.0)

    def test_splits_on_length(self):
        segments = [Segment(float(i), 1.0, "word" * 5) for i in range(10)]
        merged = group_paragraphs(segments, max_gap=5.0, max_chars=40)
        self.assertGreater(len(merged), 1)

    def test_handles_no_segments(self):
        self.assertEqual(group_paragraphs([]), [])


if __name__ == "__main__":
    unittest.main()
