import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import collect_agent_reach_social as collector  # noqa: E402


SOURCES_PATH = ROOT / "piasnews" / "references" / "x-sources.json"


class AgentReachCollectTest(unittest.TestCase):
    def test_normalizes_common_twitter_payload(self):
        item = collector.normalize_raw_tweet(
            {
                "id": "123",
                "text": "Oscar Piastri McLaren update",
                "created_at": "Sat Jun 27 08:00:00 +0000 2026",
                "public_metrics": {"like_count": 81},
            },
            "PiastriNews",
        )

        self.assertEqual(item["platform"], "x")
        self.assertEqual(item["handle"], "PiastriNews")
        self.assertEqual(item["url"], "https://x.com/PiastriNews/status/123")
        self.assertEqual(item["created_at"], "2026-06-27T08:00:00Z")
        self.assertEqual(item["kind"], "post")

    def test_detects_reposts_from_text(self):
        item = collector.normalize_raw_tweet(
            {
                "id": "456",
                "text": "RT @F1: Oscar Piastri podium quote",
                "created_at": "2026-06-27T09:00:00Z",
            },
            "PiastriNews",
        )

        self.assertEqual(item["kind"], "repost")

    def test_main_writes_import_payload_from_source_config(self):
        def fake_search(_twitter_cmd, handle, _since_date, _per_source):
            if handle != "PiastriNews":
                return [], {"platform": "x", "handle": handle, "ok": True, "items": 0}
            return [
                {
                    "platform": "x",
                    "handle": handle,
                    "id": "789",
                    "text": "Oscar Piastri fan update",
                    "created_at": "2026-06-27T10:00:00Z",
                    "kind": "post",
                }
            ], {"platform": "x", "handle": handle, "ok": True, "items": 1}

        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "import.json"
            argv = [
                "collect_agent_reach_social.py",
                "--sources",
                str(SOURCES_PATH),
                "--output",
                str(output),
                "--group",
                "fan_watch",
                "--now",
                "2026-06-27T12:00:00Z",
            ]
            with patch.object(sys, "argv", argv), patch.object(collector, "run_twitter_search", fake_search):
                self.assertEqual(collector.main(), 0)

            payload = json.loads(output.read_text())
            self.assertEqual(payload["source"], "agent-reach/twitter-cli")
            self.assertEqual(payload["total_items"], 1)
            self.assertEqual(payload["items"][0]["handle"], "PiastriNews")


if __name__ == "__main__":
    unittest.main()
