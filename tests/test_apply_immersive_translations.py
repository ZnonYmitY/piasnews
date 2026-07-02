import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import apply_immersive_translations as immersive  # noqa: E402


class ApplyImmersiveTranslationsTest(unittest.TestCase):
    def test_applies_social_mapping_and_repairs_proper_nouns(self):
        source = (
            '"on the basis that you have oscar and lando, if max was available, '
            'you wouldn\'t sign him?" zak brown: "no, no." https://t.co/example'
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            mapping_path = Path(tmpdir) / "immersive.json"
            social_path = Path(tmpdir) / "social.json"
            mapping_path.write_text(json.dumps({
                "translations": {
                    "one": {
                        "dataset": "social",
                        "target_field": "summary_zh",
                        "source_text": source,
                        "zh": "如果马克斯有，你不会签他？扎克·布朗说：兰多和奥斯多不会离开。",
                    }
                }
            }), encoding="utf-8")
            social_path.write_text(json.dumps({
                "items": [
                    {
                        "source": "@laurogeitabat",
                        "source_type": "x",
                        "post_kind": "post",
                        "summary": source,
                    }
                ]
            }), encoding="utf-8")

            exact, without_urls = immersive.load_social_translations(mapping_path)
            updated = immersive.apply_social_translations(social_path, exact, without_urls)

            self.assertEqual(updated, 1)
            item = json.loads(social_path.read_text())["items"][0]
            self.assertEqual(
                item["summary_zh"],
                "如果Max有，你不会签他？Zak Brown说：Lando和Oscar不会离开。",
            )
            self.assertEqual(
                item["title_zh"],
                "X 发帖 @laurogeitabat：如果Max有，你不会签他？Zak Brown说：Lando和Oscar不会离开。",
            )

    def test_matches_when_social_url_is_absent(self):
        source = "Back to my old stomping ground. Looking forward to the weekend https://t.co/example"

        with tempfile.TemporaryDirectory() as tmpdir:
            mapping_path = Path(tmpdir) / "immersive.json"
            social_path = Path(tmpdir) / "social.json"
            mapping_path.write_text(json.dumps({
                "translations": {
                    "one": {
                        "dataset": "social",
                        "target_field": "summary_zh",
                        "source_text": source,
                        "zh": "回到我的老地方。期待这个周末。",
                    }
                }
            }), encoding="utf-8")
            social_path.write_text(json.dumps({
                "items": [
                    {
                        "source": "@OscarPiastri",
                        "source_type": "x",
                        "post_kind": "post",
                        "summary": "Back to my old stomping ground. Looking forward to the weekend",
                    }
                ]
            }), encoding="utf-8")

            exact, without_urls = immersive.load_social_translations(mapping_path)
            updated = immersive.apply_social_translations(social_path, exact, without_urls)

            self.assertEqual(updated, 1)
            item = json.loads(social_path.read_text())["items"][0]
            self.assertEqual(item["summary_zh"], "回到我的老地方。期待这个周末。")


if __name__ == "__main__":
    unittest.main()
