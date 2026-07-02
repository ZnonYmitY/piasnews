#!/usr/bin/env python3
"""Build iCalendar files for the next Formula 1 race weekend."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CALENDAR = ROOT / "data" / "calendar.json"
DEFAULT_RACE_OUTPUT = ROOT / "data" / "next-race.ics"
DEFAULT_WEEKEND_OUTPUT = ROOT / "data" / "next-weekend.ics"

SESSION_LABELS = {
    "practice_1": "Practice 1",
    "practice_2": "Practice 2",
    "practice_3": "Practice 3",
    "sprint_qualifying": "Sprint Qualifying",
    "sprint": "Sprint",
    "qualifying": "Qualifying",
    "race": "Race",
}

SESSION_ORDER = [
    "practice_1",
    "practice_2",
    "practice_3",
    "sprint_qualifying",
    "sprint",
    "qualifying",
    "race",
]

SESSION_DURATIONS = {
    "practice_1": timedelta(hours=1),
    "practice_2": timedelta(hours=1),
    "practice_3": timedelta(hours=1),
    "sprint_qualifying": timedelta(hours=1),
    "sprint": timedelta(hours=1),
    "qualifying": timedelta(hours=1),
    "race": timedelta(hours=2),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build Piasnews next-race iCalendar files.")
    parser.add_argument("--calendar", default=str(DEFAULT_CALENDAR), help="Input data/calendar.json path.")
    parser.add_argument("--race-output", default=str(DEFAULT_RACE_OUTPUT), help="Output ICS for the next race only.")
    parser.add_argument("--weekend-output", default=str(DEFAULT_WEEKEND_OUTPUT), help="Output ICS for the next race weekend.")
    return parser.parse_args()


def parse_utc(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed.astimezone(timezone.utc)


def format_ics_time(value: datetime) -> str:
    return value.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def escape_ics(value: Any) -> str:
    text = str(value or "")
    return (
        text.replace("\\", "\\\\")
        .replace(";", r"\;")
        .replace(",", r"\,")
        .replace("\r\n", r"\n")
        .replace("\n", r"\n")
    )


def fold_line(line: str) -> list[str]:
    encoded = line.encode("utf-8")
    if len(encoded) <= 75:
        return [line]

    chunks: list[str] = []
    current = ""
    for char in line:
        candidate = current + char
        limit = 75 if not chunks else 74
        if len(candidate.encode("utf-8")) > limit:
            chunks.append(current if not chunks else f" {current}")
            current = char
        else:
            current = candidate
    if current:
        chunks.append(current if not chunks else f" {current}")
    return chunks


def calendar_text(events: list[dict[str, str]], *, calendar_name: str, generated_at: str | None) -> str:
    stamp = format_ics_time(parse_utc(generated_at)) if generated_at else format_ics_time(datetime.now(timezone.utc))
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Piasnews//F1 Calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{escape_ics(calendar_name)}",
        "X-WR-TIMEZONE:UTC",
    ]
    for event in events:
        lines.extend([
            "BEGIN:VEVENT",
            f"UID:{escape_ics(event['uid'])}",
            f"DTSTAMP:{stamp}",
            f"DTSTART:{event['start']}",
            f"DTEND:{event['end']}",
            f"SUMMARY:{escape_ics(event['summary'])}",
            f"LOCATION:{escape_ics(event['location'])}",
            f"DESCRIPTION:{escape_ics(event['description'])}",
            f"URL:{escape_ics(event['url'])}",
            "END:VEVENT",
        ])
    lines.append("END:VCALENDAR")
    folded: list[str] = []
    for line in lines:
        folded.extend(fold_line(line))
    return "\r\n".join(folded) + "\r\n"


def event_for_session(race: dict[str, Any], session_key: str) -> dict[str, str] | None:
    start_value = (race.get("sessions") or {}).get(session_key)
    if not start_value:
        return None
    start = parse_utc(start_value)
    end = start + SESSION_DURATIONS.get(session_key, timedelta(hours=1))
    label = SESSION_LABELS.get(session_key, session_key.replace("_", " ").title())
    race_name = race.get("name") or "Formula 1 Grand Prix"
    circuit = race.get("circuit") or ""
    locality = race.get("locality") or ""
    location = " · ".join(part for part in [circuit, locality] if part)
    official_url = race.get("official_url") or ""
    return {
        "uid": f"piasnews-{race.get('id')}-{session_key}@piasnews",
        "start": format_ics_time(start),
        "end": format_ics_time(end),
        "summary": f"F1 {race_name} - {label}",
        "location": location,
        "description": f"{race_name} {label}. Times are published in UTC by Piasnews.",
        "url": official_url,
    }


def build_events(calendar: dict[str, Any]) -> tuple[list[dict[str, str]], list[dict[str, str]]]:
    race = calendar.get("next_race")
    if not isinstance(race, dict):
        return [], []
    race_event = event_for_session(race, "race")
    race_events = [race_event] if race_event else []
    weekend_events = [
        event
        for key in SESSION_ORDER
        if (event := event_for_session(race, key)) is not None
    ]
    return race_events, weekend_events


def main() -> int:
    args = parse_args()
    calendar_path = Path(args.calendar)
    calendar = json.loads(calendar_path.read_text(encoding="utf-8"))
    race_events, weekend_events = build_events(calendar)
    generated_at = calendar.get("generated_at")

    race_output = Path(args.race_output)
    weekend_output = Path(args.weekend_output)
    with race_output.open("w", encoding="utf-8", newline="") as handle:
        handle.write(calendar_text(race_events, calendar_name="Piasnews Next F1 Race", generated_at=generated_at))
    with weekend_output.open("w", encoding="utf-8", newline="") as handle:
        handle.write(calendar_text(weekend_events, calendar_name="Piasnews Next F1 Weekend", generated_at=generated_at))
    print(f"Wrote {len(race_events)} race event(s) to {race_output}")
    print(f"Wrote {len(weekend_events)} weekend event(s) to {weekend_output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
