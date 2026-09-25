#!/usr/bin/env python3
"""Fetch Oscar Piastri's latest completed-session result from OpenF1."""

from __future__ import annotations

import argparse
import json
import os
import re
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
F1_STATIC_BASE_URL = "https://livetiming.formula1.com/static"
USER_AGENT = "piasnews/0.8 (+https://github.com/ZnonYmitY/piasnews)"
DRIVER_NUMBER = 81
MAX_RESULT_HISTORY = 160
RESULT_RECORD_FIELDS = (
    "session_ref", "race_id", "race_name", "race_name_zh", "session", "session_name", "session_key",
    "session_start", "session_end", "driver_number", "position", "status", "dnf", "dns", "dsq",
    "number_of_laps", "gap_to_leader", "duration", "source", "source_url", "fetched_at", "first_ranked_at",
    "provisional",
)
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


class F1StaticRequestError(RuntimeError):
    """A safe Formula 1 static timing error suitable for fallback handling."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


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


def fetch_f1_resource(url: str) -> Any:
    """Fetch a trusted Formula 1 static JSON document or JSON stream."""
    parsed_url = urllib.parse.urlsplit(url)
    if (
        parsed_url.scheme != "https"
        or parsed_url.hostname != "livetiming.formula1.com"
        or parsed_url.username
        or parsed_url.password
        or parsed_url.port
        or parsed_url.query
        or parsed_url.fragment
        or not parsed_url.path.startswith("/static/")
    ):
        raise F1StaticRequestError("f1_static_target_rejected")
    request = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            body = response.read().decode("utf-8-sig")
    except urllib.error.HTTPError as error:
        raise F1StaticRequestError(f"f1_static_http_{int(error.code)}") from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise F1StaticRequestError("f1_static_network_unavailable") from None
    except UnicodeDecodeError:
        raise F1StaticRequestError("f1_static_invalid_text") from None
    if parsed_url.path.endswith(".jsonStream"):
        return body
    try:
        return json.loads(body)
    except (json.JSONDecodeError, TypeError):
        raise F1StaticRequestError("f1_static_invalid_json") from None


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


def nonnegative_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value if value >= 0 else None
    if isinstance(value, float) and value.is_integer():
        return int(value) if value >= 0 else None
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


def f1_static_url(year: int, path: str = "") -> str:
    """Build only same-origin Formula 1 static URLs from an Index.json path."""
    year_text = str(year)
    if not path:
        return f"{F1_STATIC_BASE_URL}/{year_text}/Index.json"
    if (
        path.startswith("/")
        or not path.startswith(f"{year_text}/")
        or ".." in path.split("/")
        or "\\" in path
        or "?" in path
        or "#" in path
        or "//" in path
        or not re.fullmatch(r"[A-Za-z0-9_./-]+", path)
    ):
        raise F1StaticRequestError("f1_static_path_rejected")
    return f"{F1_STATIC_BASE_URL}/{urllib.parse.quote(path, safe='/-_.')}"


def parse_gmt_offset(value: Any) -> timedelta | None:
    if not isinstance(value, str):
        return None
    matched = re.fullmatch(r"([+-]?)(\d{2}):(\d{2}):(\d{2})", value.strip())
    if not matched:
        return None
    sign, hours, minutes, seconds = matched.groups()
    if int(minutes) > 59 or int(seconds) > 59:
        return None
    offset = timedelta(hours=int(hours), minutes=int(minutes), seconds=int(seconds))
    return -offset if sign == "-" else offset


def f1_session_time(row: dict[str, Any], field: str) -> datetime | None:
    value = row.get(field)
    if not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is not None:
        return parsed.astimezone(timezone.utc)
    offset = parse_gmt_offset(row.get("GmtOffset"))
    if offset is None:
        return None
    return parsed.replace(tzinfo=timezone.utc) - offset


def choose_f1_static_session(
    index: Any, *, expected_start: datetime, expected_name: str
) -> dict[str, Any] | None:
    if not isinstance(index, dict) or not isinstance(index.get("Meetings"), list):
        return None
    expected_normalized = " ".join(expected_name.casefold().split())
    candidates: list[tuple[float, dict[str, Any]]] = []
    for meeting in index["Meetings"]:
        if not isinstance(meeting, dict) or not isinstance(meeting.get("Sessions"), list):
            continue
        for row in meeting["Sessions"]:
            if not isinstance(row, dict) or not isinstance(row.get("Path"), str):
                continue
            name = row.get("Name")
            if not isinstance(name, str) or " ".join(name.casefold().split()) != expected_normalized:
                continue
            started = f1_session_time(row, "StartDate")
            if started is None:
                continue
            candidates.append((abs((started - expected_start).total_seconds()), row))
    if not candidates:
        return None
    distance, selected = min(candidates, key=lambda candidate: candidate[0])
    return selected if distance <= 24 * 3600 else None


def parse_json_stream(value: Any) -> list[dict[str, Any]] | None:
    if not isinstance(value, str):
        return None
    messages: list[dict[str, Any]] = []
    for raw_line in value.lstrip("\ufeff").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        start = line.find("{")
        if start < 0:
            return None
        try:
            message = json.loads(line[start:])
        except (json.JSONDecodeError, TypeError):
            return None
        if not isinstance(message, dict):
            return None
        messages.append(message)
    return messages or None


def merge_stream(messages: list[dict[str, Any]]) -> dict[str, Any]:
    """Apply the nested object patches used by F1's jsonStream resources."""
    state: dict[str, Any] = {}

    def merge(target: dict[str, Any], patch: dict[str, Any]) -> None:
        for key, value in patch.items():
            if isinstance(value, dict):
                if value.get("_deleted") is True:
                    target.pop(key, None)
                    continue
                child = target.get(key)
                if not isinstance(child, dict):
                    child = {}
                    target[key] = child
                merge(child, value)
            else:
                target[key] = value

    for message in messages:
        merge(state, message)
    return state


