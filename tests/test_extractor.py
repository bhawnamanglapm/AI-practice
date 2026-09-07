"""Extractor logic, exercised against recorded payloads instead of YouTube."""

import json
import unittest
from pathlib import Path

from youtube_transcript_extractor.errors import (
    LanguageNotAvailable,
    NetworkError,
    NoTranscriptAvailable,
    VideoUnavailable,
)
from youtube_transcript_extractor.extractor import (
    TranscriptExtractor,
    extract_json_object,
    parse_metadata,
    parse_tracks,
    select_track,
)
from youtube_transcript_extractor.models import TrackInfo

FIXTURES = Path(__file__).parent / "fixtures"
PLAYER = json.loads((FIXTURES / "player_response.json").read_text())
CAPTIONS = (FIXTURES / "captions.json3").read_text()
WATCH_PAGE = (FIXTURES / "watch_page.html").read_text()


class StubClient:
    """Stands in for :class:`YouTubeClient`, recording the URLs requested."""

    def __init__(self, player=PLAYER, captions=CAPTIONS, page=WATCH_PAGE):
        self.player = player
        self.captions = captions
        self.page = page
        self.requested: list[str] = []

    def post_json(self, url, payload, headers):
        self.requested.append(url)
        if isinstance(self.player, Exception):
            raise self.player
        return self.player

    def get(self, url, headers=None):
        self.requested.append(url)
        if "timedtext" in url:
            return self.captions
        if isinstance(self.page, Exception):
            raise self.page
        return self.page


