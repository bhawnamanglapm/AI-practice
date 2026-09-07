"""Video id extraction."""

import unittest

from youtube_transcript_extractor.errors import InvalidVideoURL
from youtube_transcript_extractor.urls import extract_video_id, is_video_id, watch_url

VIDEO_ID = "dQw4w9WgXcQ"


class ExtractVideoIdTests(unittest.TestCase):
    def test_accepts_every_common_url_shape(self):
        urls = [
            VIDEO_ID,
            "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            "http://youtube.com/watch?v=dQw4w9WgXcQ&list=PLxyz&index=2",
            "https://www.youtube.com/watch?app=desktop&v=dQw4w9WgXcQ",
            "https://youtu.be/dQw4w9WgXcQ",
            "https://youtu.be/dQw4w9WgXcQ?t=42&si=abc",
            "youtu.be/dQw4w9WgXcQ",
            "www.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://music.youtube.com/watch?v=dQw4w9WgXcQ",
            "https://www.youtube.com/shorts/dQw4w9WgXcQ",
            "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0",
            "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
            "https://www.youtube.com/live/dQw4w9WgXcQ",
            "https://www.youtube.com/v/dQw4w9WgXcQ",
            "  https://youtu.be/dQw4w9WgXcQ  ",
        ]
        for url in urls:
            with self.subTest(url=url):
                self.assertEqual(extract_video_id(url), VIDEO_ID)

    def test_rejects_non_youtube_and_malformed_input(self):
        for value in [
            "",
            "   ",
            "not a url",
            "https://vimeo.com/123456",
            "https://www.youtube.com/watch?v=tooshort",
            "https://www.youtube.com/channel/UC38IQsAvIsxxjztdMZQtwHA",
            "https://www.youtube.com/results?search_query=ai",
        ]:
            with self.subTest(value=value):
                with self.assertRaises(InvalidVideoURL):
                    extract_video_id(value)

    def test_is_video_id(self):
        self.assertTrue(is_video_id(VIDEO_ID))
        self.assertFalse(is_video_id("short"))
        self.assertFalse(is_video_id("dQw4w9WgXcQ!"))

    def test_watch_url(self):
        self.assertEqual(
            watch_url(VIDEO_ID), "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        )


if __name__ == "__main__":
    unittest.main()
