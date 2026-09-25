import sys
import unittest
from unittest import mock
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import should_refresh  # noqa: E402


class RefreshGateTest(unittest.TestCase):
    def test_worker_scheduled_dispatch_uses_the_normal_gate(self):
        with mock.patch.dict("os.environ", {
            "GITHUB_EVENT_NAME": "workflow_dispatch",
            "PIASNEWS_SCHEDULED_CHECK": "true",
        }, clear=True):
            self.assertFalse(should_refresh.manual_force_requested())

    def test_human_workflow_dispatch_still_forces_a_refresh(self):
        with mock.patch.dict("os.environ", {"GITHUB_EVENT_NAME": "workflow_dispatch"}, clear=True):
            self.assertTrue(should_refresh.manual_force_requested())

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
            daily_hour=7,
            daily_timezone="Asia/Shanghai",
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
            daily_hour=7,
            daily_timezone="Asia/Shanghai",
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
            "daily_hour": 7,
            "daily_timezone": "Asia/Shanghai",
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
            daily_hour=7,
            daily_timezone="Asia/Shanghai",
            confirmation_minutes=15,
            force=True,
            handled_session_ref=None,
        )

        self.assertTrue(run)
        self.assertEqual(reason, "session_completed:2026-round-13:practice_1")

    def test_waits_until_0700_beijing_for_daily_refresh(self):
        run, reason = should_refresh.decision(
            now=datetime(2026, 9, 18, 22, 45, tzinfo=timezone.utc),
            last_generated=datetime(2026, 9, 17, 23, 5, tzinfo=timezone.utc),
            calendar={"races": []},
            daily_hour=7,
            daily_timezone="Asia/Shanghai",
            confirmation_minutes=15,
            force=False,
            handled_session_ref=None,
        )

        self.assertFalse(run)
        self.assertEqual(reason, "waiting_for_daily_or_session_trigger")

    def test_refreshes_once_after_0700_beijing(self):
        common = {
            "now": datetime(2026, 9, 18, 23, 0, tzinfo=timezone.utc),
            "calendar": {"races": []},
            "daily_hour": 7,
            "daily_timezone": "Asia/Shanghai",
            "confirmation_minutes": 15,
            "force": False,
            "handled_session_ref": None,
        }

        run, reason = should_refresh.decision(
            **common,
            last_generated=datetime(2026, 9, 17, 23, 5, tzinfo=timezone.utc),
        )
        self.assertTrue(run)
        self.assertEqual(reason, "daily_refresh_due")

        run, reason = should_refresh.decision(
            **common,
            last_generated=datetime(2026, 9, 18, 23, 0, tzinfo=timezone.utc),
        )
        self.assertFalse(run)
        self.assertEqual(reason, "waiting_for_daily_or_session_trigger")

    def test_retries_a_missed_daily_slot_before_the_next_0700(self):
        run, reason = should_refresh.decision(
            now=datetime(2026, 9, 18, 22, 59, tzinfo=timezone.utc),
            last_generated=datetime(2026, 9, 17, 22, 0, tzinfo=timezone.utc),
            calendar={"races": []},
            daily_hour=7,
            daily_timezone="Asia/Shanghai",
            confirmation_minutes=15,
            force=False,
            handled_session_ref=None,
        )

        self.assertTrue(run)
        self.assertEqual(reason, "daily_refresh_due")

    def test_session_refresh_before_0700_does_not_replace_daily_slot(self):
        run, reason = should_refresh.decision(
            now=datetime(2026, 9, 18, 23, 0, tzinfo=timezone.utc),
            last_generated=datetime(2026, 9, 18, 22, 55, tzinfo=timezone.utc),
            calendar={"races": []},
            daily_hour=7,
            daily_timezone="Asia/Shanghai",
            confirmation_minutes=15,
            force=False,
            handled_session_ref=None,
        )

        self.assertTrue(run)
        self.assertEqual(reason, "daily_refresh_due")


if __name__ == "__main__":
    unittest.main()
