import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import notify_feishu_refresh as notify  # noqa: E402


class _MockResponse:
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self):
        return b'{"StatusCode":0}'


def write_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


class FeishuRefreshNotificationTest(unittest.TestCase):
    def test_collection_compare_counts_new_and_changed_items(self):
        before = {
            "generated_at": "2026-07-13T00:00:00Z",
            "items": [
                {"id": "a", "title": "Old title", "published_at": "2026-07-12T00:00:00Z"},
            ],
        }
        current = {
            "generated_at": "2026-07-13T06:00:00Z",
            "items": [
                {"id": "a", "title": "Updated title", "published_at": "2026-07-12T00:00:00Z"},
                {"id": "b", "title": "New title", "published_at": "2026-07-13T06:00:00Z"},
            ],
        }

        result = notify.compare_collection(before, current)

        self.assertTrue(result["changed"])
        self.assertEqual(result["new_count"], 1)
        self.assertEqual(result["changed_count"], 1)
        self.assertEqual(result["current_count"], 2)
        self.assertEqual(result["latest"]["title"], "New title")

    def test_generated_at_only_change_does_not_mark_file_changed(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            before = Path(tmpdir) / "before"
            current = Path(tmpdir) / "current"
            write_json(before / "calendar.json", {"generated_at": "old", "races": [{"name": "A"}]})
            write_json(current / "calendar.json", {"generated_at": "new", "races": [{"name": "A"}]})

            self.assertFalse(notify.compare_json_file(before, current, "calendar.json"))

    def test_build_summary_tracks_news_social_and_calendar_changes(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            before = Path(tmpdir) / "before"
            current = Path(tmpdir) / "current"
            write_json(before / "items.json", {"items": [{"id": "old", "title": "Old"}]})
            write_json(current / "items.json", {"items": [{"id": "old", "title": "Old"}, {"id": "new", "title": "New"}]})
            write_json(before / "social.json", {"items": []})
            write_json(current / "social.json", {"items": [{"id": "s1", "title": "Social", "published_at": "2026-07-13T01:00:00Z"}]})
            write_json(before / "calendar.json", {"races": [{"name": "A"}]})
            write_json(current / "calendar.json", {"races": [{"name": "B"}]})

            summary = notify.build_summary(before, current, page_url="https://example.com/", repo="owner/repo", run_id="123")

        self.assertTrue(summary["has_changes"])
        self.assertEqual(summary["sections"]["news"]["new_count"], 1)
        self.assertEqual(summary["sections"]["social"]["new_count"], 1)
        labels = {item["label"] for item in summary["changed_files"]}
        self.assertIn("新闻数据", labels)
        self.assertIn("粉丝源", labels)
        self.assertIn("F1 赛历", labels)
        self.assertEqual(summary["run_url"], "https://github.com/owner/repo/actions/runs/123")

    def test_build_text_contains_separate_refresh_language(self):
        text = notify.build_text({
            "changed_files": [{"label": "新闻数据"}, {"label": "粉丝源"}],
            "sections": {
                "news": {"new_count": 2, "changed_count": 0, "current_count": 5, "latest": {"title": "新闻 A"}},
                "social": {"new_count": 1, "changed_count": 0, "current_count": 3, "latest": {"title": "粉丝源 B"}},
            },
            "page_url": "https://znonymity.github.io/piasnews/",
            "run_url": "https://github.com/ZnonYmitY/piasnews/actions/runs/1",
        })

        self.assertIn("Piasnews 网页信息刷新", text)
        self.assertIn("新闻数据：新增 2 条", text)
        self.assertIn("粉丝源：新增 1 条", text)
        self.assertIn("https://znonymity.github.io/piasnews/", text)

    def test_post_feishu_text(self):
        with mock.patch("urllib.request.urlopen", return_value=_MockResponse()) as mocked_urlopen:
            notify.post_feishu_text("https://example.com/webhook", "hello")

        request = mocked_urlopen.call_args.args[0]
        payload = json.loads(request.data.decode("utf-8"))
        self.assertEqual(payload["msg_type"], "text")
        self.assertEqual(payload["content"]["text"], "hello")


if __name__ == "__main__":
    unittest.main()