class MetadataTests(unittest.TestCase):
    def test_reads_video_details_and_microformat(self):
        metadata = parse_metadata(PLAYER, "dQw4w9WgXcQ")
        self.assertEqual(metadata.title, "Learning AI: a short introduction")
        self.assertEqual(metadata.author, "AI Practice")
        self.assertEqual(metadata.duration, 213)
        self.assertEqual(metadata.view_count, 1465238)
        self.assertEqual(metadata.publish_date, "2024-03-05")
        self.assertEqual(metadata.category, "Education")
        self.assertEqual(metadata.keywords, ["ai", "machine learning"])
        self.assertIn("A practice video", metadata.description)
        self.assertEqual(metadata.url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ")

    def test_survives_a_bare_player_response(self):
        metadata = parse_metadata({}, "dQw4w9WgXcQ")
        self.assertEqual(metadata.video_id, "dQw4w9WgXcQ")
        self.assertEqual(metadata.title, "")
        self.assertEqual(metadata.duration, 0)


class TrackTests(unittest.TestCase):
    def setUp(self):
        self.tracks = parse_tracks(PLAYER)

    def test_reads_every_track_including_run_style_names(self):
        self.assertEqual(
            [(t.language_code, t.is_generated) for t in self.tracks],
            [("en", False), ("en", True), ("hi", False), ("pt-BR", False)],
        )
        self.assertEqual(self.tracks[1].language, "English (auto-generated)")

    def test_label(self):
        self.assertEqual(self.tracks[1].label, "English (auto-generated) (en) - auto-generated")

    def test_prefers_manual_over_auto_generated(self):
        chosen = select_track(self.tracks, ["en"])
        self.assertFalse(chosen.is_generated)

    def test_prefer_generated_flips_the_choice(self):
        chosen = select_track(self.tracks, ["en"], prefer_manual=False)
        self.assertTrue(chosen.is_generated)

    def test_language_order_is_respected(self):
        self.assertEqual(select_track(self.tracks, ["hi", "en"]).language_code, "hi")
        self.assertEqual(select_track(self.tracks, ["de", "hi"]).language_code, "hi")

    def test_falls_back_to_the_base_language(self):
        self.assertEqual(select_track(self.tracks, ["pt"]).language_code, "pt-BR")
        self.assertEqual(select_track(self.tracks, ["en-GB"]).language_code, "en")

    def test_returns_nothing_when_no_language_matches(self):
        self.assertIsNone(select_track(self.tracks, ["ja"]))
        self.assertIsNotNone(select_track(self.tracks, ["ja"], allow_any=True))


class JsonScannerTests(unittest.TestCase):
    def test_stops_at_the_matching_brace(self):
        text = 'x = {"a": {"b": 1}} ; more'
        self.assertEqual(extract_json_object(text, 4), '{"a": {"b": 1}}')

    def test_ignores_braces_and_quotes_inside_strings(self):
        text = r'{"a": "} \" {", "b": 2}'
        self.assertEqual(extract_json_object(text, 0), text)

    def test_rejects_unbalanced_input(self):
        with self.assertRaises(Exception):
            extract_json_object('{"a": 1', 0)


class GetTranscriptTests(unittest.TestCase):
    def setUp(self):
        self.client = StubClient()
        self.extractor = TranscriptExtractor(self.client)

    def test_end_to_end(self):
        transcript = self.extractor.get_transcript("https://youtu.be/dQw4w9WgXcQ")
        self.assertEqual(transcript.video.title, "Learning AI: a short introduction")
        self.assertEqual(transcript.track.language_code, "en")
        self.assertFalse(transcript.track.is_generated)
        self.assertEqual(len(transcript), 4)
        self.assertTrue(transcript.text.startswith("Welcome to AI practice it's"))

    def test_requests_json3_captions(self):
        self.extractor.get_transcript("dQw4w9WgXcQ")
        timedtext = [url for url in self.client.requested if "timedtext" in url][0]
        self.assertIn("fmt=json3", timedtext)
        self.assertIn("lang=en", timedtext)

    def test_translation_adds_tlang_and_marks_the_track(self):
        transcript = self.extractor.get_transcript("dQw4w9WgXcQ", translate_to="fr")
        timedtext = [url for url in self.client.requested if "timedtext" in url][0]
        self.assertIn("tlang=fr", timedtext)
        self.assertEqual(transcript.track.language_code, "fr")
        self.assertEqual(transcript.track.translated_from, "en")

    def test_paragraph_grouping(self):
        transcript = self.extractor.get_transcript("dQw4w9WgXcQ", paragraphs=True)
        self.assertLess(len(transcript), 4)

    def test_unknown_language(self):
        with self.assertRaises(LanguageNotAvailable) as caught:
            self.extractor.get_transcript("dQw4w9WgXcQ", languages=["ja"])
        self.assertIn("hi", caught.exception.available)

    def test_video_without_captions(self):
        player = {"playabilityStatus": {"status": "OK"}, "videoDetails": {}}
        extractor = TranscriptExtractor(StubClient(player=player, page="<html></html>"))
        with self.assertRaises(NoTranscriptAvailable):
            extractor.get_transcript("dQw4w9WgXcQ")

    def test_unplayable_video(self):
        player = {
            "playabilityStatus": {"status": "LOGIN_REQUIRED", "reason": "Sign in"},
        }
        extractor = TranscriptExtractor(StubClient(player=player, page="<html></html>"))
        with self.assertRaises(VideoUnavailable) as caught:
            extractor.get_transcript("dQw4w9WgXcQ")
        self.assertIn("LOGIN_REQUIRED", str(caught.exception))

    def test_falls_back_to_the_watch_page_when_innertube_fails(self):
        client = StubClient(player=NetworkError("innertube is down"))
        transcript = TranscriptExtractor(client).get_transcript("dQw4w9WgXcQ")
        self.assertEqual(transcript.video.title, "Learning AI: a short introduction")
        self.assertIn("Braces {like this}", transcript.video.description)
        self.assertEqual(len(transcript), 4)

    def test_reports_every_failed_strategy(self):
        client = StubClient(
            player=NetworkError("innertube is down"), page=NetworkError("page is down")
        )
        with self.assertRaises(NetworkError) as caught:
            TranscriptExtractor(client).get_transcript("dQw4w9WgXcQ")
        message = str(caught.exception)
        self.assertIn("innertube/web", message)
        self.assertIn("innertube/android", message)
        self.assertIn("watch page", message)

    def test_a_parse_failure_still_reports_the_video_as_unavailable(self):
        client = StubClient(player=NetworkError("down"), page="<html>no player</html>")
        with self.assertRaises(VideoUnavailable):
            TranscriptExtractor(client).get_transcript("dQw4w9WgXcQ")

    def test_list_tracks_and_metadata_helpers(self):
        self.assertEqual(len(self.extractor.list_tracks("dQw4w9WgXcQ")), 4)
        self.assertEqual(self.extractor.metadata("dQw4w9WgXcQ").duration, 213)




class NetworkFailureTests(unittest.TestCase):
    def test_a_total_network_outage_is_not_reported_as_a_missing_video(self):
        client = StubClient(
            player=NetworkError("connection refused"),
            page=NetworkError("connection refused"),
        )
        with self.assertRaises(NetworkError) as caught:
            TranscriptExtractor(client).get_transcript("dQw4w9WgXcQ")
        self.assertIn("could not reach YouTube", str(caught.exception))

if __name__ == "__main__":
    unittest.main()
