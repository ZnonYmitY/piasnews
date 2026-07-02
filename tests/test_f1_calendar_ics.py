import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import build_f1_calendar_ics as ics  # noqa: E402


class CalendarIcsTest(unittest.TestCase):
    def test_builds_next_race_and_weekend_events(self):
        payload = {
            "generated_at": "2026-07-02T07:03:00Z",
            "next_race": {
                "id": "2026-round-9",
                "name": "British Grand Prix",
                "circuit": "Silverstone Circuit",
                "locality": "Silverstone",
                "official_url": "https://www.formula1.com/en/racing/2026",
                "sessions": {
                    "practice_1": "2026-07-03T11:30:00Z",
                    "qualifying": "2026-07-04T15:00:00Z",
                    "race": "2026-07-05T14:00:00Z",
                },
            },
        }

        race_events, weekend_events = ics.build_events(payload)

        self.assertEqual(len(race_events), 1)
        self.assertEqual(len(weekend_events), 3)
        self.assertEqual(race_events[0]["start"], "20260705T140000Z")
        self.assertEqual(race_events[0]["end"], "20260705T160000Z")
        self.assertIn("British Grand Prix - Race", race_events[0]["summary"])

    def test_writes_valid_calendar_files(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            calendar_path = Path(tmpdir) / "calendar.json"
            race_output = Path(tmpdir) / "next-race.ics"
            weekend_output = Path(tmpdir) / "next-weekend.ics"
            calendar_path.write_text(json.dumps({
                "generated_at": "2026-07-02T07:03:00Z",
                "next_race": {
                    "id": "2026-round-9",
                    "name": "British Grand Prix",
                    "sessions": {"race": "2026-07-05T14:00:00Z"},
                },
            }), encoding="utf-8")

            exit_code = subprocess.run([
                sys.executable,
                str(ROOT / "scripts" / "build_f1_calendar_ics.py"),
                "--calendar",
                str(calendar_path),
                "--race-output",
                str(race_output),
                "--weekend-output",
                str(weekend_output),
            ], check=True).returncode

            self.assertEqual(exit_code, 0)
            race_text = race_output.read_text(encoding="utf-8")
            self.assertIn("BEGIN:VCALENDAR", race_text)
            self.assertIn("BEGIN:VEVENT", race_text)
            self.assertIn("DTSTART:20260705T140000Z", race_text)
            self.assertTrue(race_output.read_bytes().endswith(b"\r\n"))


if __name__ == "__main__":
    unittest.main()
