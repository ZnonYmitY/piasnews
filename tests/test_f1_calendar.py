import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import fetch_f1_calendar as calendar  # noqa: E402


def race(round_number, name, date, time, country, qualifying_time):
    return {
        "round": str(round_number),
        "raceName": name,
        "date": date,
        "time": time,
        "Circuit": {
            "circuitId": f"circuit-{round_number}",
            "circuitName": "Test Circuit",
            "Location": {"locality": "Test City", "country": country},
        },
        "FirstPractice": {"date": date, "time": "09:00:00Z"},
        "Qualifying": {"date": date, "time": qualifying_time},
    }


class CalendarNormalizationTest(unittest.TestCase):
    def test_does_not_invent_time_for_date_only_session(self):
        self.assertIsNone(calendar.session_datetime({"date": "2026-06-28"}))

    def test_builds_calendar_and_selects_next_race(self):
        payload = {
            "MRData": {
                "RaceTable": {
                    "Races": [
                        race(7, "Barcelona Grand Prix", "2026-06-14", "13:00:00Z", "Spain", "10:00:00Z"),
                        race(8, "Austrian Grand Prix", "2026-06-28", "13:00:00Z", "Austria", "14:00:00Z"),
                    ]
                }
            }
        }
        now = datetime(2026, 6, 22, tzinfo=timezone.utc)

        result = calendar.build_calendar(payload, now, 2026)

        self.assertEqual(result["race_count"], 2)
        self.assertEqual(result["next_race"]["name_zh"], "奥地利大奖赛")
        self.assertEqual(result["next_race"]["country_code"], "AUT")
        self.assertEqual(result["next_race"]["race_start"], "2026-06-28T13:00:00Z")
        self.assertEqual(result["next_race"]["sessions"]["qualifying"], "2026-06-28T14:00:00Z")

    def test_returns_no_next_race_after_season(self):
        payload = {
            "MRData": {
                "RaceTable": {
                    "Races": [
                        race(24, "Abu Dhabi Grand Prix", "2026-12-06", "13:00:00Z", "UAE", "10:00:00Z")
                    ]
                }
            }
        }
        now = datetime(2026, 12, 7, tzinfo=timezone.utc)

        result = calendar.build_calendar(payload, now, 2026)

        self.assertIsNone(result["next_race"])


if __name__ == "__main__":
    unittest.main()
