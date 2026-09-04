#!/usr/bin/env python3
"""Fetch Oscar Piastri's latest completed-session result from OpenF1."""

from __future__ import annotations

import argparse
import json
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

try:
    from should_refresh import SESSION_DURATIONS, parse_time
except ModuleNotFoundError:  # Imported as scripts.fetch_f1_session_results in tests/tools.
    from scripts.should_refresh import SESSION_DURATIONS, parse_time


ROOT = Path(__file__).resolve().parents[1]
OPENF1_BASE_URL = "https://api.openf1.org/v1"
DRIVER_NUMBER = 81
SESSION_NAMES = {
    "practice_1": "Practice 1",
    "practice_2": "Practice 2",
    "practice_3": "Practice 3",
    "sprint_qualifying": "Sprint Qualifying",
    "sprint": "Sprint",
    "qualifying": "Qualifying",
    "race": "Race",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch Oscar's latest completed F1 session result.")
    parser.add_argument("--calendar", default=str(ROOT / "data" / "calendar.json"))
    parser.add_argument("--output", default=str(ROOT / "data" / "session-results.json"))
    parser.add_argument("--now", help="Override current UTC time, ISO-8601 format.")
    parser.add_argument("--confirmation-minutes", type=int, default=15)
    return parser.parse_args()


def utc_now(value: str | None = None) -> datetime:
    return parse_time(value) or datetime.now(timezone.utc)


def isoformat(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def read_json(path: Path, fallback: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def fetch_json(url: str) -> Any:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "piasnews/0.8 (+https://github.com/ZnonYmitY/piasnews)"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def latest_completed_session(
    calendar: dict[str, Any], now: datetime, confirmation_minutes: int
) -> tuple[dict[str, Any], str, datetime] | None:
    candidates: list[tuple[datetime, dict[str, Any], str]] = []
    for race in calendar.get("races") or []:
        sessions = dict(race.get("sessions") or {})
        if race.get("race_start"):
            sessions.setdefault("race", race["race_start"])
        for session, duration in SESSION_DURATIONS.items():
            started = parse_time(sessions.get(session))
            if not started:
                continue
            ready = started + timedelta(minutes=duration + max(0, confirmation_minutes))
            if ready <= now:
                candidates.append((ready, race, session))
    if not candidates:
        return None
    ready, race, session = max(candidates, key=lambda row: row[0])
    return race, session, ready


def session_ref(race: dict[str, Any], session: str) -> str:
    return f"{race.get('id') or race.get('name') or 'race'}:{session}"


def openf1_url(endpoint: str, **params: Any) -> str:
    query = urllib.parse.urlencode({key: value for key, value in params.items() if value not in (None, "")})
    return f"{OPENF1_BASE_URL}/{endpoint}?{query}"


def choose_session(rows: list[dict[str, Any]], expected_start: datetime) -> dict[str, Any] | None:
    candidates = []
    for row in rows:
        started = parse_time(row.get("date_start"))
        if not started:
            continue
        distance = abs((started - expected_start).total_seconds())
        candidates.append((distance, row))
    if not candidates:
        return None
    distance, row = min(candidates, key=lambda candidate: candidate[0])
    return row if distance <= 24 * 3600 else None


def result_status(result: dict[str, Any]) -> str:
    if result.get("dsq"):
        return "DSQ"
    if result.get("dns"):
        return "DNS"
    if result.get("dnf"):
        return "DNF"
    return "classified"


def result_position(result: dict[str, Any]) -> int | None:
    value = result.get("position")
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


def fetch_latest_result(
    calendar: dict[str, Any],
    *,
    now: datetime,
    confirmation_minutes: int = 15,
    fetcher: Callable[[str], Any] = fetch_json,
) -> tuple[str | None, dict[str, Any] | None, str | None]:
    completed = latest_completed_session(calendar, now, confirmation_minutes)
    if not completed:
        return None, None, None
    race, session, _ready = completed
    ref = session_ref(race, session)
    expected_start = parse_time((race.get("sessions") or {}).get(session) or race.get("race_start"))
    if not expected_start:
        return ref, None, "calendar_session_start_missing"

    sessions_url = openf1_url(
        "sessions",
        year=race.get("season") or expected_start.year,
        country_name=race.get("country"),
        session_name=SESSION_NAMES[session],
    )
    try:
        session_rows = fetcher(sessions_url)
        openf1_session = choose_session(session_rows if isinstance(session_rows, list) else [], expected_start)
        if not openf1_session:
            return ref, None, "openf1_session_missing"
        session_key = openf1_session.get("session_key")
        result_url = openf1_url("session_result", session_key=session_key, driver_number=DRIVER_NUMBER)
        result_rows = fetcher(result_url)
        result = (result_rows or [None])[0] if isinstance(result_rows, list) else None
        if not isinstance(result, dict):
            return ref, None, "openf1_result_pending"
    except Exception as exc:  # noqa: BLE001 - keep the previous valid result and retry at the next gate
        return ref, None, f"openf1_unavailable:{type(exc).__name__}"

    position = result_position(result)
    status = result_status(result)
    if status == "classified" and not isinstance(position, int):
        return ref, None, "openf1_result_incomplete"
    source_url = openf1_url("session_result", session_key=session_key, driver_number=DRIVER_NUMBER)
    return ref, {
        "session_ref": ref,
        "race_id": race.get("id"),
        "race_name": race.get("name"),
        "race_name_zh": race.get("name_zh"),
        "session": session,
        "session_name": SESSION_NAMES[session],
        "session_key": session_key,
        "session_start": isoformat(expected_start),
        "session_end": openf1_session.get("date_end"),
        "driver_number": DRIVER_NUMBER,
        "position": position,
        "status": status,
        "dnf": bool(result.get("dnf")),
        "dns": bool(result.get("dns")),
        "dsq": bool(result.get("dsq")),
        "number_of_laps": result.get("number_of_laps"),
        "gap_to_leader": result.get("gap_to_leader"),
        "duration": result.get("duration"),
        "source": "OpenF1",
        "source_url": source_url,
        "fetched_at": isoformat(now),
    }, None


def build_payload(
    calendar: dict[str, Any],
    previous: dict[str, Any],
    *,
    now: datetime,
    confirmation_minutes: int = 15,
    fetcher: Callable[[str], Any] = fetch_json,
) -> dict[str, Any]:
    attempted_ref, latest, error = fetch_latest_result(
        calendar,
        now=now,
        confirmation_minutes=confirmation_minutes,
        fetcher=fetcher,
    )
    payload = {
        "schema_version": 1,
        "generated_at": isoformat(now),
        "driver_number": DRIVER_NUMBER,
        "source": "OpenF1 session_result",
        "attempted_session_ref": attempted_ref,
        "result_available": latest is not None,
        "latest": latest if latest is not None else previous.get("latest"),
    }
    if error:
        payload["last_error"] = error
    return payload


def main() -> int:
    args = parse_args()
    output = Path(args.output)
    previous = read_json(output, {"schema_version": 1, "latest": None})
    payload = build_payload(
        read_json(Path(args.calendar), {"races": []}),
        previous,
        now=utc_now(args.now),
        confirmation_minutes=args.confirmation_minutes,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if payload["result_available"]:
        latest = payload["latest"]
        print(f"Fetched session result {latest['session_ref']}: {latest['status']} position={latest.get('position')}")
    else:
        print(f"Session result pending for {payload.get('attempted_session_ref')}: {payload.get('last_error') or 'none'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
