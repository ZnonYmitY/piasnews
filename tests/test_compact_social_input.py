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
                }
            ],
        }

        output = compact.compact_payload(payload)

        self.assertEqual(output["source"], "agent-reach/compact-social")
        self.assertEqual(output["items"][0]["handle"], "PiastriNews")
        self.assertEqual(output["items"][0]["id"], "123")
        self.assertEqual(output["items"][0]["text"], "Oscar Piastri update")

    def test_main_writes_output_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            input_path = Path(tmpdir) / "social.json"
            output_path = Path(tmpdir) / "compact.json"
            input_path.write_text(json.dumps({"items": []}))

            exit_code = compact.main(["--input", str(input_path), "--output", str(output_path)])

            self.assertEqual(exit_code, 0)
            self.assertEqual(json.loads(output_path.read_text())["items"], [])


if __name__ == "__main__":
    unittest.main()
