import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import should_refresh  # noqa: E402


class RefreshGateTest(unittest.TestCase):
    def test_refreshes_after_a_session_confirmation_window(self):
        now = datetime(2026, 8, 26, 12, 20, tzinfo=timezone.utc)
        calendar = {"races": [{
            "id": "test-race",
            "sessions": {"practice_1": "2026-08-26T11:00:00Z"},
        }]}
        run, reason = should_refresh.decision(
            now=now,
            last_generated=datetime(2026, 8, 26, 10, 0, tzinfo=timezone.utc),
            calendar=calendar,
            daily_hours=24,
            confirmation_minutes=15,
            force=False,
            handled_session_ref=None,
        )
        self.assertTrue(run)
        self.assertIn("practice_1", reason)

    def test_waits_between_daily_and_session_updates(self):
        now = datetime(2026, 8, 26, 12, 0, tzinfo=timezone.utc)
        run, reason = should_refresh.decision(
            now=now,
            last_generated=now - timedelta(hours=2),
            calendar={"races": []},
            daily_hours=24,
            confirmation_minutes=15,
            force=False,
            handled_session_ref=None,
        )
        self.assertFalse(run)
        self.assertEqual(reason, "waiting_for_daily_or_session_trigger")

    def test_retries_session_until_result_is_recorded(self):
        now = datetime(2026, 9, 4, 12, 20, tzinfo=timezone.utc)
        calendar = {"races": [{
            "id": "2026-round-13",
            "sessions": {"practice_1": "2026-09-04T10:30:00Z"},
        }]}
        common = {
            "now": now,
            "last_generated": now - timedelta(minutes=5),
            "calendar": calendar,
            "daily_hours": 24,
            "confirmation_minutes": 15,
            "force": False,
        }

        run, reason = should_refresh.decision(**common, handled_session_ref=None)
        self.assertTrue(run)
        self.assertEqual(reason, "session_completed:2026-round-13:practice_1")

        run, reason = should_refresh.decision(
            **common,
            handled_session_ref="2026-round-13:practice_1",
        )
        self.assertFalse(run)
        self.assertEqual(reason, "waiting_for_daily_or_session_trigger")

    def test_unhandled_session_takes_priority_over_manual_dispatch(self):
        run, reason = should_refresh.decision(
            now=datetime(2026, 9, 4, 12, 20, tzinfo=timezone.utc),
            last_generated=datetime(2026, 9, 4, 10, 0, tzinfo=timezone.utc),
            calendar={"races": [{
                "id": "2026-round-13",
                "sessions": {"practice_1": "2026-09-04T10:30:00Z"},
            }]},
            daily_hours=24,
            confirmation_minutes=15,
            force=True,
            handled_session_ref=None,
        )

        self.assertTrue(run)
        self.assertEqual(reason, "session_completed:2026-round-13:practice_1")


if __name__ == "__main__":
    unittest.main()
