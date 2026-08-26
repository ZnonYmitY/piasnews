import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import fetch_piasnews  # noqa: E402
import prune_translation_cache  # noqa: E402


class RetentionTest(unittest.TestCase):
    def test_seven_day_retention_merges_without_backfill(self):
        now = datetime(2026, 8, 26, tzinfo=timezone.utc)
        fresh = [{"id": "new", "url": "https://example.com/new", "published_at": "2026-08-25T00:00:00Z"}]
        existing = [
            {"id": "four-days", "url": "https://example.com/four", "published_at": "2026-08-22T00:00:00Z"},
            {"id": "old", "url": "https://example.com/old", "published_at": "2026-08-10T00:00:00Z"},
        ]
        merged = fetch_piasnews.merge_retained_items(fresh, existing, now, 7, 20)
        self.assertEqual([item["id"] for item in merged], ["new", "four-days"])

    def test_translation_cache_keeps_active_and_recent_entries(self):
        mapping = {"translations": {
            "active-old": {"dataset": "items", "item_id": "active", "captured_at": "2026-07-01T00:00:00Z"},
            "inactive-recent": {"dataset": "items", "item_id": "gone", "captured_at": "2026-08-24T00:00:00Z"},
            "inactive-old": {"dataset": "social", "item_id": "gone", "captured_at": "2026-07-01T00:00:00Z"},
        }}
        result, removed = prune_translation_cache.prune_mapping(
            mapping,
            {("items", "active")},
            datetime(2026, 8, 26, tzinfo=timezone.utc),
            8,
        )
        self.assertEqual(set(result["translations"]), {"active-old", "inactive-recent"})
        self.assertEqual(removed, 1)


if __name__ == "__main__":
    unittest.main()
