import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import notify_feishu_daily as notify  # noqa: E402


def write_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


class FeishuDailyNotificationTest(unittest.TestCase):
    def test_daily_update_text_labels_translation_changes(self):
        text = notify.build_daily_update_text({
            "changed_files": [{"label": "新闻数据"}],
            "sections": {
                "news": {
                    "new_count": 2,
                    "removed_count": 1,
                    "changed_count": 3,
                    "current_count": 8,
                    "count_delta": 1,
                    "latest": {"title": "新闻 A"},
                },
                "social": {
                    "new_count": 0,
                    "removed_count": 0,
                    "changed_count": 0,
                    "current_count": 23,
                    "count_delta": 0,
                    "latest": {"title": "粉丝源 B"},
                },
            },
            "page_url": "https://example.com/",
        })

        self.assertIn("Piasnews 每日更新｜过去24小时", text)
        self.assertIn("内容/翻译变更 3 条", text)
        self.assertIn("较昨日 +1", text)
        self.assertIn("当前保留 23 条", text)

    def test_hot_ranking_preserves_rank_and_uses_anchor_link(self):
        payload = {
            "events": [
                {
                    "rank": 2,
                    "hot_word_zh": "第二条",
                    "source_labels": ["粉"],
                    "heat": 21,
                    "anchor_item_id": "b",
                    "items": [{"item_id": "b", "url": "https://example.com/b"}],
                },
                {
                    "rank": 1,
                    "hot_word_zh": "第一条",
                    "source_labels": ["官", "媒"],
                    "heat": 35,
                    "anchor_item_id": "a2",
                    "items": [
                        {"item_id": "a1", "url": "https://example.com/a1"},
                        {"item_id": "a2", "url": "https://example.com/a2"},
                    ],
                },
                {"rank": 3, "hot_word_zh": "隐藏", "hidden": True, "items": []},
            ]
        }

        text = notify.build_hot_ranking_text(payload, "https://example.com/")

        self.assertLess(text.index("1. [官/媒] 第一条"), text.index("2. [粉] 第二条"))
        self.assertIn("https://example.com/a2", text)
        self.assertNotIn("https://example.com/a1", text)
        self.assertNotIn("隐藏", text)

    def test_main_sends_exactly_two_messages(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            before = Path(tmpdir) / "before"
            current = Path(tmpdir) / "current"
            write_json(before / "items.json", {"items": []})
            write_json(before / "social.json", {"items": []})
            write_json(current / "items.json", {"items": [{"id": "n1", "title": "News"}]})
            write_json(current / "social.json", {"items": []})
            hot = Path(tmpdir) / "hot.json"
            write_json(hot, {"events": []})

            with mock.patch.object(notify, "post_feishu_text") as post:
                result = notify.main([
                    "--before-dir", str(before),
                    "--data-dir", str(current),
                    "--hot-events", str(hot),
                    "--webhook-url", "https://example.com/webhook",
                ])

        self.assertEqual(result, 0)
        self.assertEqual(post.call_count, 2)
        self.assertTrue(post.call_args_list[0].args[1].startswith("Piasnews 每日更新"))
        self.assertTrue(post.call_args_list[1].args[1].startswith("Piasnews 今日热榜"))


if __name__ == "__main__":
    unittest.main()
