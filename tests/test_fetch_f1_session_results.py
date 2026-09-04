import unittest
from datetime import datetime, timezone

from scripts import fetch_f1_session_results as fetcher


NOW = datetime(2026, 9, 4, 12, 0, tzinfo=timezone.utc)
CALENDAR = {"races": [{
    "id": "2026-round-13",
    "season": 2026,
    "name": "Italian Grand Prix",
    "name_zh": "意大利大奖赛",
    "country": "Italy",
    "sessions": {
        "practice_1": "2026-09-04T10:30:00Z",
        "practice_2": "2026-09-04T14:00:00Z",
    },
}]}


class SessionResultFetchTests(unittest.TestCase):
    def test_fetches_latest_completed_session_result(self):
        seen = []

        def fake_fetch(url):
            seen.append(url)
            if "/sessions?" in url:
                return [{
                    "session_key": 11354,
                    "session_name": "Practice 1",
                    "date_start": "2026-09-04T10:30:00+00:00",
                    "date_end": "2026-09-04T11:30:00+00:00",
                }]
            return [{
                "position": 11,
                "driver_number": 81,
                "number_of_laps": 26,
                "dnf": False,
                "dns": False,
                "dsq": False,
                "gap_to_leader": 1.176,
            }]

        payload = fetcher.build_payload(CALENDAR, {}, now=NOW, fetcher=fake_fetch)

        self.assertTrue(payload["result_available"])
        self.assertEqual(payload["latest"]["session_ref"], "2026-round-13:practice_1")
        self.assertEqual(payload["latest"]["position"], 11)
        self.assertIn("session_name=Practice+1", seen[0])
        self.assertIn("driver_number=81", seen[1])

    def test_pending_result_keeps_previous_and_can_be_retried(self):
        previous = {"latest": {"session_ref": "2026-round-12:race", "position": 6}}

        payload = fetcher.build_payload(CALENDAR, previous, now=NOW, fetcher=lambda _url: [])

        self.assertFalse(payload["result_available"])
        self.assertEqual(payload["attempted_session_ref"], "2026-round-13:practice_1")
        self.assertEqual(payload["latest"], previous["latest"])
        self.assertEqual(payload["last_error"], "openf1_session_missing")

    def test_status_flags_take_precedence_over_position(self):
        self.assertEqual(fetcher.result_status({"position": 20, "dnf": True}), "DNF")
        self.assertEqual(fetcher.result_status({"position": None, "dns": True}), "DNS")
        self.assertEqual(fetcher.result_status({"position": None, "dsq": True}), "DSQ")

    def test_numeric_string_position_is_normalized(self):
        self.assertEqual(fetcher.result_position({"position": "11"}), 11)
        self.assertIsNone(fetcher.result_position({"position": "P11"}))


if __name__ == "__main__":
    unittest.main()