def validated_f1_timing_result(
    driver_stream: Any, timing_stream: Any
) -> tuple[dict[str, Any], dict[str, Any]] | None:
    driver_messages, timing_messages = parse_json_stream(driver_stream), parse_json_stream(timing_stream)
    if driver_messages is None or timing_messages is None:
        return None
    drivers, timing = merge_stream(driver_messages), merge_stream(timing_messages).get("Lines")
    if not isinstance(timing, dict) or not drivers or not timing:
        return None

    driver_by_number: dict[str, dict[str, Any]] = {}
    for key, driver in drivers.items():
        if not isinstance(key, str) or not isinstance(driver, dict):
            return None
        racing_number = str(driver.get("RacingNumber") or "").strip()
        tla = driver.get("Tla")
        if not racing_number.isdigit() or key != racing_number or not isinstance(tla, str) or len(tla.strip()) != 3:
            return None
        if racing_number in driver_by_number:
            return None
        driver_by_number[racing_number] = driver
    piastri = driver_by_number.get(str(DRIVER_NUMBER))
    if piastri is None or piastri.get("Tla") != "PIA":
        return None

    positioned: dict[str, tuple[int, dict[str, Any]]] = {}
    for key, row in timing.items():
        if not isinstance(key, str) or not isinstance(row, dict) or key not in driver_by_number:
            return None
        row_number = row.get("RacingNumber")
        if row_number is not None and str(row_number).strip() != key:
            return None
        position = result_position({"position": row.get("Position")})
        if position is None:
            return None
        positioned[key] = (position, row)
    positions = [position for position, _row in positioned.values()]
    if len(positioned) != len(driver_by_number) or sorted(positions) != list(range(1, len(positions) + 1)):
        return None
    piastri_timing = positioned.get(str(DRIVER_NUMBER))
    if piastri_timing is None:
        return None
    return piastri_timing[1], piastri


