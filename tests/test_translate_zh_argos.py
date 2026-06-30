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

    def test_manual_headline_translation_handles_red_bull_move_context(self):
        result = translator.translate_or_fallback(
            "Webber preparing Red Bull move for Piastri",
            None,
        )

        self.assertEqual(result, "Webber 准备推动 Piastri 转会 Red Bull")

    def test_manual_headline_translation_handles_merch_and_semantic_badcases(self):
        cases = {
            "Monster launches Oscar Piastri F1 cans":
                "Monster 推出 Oscar Piastri F1 联名罐",
            "Monster Energy unveils new Oscar Piastri cans":
                "Monster Energy 发布新的 Oscar Piastri 联名罐",
            "Piastri Austria Recovery Gives McLaren Ferrari Reality Check":
                "Piastri 奥地利站反弹，让 McLaren 与 Ferrari 看清现实差距",
            "‘Clear penalty’: Max reignites bitter rivalry; strong Piastri signs as big title statement sent — F1 wrap":
                "“这明显该罚”：Max 再度点燃激烈对抗；Piastri 展现强势信号",
        }

        for source, expected in cases.items():
            with self.subTest(source=source):
                self.assertEqual(translator.translate_or_fallback(source, None), expected)

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
            self.assertEqual(social["items"][0]["summary_zh"], "Oscar talks about qualifying.")
            self.assertEqual(social["items"][0]["title_zh"], "X 发帖 @PiastriNews：Oscar talks about qualifying.")

    def test_news_update_preserves_existing_chinese_when_translator_unavailable(self):
        item = {
            "title": "Mark Webber is now in talks with surprise midfield team over potential Oscar Piastri deal",
            "title_zh": "Mark Webber 正在与一支意外的中游车队讨论潜在 Oscar Piastri 交易",
        }

        translator.update_news_item(item, None, {})

        self.assertEqual(
            item["title_zh"],
            "Mark Webber 正在与一支意外的中游车队讨论潜在 Oscar Piastri 交易",
        )

    def test_loads_approved_manual_translation_only(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            review_path = Path(tmpdir) / "translation_review.csv"
            review_path.write_text(
                "id,source_text,suggested_zh,status\n"
                "one,Antonelli pips Piastri to top Austria FP2,Antonelli 微弱优势力压 Piastri，领跑奥地利二练,approved\n"
                "two,Pending title,待确认标题,pending\n",
                encoding="utf-8",
            )

            manual = translator.load_manual_translations(review_path)

        self.assertEqual(
            translator.translate_or_fallback(
                "Antonelli pips Piastri to top Austria FP2",
                None,
                manual_translations=manual,
            ),
            "Antonelli 微弱优势力压 Piastri，领跑奥地利二练",
        )
        self.assertNotEqual(
            translator.translate_or_fallback("Pending title", None, manual_translations=manual),
            "待确认标题",
        )

    def test_default_review_handles_current_badcase_titles(self):
        manual = translator.load_manual_translations()

        cases = {
            "Alex Brundle saw something 'confusing' in Oscar Piastri's McLaren data at Austrian Grand Prix":
                "Alex Brundle 在 Piastri 的奥地利站 McLaren 数据中看到“令人困惑”的信号",
            "Oscar Piastri surprised to beat Ferrari after P4 in Austria as Lando Norris pinpoints where he lost out in P7":
                "Piastri 对奥地利站 P4 完赛并击败 Ferrari 感到意外，Norris 指出自己 P7 的损失所在",
            "Oscar Piastri stewards verdict: McLaren star avoids Austrian GP penalty scare":
                "Piastri 干事裁定出炉：McLaren 车手避开奥地利站处罚风险",
            "‘Surprised’ Oscar Piastri sends reminder despite missing Austrian Grand Prix podium":
                "无缘奥地利站领奖台后，Piastri 仍给出提醒",
            "FIA confirms Oscar Piastri decision after Austrian GP investigation":
                "FIA 确认 Piastri 奥地利站调查裁定",
            "Oscar Piastri linked with Red Bull as Max Verstappen McLaren rumours intensify":
                "Piastri 被关联至 Red Bull，Max Verstappen 与 McLaren 传闻升温",
            "F1 stewards make call on punishment for Oscar Piastri and overturning result":
                "F1 干事调查后决定是否处罚 Piastri、是否改写赛果",
        }

        for source, expected in cases.items():
            with self.subTest(source=source):
                self.assertEqual(
                    translator.translate_or_fallback(source, None, manual_translations=manual),
                    expected,
                )

    def test_default_review_handles_ferrari_top_three_quote(self):
        manual = translator.load_manual_translations()

        result = translator.translate_or_fallback(
            'Q: Might you hope to use your tyres better and make up some places? "We\'ll have to see. I mean the Ferraris being in the top 3 is impressive. They didn\'t look amazing yesterday, today they\'ve definitely made a step forward. I think in the race, they\'re generally quick in all the corners and not so much on the straights. So if that means they have more downforce then in this heat, that\'s only a good thing for them. We\'ll try our best obviously but I think it\'ll be a tough race and everyone pretty close on pace" https://t.co/example',
            None,
            manual_translations=manual,
        )

        self.assertIn("两台 Ferrari 都进了前三", result)
        self.assertNotIn("包揽前三", result)

    def test_approved_manual_translation_can_match_social_text_with_extra_decoration(self):
        manual = {
            "NO FURTHER ACTION !!! p4 is secured": "不再处罚，P4 保住了",
        }

        self.assertEqual(
            translator.translate_or_fallback(
                "NO FURTHER ACTION !!! p4 is secured 💪🏻 https://t.co/example",
                None,
                manual_translations=manual,
            ),
            "不再处罚，P4 保住了",
        )

    def test_approved_manual_translation_matches_social_text_case_insensitively(self):
        manual = {
            "Oscar's overtake at the start": "Oscar 起步阶段的超车",
        }

        self.assertEqual(
            translator.translate_or_fallback(
                "OSCAR'S OVERTAKE AT THE START 😮‍💨",
                None,
                manual_translations=manual,
            ),
            "Oscar 起步阶段的超车",
        )

    def test_manual_translation_matches_html_entities(self):
        manual = {
            'Q: "do you think p4 was the maximum of the car today?" oscar: "definitely. mercedes & max were in a different league today."':
                "问：你觉得 P4 是今天赛车能达到的上限吗？Oscar：Mercedes 和 Max 今天在另一个级别。",
        }

        self.assertEqual(
            translator.translate_or_fallback(
                'Q: "do you think p4 was the maximum of the car today?" oscar: "definitely. mercedes &amp; max were in a different league today." https://t.co/example',
                None,
                manual_translations=manual,
            ),
            "问：你觉得 P4 是今天赛车能达到的上限吗？Oscar：Mercedes 和 Max 今天在另一个级别。",
        )

    def test_loads_approved_glossary_terms(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            glossary_path = Path(tmpdir) / "translation_glossary.csv"
            glossary_path.write_text(
                "source,target,type,scope,case_sensitive,status,notes\n"
                "pips,微弱优势力压,phrase,news,false,approved,test\n"
                "PendingTerm,待确认术语,term,news,true,pending,test\n",
                encoding="utf-8",
            )

            glossary = translator.load_glossary(glossary_path)

        self.assertIn("微弱优势力压", translator.apply_glossary("Antonelli pips Piastri", glossary))
        self.assertNotIn("待确认术语", translator.apply_glossary("PendingTerm", glossary))

    def test_default_glossary_rewrites_machine_translated_entities(self):
        result = translator.apply_glossary("奥斯卡·Piastri 和红牛环，以及麦拉伦、奥迪、凯迪拉克")

        self.assertIn("Oscar Piastri", result)
        self.assertIn("Red Bull Ring", result)
        self.assertIn("McLaren", result)
        self.assertIn("Audi", result)
        self.assertIn("Cadillac", result)

    def test_default_glossary_covers_position_range(self):
        result = translator.apply_glossary("started p4, finished p22, teammate took P1")

        self.assertIn("P4", result)
        self.assertIn("P22", result)
        self.assertIn("P1", result)

    def test_default_glossary_covers_more_people_teams_and_circuits(self):
        result = translator.apply_glossary(
            "塞尔吉奥·佩雷斯 at 铃鹿 with 小红牛, while Graeme Lowdon talks Cadillac F1"
        )

        self.assertIn("Sergio Perez", result)
        self.assertIn("Suzuka", result)
        self.assertIn("Racing Bulls", result)
        self.assertIn("Graeme Lowdon", result)
        self.assertIn("Cadillac F1", result)


if __name__ == "__main__":
    unittest.main()
