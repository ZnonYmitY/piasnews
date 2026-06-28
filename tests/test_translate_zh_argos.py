import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import translate_zh_argos as translator  # noqa: E402


class TranslateZhArgosTest(unittest.TestCase):
    def test_fallback_title_applies_f1_glossary(self):
        result = translator.translate_or_fallback("Piastri takes pole in Austrian GP", None)

        self.assertIn("Piastri", result)
        self.assertIn("杆位", result)
        self.assertIn("奥地利大奖赛", result)

    def test_manual_headline_translation_handles_current_mclaren_title(self):
        result = translator.translate_or_fallback(
            "Oscar Piastri bemoans ‘magicless’ reality of ‘very tough’ McLaren situation",
            None,
        )

        self.assertEqual(result, "Oscar Piastri 谈到 McLaren 的艰难处境：缺少“魔法”")

    def test_updates_news_and_social_payloads(self):
        def fake_translate(text):
            return f"译文:{text}"

        with tempfile.TemporaryDirectory() as tmpdir:
            news_path = Path(tmpdir) / "items.json"
            social_path = Path(tmpdir) / "social.json"
            news_path.write_text(json.dumps({
                "items": [
                    {
                        "title": "Piastri takes pole in Austrian GP",
                        "summary": "Race-week or performance-related item.",
                        "summary_zh": "媒体来源围绕 Piastri 比赛动态展开。",
                    }
                ]
            }))
            social_path.write_text(json.dumps({
                "items": [
                    {
                        "source": "@PiastriNews",
                        "source_type": "x",
                        "post_kind": "post",
                        "summary": "Oscar talks about qualifying.",
                    }
                ]
            }))

            self.assertEqual(translator.update_payload(news_path, translator.update_news_item, fake_translate), 1)
            self.assertEqual(translator.update_payload(social_path, translator.update_social_item, fake_translate), 1)

            news = json.loads(news_path.read_text())
            social = json.loads(social_path.read_text())
            self.assertEqual(news["items"][0]["title_zh"], "译文:Piastri takes pole in Austrian GP")
            self.assertEqual(news["items"][0]["summary_zh"], "媒体来源围绕 Piastri 比赛动态展开。")
            self.assertEqual(social["items"][0]["summary_zh"], "译文:Oscar talks about qualifying.")
            self.assertEqual(social["items"][0]["title_zh"], "译文:Oscar talks about qualifying.")


if __name__ == "__main__":
    unittest.main()