def fetch_f1_static_result(
    race: dict[str, Any],
    session: str,
    *,
    ref: str,
    expected_start: datetime,
    now: datetime,
    fetcher: Callable[[str], Any],
) -> tuple[dict[str, Any] | None, str | None]:
    year = race.get("season") or expected_start.year
    if type(year) is not int or year < 1950 or year > 2200:
        return None, "f1_static_year_invalid"
    try:
        index = fetcher(f1_static_url(year))
        selected = choose_f1_static_session(
            index, expected_start=expected_start, expected_name=SESSION_NAMES[session]
        )
        if selected is None:
            return None, "f1_static_session_missing"
        session_key = selected.get("Key")
        if type(session_key) is not int or session_key <= 0:
            return None, "f1_static_session_invalid"
        path = selected.get("Path")
        status_messages = parse_json_stream(fetcher(f1_static_url(year, f"{path}SessionStatus.jsonStream")))
        if status_messages is None or merge_stream(status_messages).get("Started") != "Finished":
            return None, "f1_static_session_not_finished"
        timing_url = f1_static_url(year, f"{path}TimingData.jsonStream")
        result = validated_f1_timing_result(
            fetcher(f1_static_url(year, f"{path}DriverList.jsonStream")),
            fetcher(timing_url),
        )
        if result is None:
            return None, "f1_static_result_invalid"
    except (F1StaticRequestError, OpenF1RequestError) as exc:
        return None, exc.code

    timing, _driver = result
    position = result_position({"position": timing.get("Position")})
    retired = timing.get("Retired") is True
    laps = nonnegative_int(timing.get("NumberOfLaps"))
    end = f1_session_time(selected, "EndDate")
    return {
        "session_ref": ref,
        "race_id": race.get("id"),
        "race_name": race.get("name"),
        "race_name_zh": race.get("name_zh"),
        "session": session,
        "session_name": SESSION_NAMES[session],
        "session_key": session_key,
        "session_start": isoformat(expected_start),
        "session_end": isoformat(end) if end else None,
        "driver_number": DRIVER_NUMBER,
        "position": position,
        "status": "DNF" if retired else "classified",
        "dnf": retired,
        "dns": False,
        "dsq": False,
        "number_of_laps": laps,
        "gap_to_leader": timing.get("GapToLeader"),
        "duration": None,
        "source": "Formula 1 Live Timing",
        "source_url": timing_url,
        "provisional": True,
        "fetched_at": isoformat(now),
    }, None


def fetch_latest_result(
    calendar: dict[str, Any],
    *,
    now: datetime,
    confirmation_minutes: int = 15,
    fetcher: Callable[[str], Any] = fetch_json,
    f1_fetcher: Callable[[str], Any] | None = None,
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
    openf1_error: str | None = None
    should_try_fallback = False
    try:
        session_rows = fetcher(sessions_url)
        openf1_session = choose_session(session_rows if isinstance(session_rows, list) else [], expected_start)
        if not openf1_session:
            openf1_error = "openf1_session_missing"
            should_try_fallback = True
        else:
            session_key = openf1_session.get("session_key")
            result_url = openf1_url("session_result", session_key=session_key, driver_number=DRIVER_NUMBER)
            result_rows = fetcher(result_url)
            result = (result_rows or [None])[0] if isinstance(result_rows, list) else None
            if not isinstance(result, dict):
                openf1_error = "openf1_result_pending"
                should_try_fallback = True
    except OpenF1RequestError as exc:
        openf1_error = exc.code
        should_try_fallback = True

    if openf1_error is None:
        position = result_position(result)
        status = result_status(result)
        if status == "classified" and not isinstance(position, int):
            openf1_error = "openf1_result_incomplete"
            should_try_fallback = True
        else:
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
                "provisional": False,
                "fetched_at": isoformat(now),
            }, None

    if should_try_fallback:
        fallback_fetcher = f1_fetcher or (fetch_f1_resource if fetcher is fetch_json else fetcher)
        fallback, _fallback_error = fetch_f1_static_result(
            race,
            session,
            ref=ref,
            expected_start=expected_start,
            now=now,
            fetcher=fallback_fetcher,
        )
        if fallback is not None:
            return ref, fallback, None
    return ref, None, openf1_error


