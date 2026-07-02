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

            grouped = immersive.load_translations(mapping_path)
            updated = immersive.apply_social_translations(social_path, grouped)

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

            grouped = immersive.load_translations(mapping_path)
            updated = immersive.apply_social_translations(social_path, grouped)

            self.assertEqual(updated, 1)
            item = json.loads(social_path.read_text())["items"][0]
            self.assertEqual(item["summary_zh"], "回到我的老地方。期待这个周末。")

    def test_applies_news_title_and_summary_mappings(self):
        title = "Oscar Piastri surprised to beat Ferrari after P4 in Austria"
        summary = "Oscar Piastri says McLaren exceeded expectations in Austria."

        with tempfile.TemporaryDirectory() as tmpdir:
            mapping_path = Path(tmpdir) / "immersive.json"
            items_path = Path(tmpdir) / "items.json"
            mapping_path.write_text(json.dumps({
                "translations": {
                    "title": {
                        "dataset": "items",
                        "target_field": "title_zh",
                        "source_text": title,
                        "zh": "Oscar Piastri 对奥地利站 P4 完赛并击败 Ferrari 感到意外",
                    },
                    "summary": {
                        "dataset": "news",
                        "target_field": "summary_zh",
                        "source_text": summary,
                        "zh": "Oscar Piastri 表示 McLaren 在奥地利的表现超过预期。",
                    },
                }
            }), encoding="utf-8")
            items_path.write_text(json.dumps({
                "items": [
                    {
                        "title": title,
                        "title_zh": "旧标题",
                        "summary": summary,
                        "summary_zh": "旧摘要",
                    }
                ]
            }), encoding="utf-8")

            grouped = immersive.load_translations(mapping_path)
            updated = immersive.apply_item_translations(items_path, grouped)

            self.assertEqual(updated, 2)
            item = json.loads(items_path.read_text())["items"][0]
            self.assertEqual(
                item["title_zh"],
                "Oscar Piastri 对奥地利站 P4 完赛并击败 Ferrari 感到意外",
            )
            self.assertEqual(
                item["summary_zh"],
                "Oscar Piastri 表示 McLaren 在奥地利的表现超过预期。",
            )


if __name__ == "__main__":
    unittest.main()
