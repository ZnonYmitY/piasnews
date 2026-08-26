import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import update_hot_event_override as updater  # noqa: E402


class HotEventOverrideTest(unittest.TestCase):
    def test_normalizes_valid_editor_change(self):
        change = updater.normalize_change("evt-test-event", "draft", {
            "hot_word_zh": "Oscar 分享测试花絮",
            "hot_word_en": "Oscar shares a test clip",
            "source_labels": ["粉"],
            "heat": 72,
            "pinned_rank": "",
            "image_url": "https://example.com/image.jpg",
            "reason": "修正热点词并补充图片",
        }, "editor@example.com")
        self.assertEqual(change["status"], "draft")
        self.assertEqual(change["heat"], 72)
        self.assertIsNone(change["pinned_rank"])
        self.assertEqual(change["updated_by"], "editor@example.com")

    def test_rejects_non_https_media(self):
        with self.assertRaisesRegex(ValueError, "HTTPS"):
            updater.normalize_change("evt-test-event", "active", {
                "hot_word_zh": "Oscar 分享测试花絮",
                "source_labels": ["粉"],
                "image_url": "http://example.com/image.jpg",
                "reason": "补充图片",
            }, "publisher@example.com")

    def test_draft_preserves_active_until_published(self):
        active = {"event_id": "evt-test-event", "status": "active", "hot_word_zh": "线上标题"}
        draft = {"event_id": "evt-test-event", "status": "draft", "hot_word_zh": "草稿标题"}
        changes = updater.merge_change([active], draft)
        self.assertEqual({row["status"] for row in changes}, {"active", "draft"})

        published = {**draft, "status": "active"}
        changes = updater.merge_change(changes, published)
        self.assertEqual(changes, [published])

    def test_normalizes_per_content_media(self):
        change = updater.normalize_change("evt-test-content", "active", {
            "hot_word_zh": "Oscar 分享测试视频",
            "source_labels": ["粉"],
            "content_items": [{
                "item_id": "manual-video-1",
                "source_type": "fan",
                "source": "@fan",
                "title_zh": "Oscar 分享测试视频",
                "url": "https://x.com/fan/status/1",
                "video_url": "https://video.example.com/clip.mp4",
                "video_poster_url": "https://img.example.com/poster.jpg",
            }],
            "reason": "补充单条内容的视频和封面",
        }, "publisher@example.com")
        item = change["content_items"][0]
        self.assertEqual(item["video_url"], "https://video.example.com/clip.mp4")
        self.assertEqual(item["video_poster_url"], "https://img.example.com/poster.jpg")


if __name__ == "__main__":
    unittest.main()
