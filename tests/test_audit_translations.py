import csv
import json
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import audit_translations as audit  # noqa: E402


class TranslationAuditTest(unittest.TestCase):
    def test_detects_name_team_and_term_badcases(self):
        entry = audit.TranslationEntry(
            source_type="news",
            domain="f1_news_title",
            url="https://example.com",
            source="Example",
            source_text="FIA confirms Oscar Piastri decision after Austrian GP investigation",
            current_zh="FIA在奥地利GP调查后确认奥斯卡·Piastri的裁决",
        )

        issues = audit.detect_issues(entry)

        self.assertIn("person_name_translation", {issue.error_type for issue in issues})
        row = audit.candidate_row(entry, issues, "run", "2026-06-29T00:00:00Z")
        self.assertEqual(row["status"], "pending")
        self.assertIn("Oscar Piastri", row["suggested_zh"])

    def test_skips_approved_review_rows(self):
        entry = audit.TranslationEntry(
            source_type="news",
            domain="f1_news_title",
            url="https://example.com",
            source="Example",
            source_text="Oscar Piastri linked with Red Bull as Max Verstappen McLaren rumours intensify",
            current_zh="奥斯卡·皮阿斯特里和红牛有关 马克斯·弗斯泰彭·McLaren的谣言不断加剧",
        )

        rows = audit.audit_entries(
            [entry],
            approved_keys={("news", entry.source_text.casefold())},
            existing_ids=set(),
            run_id="run",
            seen_at="2026-06-29T00:00:00Z",
        )

        self.assertEqual(rows, [])

    def test_skips_approved_social_rows_with_media_suffix(self):
        entry = audit.TranslationEntry(
            source_type="social",
            domain="x_post",
            url="https://x.com/example/status/1",
            source="@example",
            source_text="oscar filmed a segment for dazn! https://t.co/example",
            current_zh="oscar filmed a segment for dazn!",
        )

        rows = audit.audit_entries(
            [entry],
            approved_keys={("social", "oscar filmed a segment for dazn!")},
            existing_ids=set(),
            run_id="run",
            seen_at="2026-06-29T00:00:00Z",
        )

        self.assertEqual(rows, [])

    def test_skips_glossary_managed_entity_only_rows(self):
        entry = audit.TranslationEntry(
            source_type="news",
            domain="f1_news_title",
            url="https://example.com",
            source="Example",
            source_text="RaceFans: Oscar Piastri, McLaren, Red Bull Ring",
            current_zh="RaceFans: 奥斯卡·Piastri, 麦拉伦, 红牛环",
        )

        rows = audit.audit_entries(
            [entry],
            approved_keys=set(),
            existing_ids=set(),
            run_id="run",
            seen_at="2026-06-29T00:00:00Z",
        )

        self.assertEqual(rows, [])

    def test_normalizes_existing_mixed_candidate_rows(self):
        row = audit.normalize_existing_candidate_row({
            "error_type": "person_name_translation,stewards_term,team_name_translation",
            "tags": "person,name,team,stewards,penalty",
            "notes": "人名应保留英文，避免中文音译或半中半英。 | stewards 应译为 FIA 干事，不能译成管家/服务员/主管。 | 车队名/赛道名应按术语表保留英文。",
        })

        self.assertEqual(row["error_type"], "stewards_term")
        self.assertEqual(row["tags"], "stewards,penalty")
        self.assertNotIn("人名", row["notes"])
        self.assertNotIn("车队名", row["notes"])

    def test_append_candidates_prunes_approved_existing_rows(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "candidates.csv"
            audit.append_candidates(
                output,
                [{
                    "id": "tc-old",
                    "source_type": "news",
                    "source_text": "Monster launches Oscar Piastri F1 cans",
                    "error_type": "merch_sponsorship_title",
                }],
                [],
                {("news", "monster launches oscar piastri f1 cans")},
            )

            with output.open(newline="", encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))

        self.assertEqual(rows, [])

    def test_append_candidates_prunes_approved_existing_social_variant(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "candidates.csv"
            audit.append_candidates(
                output,
                [{
                    "id": "tc-old-social",
                    "source_type": "social",
                    "source_text": "oscar filmed a segment for dazn! https://t.co/example",
                    "error_type": "untranslated_fallback",
                }],
                [],
                {("social", "oscar filmed a segment for dazn!")},
            )

            with output.open(newline="", encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))

        self.assertEqual(rows, [])

    def test_detects_merch_and_headline_semantic_badcases(self):
        cases = [
            (
                audit.TranslationEntry(
                    "news",
                    "f1_news_title",
                    "https://example.com/monster",
                    "Example",
                    "Monster launches Oscar Piastri F1 cans",
                    "怪物发射 Oscar Piastri F1罐",
                ),
                "merch_sponsorship_title",
                "Monster 推出 Oscar Piastri F1 联名罐",
            ),
            (
                audit.TranslationEntry(
                    "news",
                    "f1_news_title",
                    "https://example.com/stewards",
                    "Example",
                    "F1 stewards make call on punishment for Oscar Piastri and overturning result",
                    "F1管理者呼吁惩罚Oscar Piastri 和推翻结果",
                ),
                "stewards_make_call",
                "F1 干事调查后决定是否处罚 Piastri、是否改写赛果",
            ),
            (
                audit.TranslationEntry(
                    "news",
                    "f1_news_title",
                    "https://example.com/recovery",
                    "Example",
                    "Piastri Austria Recovery Gives McLaren Ferrari Reality Check",
                    "Piastri奥地利复苏 给McLarenFerrari现实检查",
                ),
                "idiom_reality_check",
                "Piastri 奥地利站反弹，让 McLaren 与 Ferrari 看清现实差距",
            ),
            (
                audit.TranslationEntry(
                    "news",
                    "f1_news_title",
                    "https://example.com/clear-penalty",
                    "Example",
                    "‘Clear penalty’: Max reignites bitter rivalry; strong Piastri signs as big title statement sent — F1 wrap",
                    "“清罚”:马克思点燃了激烈的争斗;强烈的Piastri标志,",
                ),
                "quote_penalty_idiom",
                "“这明显该罚”：Max 再度点燃激烈对抗；Piastri 展现强势信号",
            ),
        ]

        for entry, expected_issue, expected_suggestion in cases:
            with self.subTest(entry=entry.source_text):
                issues = audit.detect_issues(entry)
                self.assertIn(expected_issue, {issue.error_type for issue in issues})
                self.assertEqual(audit.suggested_translation(entry), expected_suggestion)

    def test_run_audit_writes_candidate_csv_and_xlsx(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            items = tmp / "items.json"
            social = tmp / "social.json"
            review = tmp / "review.csv"
            candidates = tmp / "candidates.csv"
            latest_csv = tmp / "latest.csv"
            latest_xlsx = tmp / "latest.xlsx"
            items.write_text(json.dumps({
                "items": [
                    {
                        "title": "Oscar Piastri stewards verdict: McLaren star avoids Austrian GP penalty scare",
                        "title_zh": "奥斯卡·Piastri 管家判决:McLaren星能避免奥地利GP罚被吓倒.",
                        "url": "https://example.com/news",
                        "source": "Example",
                    }
                ]
            }), encoding="utf-8")
            social.write_text(json.dumps({"items": []}), encoding="utf-8")
            review.write_text("id,source_type,source_text,suggested_zh,status\n", encoding="utf-8")

            args = type("Args", (), {
                "items": str(items),
                "social": str(social),
                "review": str(review),
                "candidates": str(candidates),
                "latest_csv": str(latest_csv),
                "latest_xlsx": str(latest_xlsx),
            })()

            rows = audit.run_audit(args)

            self.assertEqual(len(rows), 1)
            with candidates.open(newline="", encoding="utf-8") as handle:
                stored = list(csv.DictReader(handle))
            self.assertEqual(stored[0]["status"], "pending")
            self.assertTrue(latest_xlsx.exists())
            with zipfile.ZipFile(latest_xlsx) as archive:
                self.assertIn("xl/worksheets/sheet1.xml", archive.namelist())


if __name__ == "__main__":
    unittest.main()
