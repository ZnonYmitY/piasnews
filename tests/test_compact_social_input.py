import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import compact_social_input as compact  # noqa: E402


class CompactSocialInputTest(unittest.TestCase):
    def test_compacts_normalized_social_payload(self):
        payload = {
            "generated_at": "2026-06-27T10:00:00Z",
            "window_days": 3,
            "items": [
                {
                    "platform": "x",
                    "source_handle": "PiastriNews",
                    "url": "https://x.com/PiastriNews/status/123",
                    "summary": "Oscar Piastri update",
                    "published_at": "2026-06-27T09:00:00Z",
                    "post_kind": "post",
                    "metrics": {"likes": 81},
                    "language": "en",
                    "image_url": "https://img.example.com/oscar.jpg",
                    "video_url": "https://video.example.com/oscar.mp4",
                    "video_poster_url": "https://img.example.com/oscar-poster.jpg",
                }
            ],
        }

        output = compact.compact_payload(payload)

        self.assertEqual(output["source"], "agent-reach/compact-social")
        self.assertEqual(output["schema_version"], 2)
        self.assertEqual(output["collector_version"], "media-preserving-v2")
        self.assertEqual(output["generated_at"], "2026-06-27T10:00:00Z")
        self.assertEqual(output["item_count"], 1)
        self.assertEqual(output["media_item_count"], 1)
        self.assertEqual(output["latest_item_at"], "2026-06-27T09:00:00Z")
        self.assertEqual(output["items"][0]["handle"], "PiastriNews")
        self.assertEqual(output["items"][0]["id"], "123")
        self.assertEqual(output["items"][0]["text"], "Oscar Piastri update")
        self.assertEqual(output["items"][0]["image_url"], "https://img.example.com/oscar.jpg")
        self.assertEqual(output["items"][0]["video_url"], "https://video.example.com/oscar.mp4")
        self.assertEqual(output["items"][0]["video_poster_url"], "https://img.example.com/oscar-poster.jpg")

    def test_main_writes_output_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            input_path = Path(tmpdir) / "social.json"
            output_path = Path(tmpdir) / "compact.json"
            input_path.write_text(json.dumps({"items": []}))

            exit_code = compact.main(["--input", str(input_path), "--output", str(output_path)])

            self.assertEqual(exit_code, 0)
            self.assertEqual(json.loads(output_path.read_text())["items"], [])

    def test_compact_only_contains_recent_discovery_window(self):
        payload = {
            "generated_at": "2026-06-27T10:00:00Z",
            "window_days": 7,
            "items": [
                {
                    "platform": "x",
                    "source_handle": "PiastriNews",
                    "url": "https://x.com/PiastriNews/status/recent",
                    "summary": "recent",
                    "published_at": "2026-06-26T09:00:00Z",
                },
                {
                    "platform": "x",
                    "source_handle": "PiastriNews",
                    "url": "https://x.com/PiastriNews/status/retained-old",
                    "summary": "retained but not rediscovered",
                    "published_at": "2026-06-22T09:00:00Z",
                },
            ],
        }

        output = compact.compact_payload(payload, days=3)

        self.assertEqual(output["window_days"], 3)
        self.assertEqual(output["item_count"], 1)
        self.assertEqual(output["items"][0]["id"], "recent")


if __name__ == "__main__":
    unittest.main()
