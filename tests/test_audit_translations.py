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
