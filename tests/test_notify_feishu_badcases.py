import csv
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import notify_feishu_badcases as notify  # noqa: E402


class _MockResponse:
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self):
        return b'{"StatusCode":0}'



class FeishuBadcaseNotificationTest(unittest.TestCase):
    def test_public_file_url(self):
        self.assertEqual(
            notify.public_file_url("https://example.github.io/piasnews/", "translation_candidates_latest.xlsx"),
            "https://example.github.io/piasnews/data/translation_candidates_latest.xlsx",
        )

    def test_load_rows_empty_when_file_missing(self):
        self.assertEqual(notify.load_rows("/tmp/not-a-real-piasnews-file.csv"), [])

    def test_build_text_contains_count_preview_and_links(self):
        text = notify.build_text(
            [{
                "source": "GPToday.net",
                "error_type": "semantic_term",
                "source_text": "Webber preparing Red Bull move for Piastri",
            }],
            page_url="https://example.github.io/piasnews/",
            repo="ZnonYmitY/piasnews",
            run_id="123",
        )

        self.assertIn("本轮新增候选：1 条", text)
        self.assertIn("Webber preparing Red Bull move for Piastri", text)
        self.assertIn("translation_candidates_latest.xlsx", text)
        self.assertIn("https://github.com/ZnonYmitY/piasnews/actions/runs/123", text)

    def test_post_feishu_text(self):
        with mock.patch("urllib.request.urlopen", return_value=_MockResponse()) as mocked_urlopen:
            notify.post_feishu_text("https://example.com/webhook", "hello")

        request = mocked_urlopen.call_args.args[0]
        payload = json.loads(request.data.decode("utf-8"))
        self.assertEqual(payload["msg_type"], "text")
        self.assertEqual(payload["content"]["text"], "hello")

    def test_main_skips_empty_rows_without_webhook(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            latest_csv = Path(tmpdir) / "latest.csv"
            with latest_csv.open("w", newline="", encoding="utf-8") as handle:
                writer = csv.DictWriter(handle, fieldnames=["source"])
                writer.writeheader()
            args = type("Args", (), {
                "latest_csv": str(latest_csv),
                "webhook_url": "",
                "page_url": "",
                "repo": "",
                "run_id": "",
                "always": False,
            })()

            rows = notify.load_rows(args.latest_csv)

        self.assertEqual(rows, [])


if __name__ == "__main__":
    unittest.main()
