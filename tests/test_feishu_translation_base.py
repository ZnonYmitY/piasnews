import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import import_feishu_translation_review as importer  # noqa: E402
import sync_feishu_translation_cases as case_syncer  # noqa: E402
import sync_feishu_translation_base as syncer  # noqa: E402


class FakeClient:
    def __init__(self, records):
        self.records = records
        self.created = []
        self.updated = []

    def list_records(self, *, field_names=None):
        return self.records

    def create_record(self, fields):
        self.created.append(fields)
        return {}

    def update_record(self, record_id, fields):
        self.updated.append((record_id, fields))
        return {}


class FeishuTranslationBaseTest(unittest.TestCase):
    def test_sync_creates_new_rows_and_preserves_approved_status(self):
        client = FakeClient([
            {
                "record_id": "rec_existing",
                "fields": {"候选ID": "tc-existing", "审核状态": "approved"},
            }
        ])
        rows = [
            {"id": "tc-new", "source_text": "new", "status": "pending"},
            {"id": "tc-existing", "source_text": "existing", "status": "pending"},
        ]

        created, updated = syncer.sync_rows(client, rows)

        self.assertEqual((created, updated), (1, 1))
        self.assertEqual(client.created[0]["候选ID"], "tc-new")
        self.assertEqual(client.created[0]["审核状态"], "pending")
        self.assertEqual(client.updated[0][0], "rec_existing")
        self.assertNotIn("审核状态", client.updated[0][1])

    def test_import_only_approved_rows_and_deduplicates_by_source_text(self):
        client = FakeClient([
            {
                "record_id": "rec_1",
                "fields": {
                    "候选ID": "tc-1",
                    "来源类型": "news",
                    "场景": "f1_news_title",
                    "英文原文": "Oscar Piastri title",
                    "当前中文": "bad",
                    "建议中文": "good",
                    "审核状态": "approved",
                    "优先级": "high",
                    "标签": "headline",
                    "备注": "ok",
                },
            },
            {
                "record_id": "rec_2",
                "fields": {
                    "候选ID": "tc-2",
                    "来源类型": "news",
                    "英文原文": "pending title",
                    "审核状态": "pending",
                },
            },
        ])

        approved = importer.approved_rows_from_base(client)
        merged, added = importer.merge_approved_reviews(
            [{"source_type": "news", "source_text": "Oscar Piastri title", "status": "approved"}],
            approved,
        )

        self.assertEqual(len(approved), 1)
        self.assertEqual(approved[0]["status"], "approved")
        self.assertEqual(approved[0]["suggested_zh"], "good")
        self.assertEqual(added, 0)
        self.assertEqual(len(merged), 1)

    def test_case_library_syncs_only_approved_rows_by_sample_id(self):
        client = FakeClient([
            {
                "record_id": "rec_existing",
                "fields": {"样本ID": "tr-existing"},
            }
        ])
        rows = [
            {
                "id": "tr-existing",
                "source_type": "social",
                "domain": "x_post",
                "source_text": "existing source",
                "current_zh": "bad",
                "suggested_zh": "good",
                "status": "approved",
                "priority": "high",
                "tags": "fan-source",
                "notes": "confirmed",
            },
            {
                "id": "tr-new",
                "source_type": "news",
                "domain": "f1_news_title",
                "source_text": "new source",
                "current_zh": "old",
                "suggested_zh": "new",
                "status": "approved",
                "priority": "medium",
                "tags": "headline",
                "notes": "confirmed",
            },
        ]

        created, updated = case_syncer.sync_cases(client, rows)

        self.assertEqual((created, updated), (1, 1))
        self.assertEqual(client.created[0]["样本ID"], "tr-new")
        self.assertEqual(client.created[0]["英文原文"], "new source")
        self.assertEqual(client.created[0]["审核状态"], "approved")
        self.assertEqual(client.updated[0][0], "rec_existing")
        self.assertEqual(client.updated[0][1]["建议中文"], "good")

    def test_case_library_reads_only_approved_review_rows(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            path = Path(tmpdir) / "translation-review.csv"
            path.write_text(
                "id,source_text,status\n"
                "tr-approved,Oscar title,approved\n"
                "tr-pending,Pending title,pending\n"
                "tr-empty,,approved\n",
                encoding="utf-8",
            )
            rows = case_syncer.approved_review_rows(path)

        self.assertEqual([row["id"] for row in rows], ["tr-approved"])


if __name__ == "__main__":
    unittest.main()
