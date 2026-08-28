import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import validate_social_media as validator  # noqa: E402


class ValidateSocialMediaTest(unittest.TestCase):
    def test_rejects_media_removed_from_same_retained_url(self):
        before = [{
            "url": "https://x.com/a/status/1",
            "video_url": "https://video.example.com/1.mp4",
            "video_poster_url": "https://img.example.com/1.jpg",
        }]
        after = [{"url": "https://x.com/a/status/1"}]

        result = validator.audit(before, after)

        self.assertEqual(result["before_media_items"], 1)
        self.assertEqual(result["after_media_items"], 0)
        self.assertEqual(result["stripped_items"], [{
            "url": "https://x.com/a/status/1",
            "fields": ["video_poster_url", "video_url"],
        }])

    def test_allows_media_item_to_leave_retention_window(self):
        before = [{
            "url": "https://x.com/a/status/old",
            "image_url": "https://img.example.com/old.jpg",
        }]
        after = [{"url": "https://x.com/a/status/new"}]

        result = validator.audit(before, after)

        self.assertEqual(result["stripped_items"], [])

    def test_allows_media_to_be_added_or_preserved(self):
        before = [{
            "url": "https://x.com/a/status/1",
            "image_url": "https://img.example.com/1.jpg",
        }]
        after = [{
            "url": "https://x.com/a/status/1",
            "image_url": "https://img.example.com/1.jpg",
            "video_url": "https://video.example.com/1.mp4",
        }]

        result = validator.audit(before, after)

        self.assertEqual(result["stripped_items"], [])
        self.assertEqual(result["retained_media_items"], 1)


if __name__ == "__main__":
    unittest.main()
