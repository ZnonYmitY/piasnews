#!/usr/bin/env python3
"""Fetch Oscar Piastri's latest completed-session result from OpenF1."""

from __future__ import annotations

import argparse
import json
import os
import urllib.error
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
OPENF1_TOKEN_URL = "https://api.openf1.org/token"
USER_AGENT = "piasnews/0.8 (+https://github.com/ZnonYmitY/piasnews)"
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


class OpenF1RequestError(RuntimeError):
    """A safe, credential-free OpenF1 error suitable for persisted diagnostics."""

    def __init__(self, code: str, *, status: int | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.status = status


def safe_http_error(error: urllib.error.HTTPError, *, prefix: str = "openf1") -> OpenF1RequestError:
    detail = ""
    try:
        body = error.read(4096).decode("utf-8", errors="replace")
        parsed = json.loads(body)
        if isinstance(parsed, dict):
            detail = str(parsed.get("detail") or "")
    except (OSError, ValueError, TypeError):
        pass
    status = int(error.code)
    if status == 401 and "live f1 session" in detail.lower():
        code = f"{prefix}_http_401_live_access_requires_auth"
    else:
        code = f"{prefix}_http_{status}"
    return OpenF1RequestError(code, status=status)


class OpenF1Client:
    """Fetch JSON anonymously, upgrading once to OAuth when live access requires it."""

    def __init__(
        self,
        username: str | None = None,
        password: str | None = None,
        *,
        opener: Callable[..., Any] = urllib.request.urlopen,
    ) -> None:
        self.username = (username or "").strip()
        self.password = password or ""
        self.opener = opener
        self.access_token: str | None = None
        self.authentication = "anonymous"

    @classmethod
    def from_environment(cls) -> "OpenF1Client":
        username = os.environ.get("PIASNEWS_OPENF1_USERNAME") or os.environ.get("OPENF1_USERNAME")
        password = os.environ.get("PIASNEWS_OPENF1_PASSWORD") or os.environ.get("OPENF1_PASSWORD")
        return cls(username, password)

    def _request_json(
        self,
        url: str,
        *,
        data: bytes | None = None,
        access_token: str | None = None,
        error_prefix: str = "openf1",
    ) -> Any:
        headers = {
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
        }
        if data is not None:
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        request = urllib.request.Request(url, data=data, headers=headers)
        if access_token:
            parsed_url = urllib.parse.urlsplit(url)
            if parsed_url.scheme != "https" or parsed_url.hostname != "api.openf1.org":
                raise OpenF1RequestError("openf1_auth_target_rejected")
            request.add_unredirected_header("Authorization", f"Bearer {access_token}")
        try:
            with self.opener(request, timeout=20) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            raise safe_http_error(error, prefix=error_prefix) from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise OpenF1RequestError(f"{error_prefix}_network_unavailable") from None
        except (UnicodeDecodeError, json.JSONDecodeError, TypeError):
            raise OpenF1RequestError(f"{error_prefix}_invalid_json") from None

    def _obtain_access_token(self) -> str:
        if bool(self.username) != bool(self.password):
            raise OpenF1RequestError("openf1_auth_config_incomplete")
        if not self.username:
            raise OpenF1RequestError("openf1_auth_not_configured")
        data = urllib.parse.urlencode({"username": self.username, "password": self.password}).encode("utf-8")
        payload = self._request_json(OPENF1_TOKEN_URL, data=data, error_prefix="openf1_auth")
        token = payload.get("access_token") if isinstance(payload, dict) else None
        if not isinstance(token, str) or not token.strip():
            raise OpenF1RequestError("openf1_auth_token_missing")
        return token.strip()

    def fetch_json(self, url: str) -> Any:
        try:
            return self._request_json(url, access_token=self.access_token)
        except OpenF1RequestError as error:
            if error.status != 401:
                raise
            if self.access_token:
                raise OpenF1RequestError("openf1_auth_rejected", status=401) from None
            if not self.username and not self.password:
                raise
            self.access_token = self._obtain_access_token()
            self.authentication = "oauth"
            try:
                return self._request_json(url, access_token=self.access_token)
            except OpenF1RequestError as retry_error:
                if retry_error.status == 401:
                    raise OpenF1RequestError("openf1_auth_rejected", status=401) from None
                raise


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
    return OpenF1Client().fetch_json(url)


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
    except OpenF1RequestError as exc:
        return ref, None, exc.code

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
    if latest is not None:
        previous_latest = previous.get("latest") or {}
        if previous_latest.get("session_ref") == latest.get("session_ref"):
            latest["first_ranked_at"] = (
                previous_latest.get("first_ranked_at")
                or previous_latest.get("fetched_at")
                or latest["fetched_at"]
            )
        else:
            latest["first_ranked_at"] = latest["fetched_at"]
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
    client = OpenF1Client.from_environment()
    payload = build_payload(
        read_json(Path(args.calendar), {"races": []}),
        previous,
        now=utc_now(args.now),
        confirmation_minutes=args.confirmation_minutes,
        fetcher=client.fetch_json,
    )
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if payload["result_available"]:
        latest = payload["latest"]
        print(f"Fetched session result {latest['session_ref']}: {latest['status']} position={latest.get('position')}")
    else:
        error = payload.get("last_error") or "none"
        print(f"Session result pending for {payload.get('attempted_session_ref')}: {error}")
        if os.environ.get("GITHUB_ACTIONS") == "true" and error != "none":
            print(f"::warning title=OpenF1 session result unavailable::{error}")
            summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
            if summary_path:
                with Path(summary_path).open("a", encoding="utf-8") as summary:
                    summary.write("## OpenF1 session result pending\n\n")
                    summary.write(f"- Session: `{payload.get('attempted_session_ref') or 'unknown'}`\n")
                    summary.write(f"- Safe error code: `{error}`\n")
                    summary.write("- The session remains unhandled and will be retried.\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
