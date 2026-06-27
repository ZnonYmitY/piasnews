import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import fetch_social_sources as collector  # noqa: E402


SOURCES_PATH = ROOT / "piasnews" / "references" / "x-sources.json"
NOW = "2026-06-27T08:00:00Z"


class SocialSourcesTest(unittest.TestCase):
    def test_main_writes_empty_payload_without_x_token(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "social.json"
            argv = [
                "fetch_social_sources.py",
                "--sources",
                str(SOURCES_PATH),
                "--output",
                str(output),
                "--now",
                NOW,
            ]
            with patch.object(sys, "argv", argv), patch.dict("os.environ", {}, clear=True):
                self.assertEqual(collector.main(), 0)

            payload = json.loads(output.read_text())
            self.assertEqual(payload["total_items"], 0)
            self.assertEqual(payload["items"], [])
            self.assertIn("source_status", payload)
            self.assertEqual(payload["source_status"][0]["stage"], "x_api")

    def test_import_keeps_recent_relevant_social_item(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            import_path = Path(tmpdir) / "import.json"
            import_path.write_text(json.dumps({
                "items": [
                    {
                        "platform": "x",
                        "handle": "PiastriNews",
                        "id": "123",
                        "text": "Oscar Piastri and McLaren updates from the paddock.",
                        "created_at": "2026-06-26T10:00:00Z",
                        "kind": "post",
                    },
                    {
                        "platform": "x",
                        "handle": "PiastriNews",
                        "id": "old",
                        "text": "Oscar Piastri older item.",
                        "created_at": "2026-06-20T10:00:00Z",
                    },
                    {
                        "platform": "x",
                        "handle": "PiastriNews",
                        "id": "noise",
                        "text": "Unrelated post without the target terms.",
                        "created_at": "2026-06-26T11:00:00Z",
                    },
                ]
            }))

            sources = collector.load_sources(SOURCES_PATH)
            now = collector.parse_now(NOW)
            cutoff = now - collector.timedelta(days=3)
            items, status = collector.normalize_import(import_path, sources, now, cutoff)

            self.assertEqual(status["items"], 1)
            self.assertEqual(status["skipped"], 2)
            self.assertEqual(items[0]["source"], "@PiastriNews")
            self.assertEqual(items[0]["url"], "https://x.com/PiastriNews/status/123")
            self.assertEqual(items[0]["category"], "fan")
            self.assertEqual(items[0]["attribution_zh"], "引用自 @PiastriNews")

    def test_import_can_normalize_instagram_item_with_url(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            import_path = Path(tmpdir) / "import.json"
            import_path.write_text(json.dumps({
                "items": [
                    {
                        "platform": "instagram",
                        "handle": "oscarpiastri",
                        "url": "https://www.instagram.com/p/example/",
                        "text": "Oscar Piastri posted a new McLaren race-week update.",
                        "published_at": "2026-06-26T12:00:00Z",
                        "kind": "reel",
                    }
                ]
            }))

            sources = collector.load_sources(SOURCES_PATH)
            now = collector.parse_now(NOW)
            cutoff = now - collector.timedelta(days=3)
            items, status = collector.normalize_import(import_path, sources, now, cutoff)

            self.assertEqual(status["items"], 1)
            self.assertEqual(items[0]["source_type"], "instagram")
            self.assertEqual(items[0]["url"], "https://www.instagram.com/p/example/")
            self.assertEqual(items[0]["title_zh"], "Instagram 发帖：@oscarpiastri")

    def test_env_json_import_is_supported(self):
        payload = {
            "items": [
                {
                    "platform": "x",
                    "handle": "NicolePiastri",
                    "id": "456",
                    "text": "Oscar Piastri family-side McLaren race-week note.",
                    "created_at": "2026-06-26T09:00:00Z",
                }
            ]
        }
        sources = collector.load_sources(SOURCES_PATH)
        now = collector.parse_now(NOW)
        cutoff = now - collector.timedelta(days=3)
        items, status = collector.normalize_import_payload(payload, "env", sources, now, cutoff)

        self.assertEqual(status["items"], 1)
        self.assertEqual(items[0]["source"], "@NicolePiastri")
        self.assertEqual(items[0]["summary_zh"], "Oscar Piastri family-side McLaren race-week note.")
        self.assertEqual(items[0]["copyright_notice_zh"], "如有侵权请联系删除。")


if __name__ == "__main__":
    unittest.main()