def history_record(value: Any, *, now: datetime) -> dict[str, Any] | None:
    """Validate one already collected result; never infer missing session data."""
    if not isinstance(value, dict) or type(value.get("driver_number")) is not int or value.get("driver_number") != DRIVER_NUMBER:
        return None
    ref, session = value.get("session_ref"), value.get("session")
    if not isinstance(ref, str) or not ref.strip() or len(ref) > 200 or not isinstance(session, str) or session not in SESSION_NAMES:
        return None
    if not ref.endswith(f":{session}") or ref == f":{session}":
        return None
    start_value, fetched_value = value.get("session_start"), value.get("fetched_at")
    if not isinstance(start_value, str) or not isinstance(fetched_value, str):
        return None
    start, fetched = parse_time(start_value), parse_time(fetched_value)
    if start is None or fetched is None or not start <= fetched <= now:
        return None
    end_value = value.get("session_end")
    if end_value is not None:
        end = parse_time(end_value) if isinstance(end_value, str) else None
        if end is None or not start <= end <= fetched:
            return None
    position = value.get("position")
    if position is not None and (type(position) is not int or not 1 <= position <= 30):
        return None
    flags = [value.get(name, False) for name in ("dnf", "dns", "dsq")]
    if any(type(flag) is not bool for flag in flags) or position is None and not any(flags):
        return None
    if value.get("status") != result_status(value):
        return None
    laps = value.get("number_of_laps")
    if laps is not None and (type(laps) is not int or laps < 0):
        return None
    source_url = value.get("source_url")
    if not isinstance(source_url, str) or len(source_url) > 2048:
        return None
    try:
        parsed_source = urllib.parse.urlsplit(source_url)
        if parsed_source.scheme != "https" or parsed_source.username or parsed_source.password or parsed_source.port:
            return None
        session_key = value.get("session_key")
        if type(session_key) is not int or session_key <= 0:
            return None
        provider, provisional = value.get("source"), value.get("provisional")
        if provider == "OpenF1":
            query = urllib.parse.parse_qs(parsed_source.query)
            if provisional not in (None, False):
                return None
            if (
                parsed_source.hostname != "api.openf1.org"
                or parsed_source.path != "/v1/session_result"
                or parsed_source.fragment
                or query.get("driver_number") != ["81"]
                or query.get("session_key") != [str(session_key)]
            ):
                return None
        elif provider == "Formula 1 Live Timing":
            if provisional is not True or parsed_source.hostname != "livetiming.formula1.com":
                return None
            if parsed_source.query or parsed_source.fragment or not re.fullmatch(
                r"/static/(\d{4})/[A-Za-z0-9_-]+/[A-Za-z0-9_-]+/TimingData\.jsonStream",
                parsed_source.path,
            ):
                return None
            source_year = int(parsed_source.path.split("/", 4)[2])
            if source_year != start.year:
                return None
        else:
            return None
    except ValueError:
        return None
    record = {field: value[field] for field in RESULT_RECORD_FIELDS if field in value}
    first_value = record.get("first_ranked_at")
    first = parse_time(first_value) if isinstance(first_value, str) else None
    # A legacy snapshot can establish only its own collection time, never the
    # current build time or a conjectured earlier first appearance.
    if first is None or not start <= first <= fetched:
        record["first_ranked_at"] = fetched_value
    return record


def merge_result_history(
    previous: dict[str, Any], latest: dict[str, Any] | None, *, now: datetime
) -> list[dict[str, Any]]:
    """Bounded archive of observed records; provider revisions replace by ref."""
    existing = previous.get("results")
    candidates = [(record, False) for record in existing] if isinstance(existing, list) else []
    candidates.extend([(previous.get("latest"), False), (latest, True)])
    by_ref: dict[str, dict[str, Any]] = {}
    for candidate, is_current_provider_record in candidates:
        record = history_record(candidate, now=now)
        if record is None:
            continue
        ref = record["session_ref"]
        old = by_ref.get(ref)
        if old is not None:
            first = min([old, record], key=lambda item: parse_time(item["first_ranked_at"]))["first_ranked_at"]
            # Archived observations win ties over legacy previous.latest. Only
            # this run's explicit provider record can revise an equal-time row.
            observed, old_observed = parse_time(record["fetched_at"]), parse_time(old["fetched_at"])
            if observed < old_observed or observed == old_observed and not is_current_provider_record:
                record = dict(old)
            record["first_ranked_at"] = first
        by_ref[ref] = record
    return sorted(
        by_ref.values(), key=lambda item: (parse_time(item["session_start"]), item["session_ref"]), reverse=True
    )[:MAX_RESULT_HISTORY]


def build_payload(
    calendar: dict[str, Any],
    previous: dict[str, Any],
    *,
    now: datetime,
    confirmation_minutes: int = 15,
    fetcher: Callable[[str], Any] = fetch_json,
    f1_fetcher: Callable[[str], Any] | None = None,
) -> dict[str, Any]:
    attempted_ref, latest, error = fetch_latest_result(
        calendar,
        now=now,
        confirmation_minutes=confirmation_minutes,
        fetcher=fetcher,
        f1_fetcher=f1_fetcher,
    )
    history = merge_result_history(previous, None, now=now)
    if latest is not None:
        previous_latest = previous.get("latest") or {}
        if not isinstance(previous_latest, dict):
            previous_latest = {}
        if previous_latest.get("session_ref") != latest.get("session_ref"):
            previous_latest = next((record for record in history if record["session_ref"] == latest.get("session_ref")), {})
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
        "source": "OpenF1 session_result with Formula 1 Live Timing fallback",
        "attempted_session_ref": attempted_ref,
        "result_available": latest is not None,
        "latest": latest if latest is not None else previous.get("latest"),
        "results": merge_result_history({"results": history}, latest, now=now),
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
        f1_fetcher=fetch_f1_resource,
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
