#!/usr/bin/env python3
"""Decide whether a scheduled Piasnews workflow should run a full refresh."""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


SESSION_DURATIONS = {
    "practice_1": 60,
    "practice_2": 60,
    "practice_3": 60,
    "sprint_qualifying": 60,
    "sprint": 60,
    "qualifying": 60,
    "race": 120,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Gate scheduled Piasnews refreshes.")
    parser.add_argument("--calendar", default="data/calendar.json")
    parser.add_argument("--daily", default="data/daily.json")
    parser.add_argument("--now", help="Override current UTC time.")
    parser.add_argument("--daily-hours", type=int, default=24)
    parser.add_argument("--confirmation-minutes", type=int, default=15)
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def read_json(path: Path, fallback: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def session_ready_times(calendar: dict[str, Any], confirmation_minutes: int) -> list[tuple[datetime, str]]:
    result = []
    for race in calendar.get("races") or []:
        sessions = dict(race.get("sessions") or {})
        if race.get("race_start"):
            sessions.setdefault("race", race["race_start"])
        for key, duration in SESSION_DURATIONS.items():
            started = parse_time(sessions.get(key))
            if not started:
                continue
            ready = started + timedelta(minutes=duration + confirmation_minutes)
            result.append((ready, f"{race.get('id') or race.get('name') or 'race'}:{key}"))
    return sorted(result)


def decision(
    *,
    now: datetime,
    last_generated: datetime | None,
    calendar: dict[str, Any],
    daily_hours: int,
    confirmation_minutes: int,
    force: bool,
) -> tuple[bool, str]:
    if force:
        return True, "manual_dispatch"
    if last_generated is None:
        return True, "missing_previous_generation"
    completed = [row for row in session_ready_times(calendar, confirmation_minutes) if last_generated < row[0] <= now]
    if completed:
        return True, f"session_completed:{completed[-1][1]}"
    if now - last_generated >= timedelta(hours=daily_hours):
        return True, "daily_refresh_due"
    return False, "waiting_for_daily_or_session_trigger"


def main() -> int:
    args = parse_args()
    now = parse_time(args.now) or datetime.now(timezone.utc)
    daily = read_json(Path(args.daily), {})
    calendar = read_json(Path(args.calendar), {"races": []})
    force = args.force or os.environ.get("GITHUB_EVENT_NAME") == "workflow_dispatch"
    should_run, reason = decision(
        now=now,
        last_generated=parse_time(daily.get("generated_at")),
        calendar=calendar,
        daily_hours=max(1, args.daily_hours),
        confirmation_minutes=max(0, args.confirmation_minutes),
        force=force,
    )
    print(f"should_run={'true' if should_run else 'false'} reason={reason}")
    output = os.environ.get("GITHUB_OUTPUT")
    if output:
        with Path(output).open("a", encoding="utf-8") as handle:
            handle.write(f"should_run={'true' if should_run else 'false'}\nreason={reason}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
