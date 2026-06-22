#!/usr/bin/env python3
"""Fetch and normalize the current Formula 1 calendar for static publication."""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


API_TEMPLATE = "https://api.jolpi.ca/ergast/f1/{year}.json"
OFFICIAL_CALENDAR_TEMPLATE = "https://www.formula1.com/en/racing/{year}"
HTTP_TIMEOUT_SECONDS = 30

RACE_NAMES_ZH = {
    "Australian Grand Prix": "澳大利亚大奖赛",
    "Chinese Grand Prix": "中国大奖赛",
    "Japanese Grand Prix": "日本大奖赛",
    "Bahrain Grand Prix": "巴林大奖赛",
    "Saudi Arabian Grand Prix": "沙特阿拉伯大奖赛",
    "Miami Grand Prix": "迈阿密大奖赛",
    "Canadian Grand Prix": "加拿大大奖赛",
    "Monaco Grand Prix": "摩纳哥大奖赛",
    "Barcelona Grand Prix": "巴塞罗那-加泰罗尼亚大奖赛",
    "Austrian Grand Prix": "奥地利大奖赛",
    "British Grand Prix": "英国大奖赛",
    "Belgian Grand Prix": "比利时大奖赛",
    "Hungarian Grand Prix": "匈牙利大奖赛",
    "Dutch Grand Prix": "荷兰大奖赛",
    "Italian Grand Prix": "意大利大奖赛",
    "Spanish Grand Prix": "西班牙大奖赛",
    "Azerbaijan Grand Prix": "阿塞拜疆大奖赛",
    "Singapore Grand Prix": "新加坡大奖赛",
    "United States Grand Prix": "美国大奖赛",
    "Mexico City Grand Prix": "墨西哥城大奖赛",
    "São Paulo Grand Prix": "圣保罗大奖赛",
    "Las Vegas Grand Prix": "拉斯维加斯大奖赛",
    "Qatar Grand Prix": "卡塔尔大奖赛",
    "Abu Dhabi Grand Prix": "阿布扎比大奖赛",
}

COUNTRY_CODES = {
    "Australia": "AUS",
    "China": "CHN",
    "Japan": "JPN",
    "Bahrain": "BHR",
    "Saudi Arabia": "SAU",
    "USA": "USA",
    "Canada": "CAN",
    "Monaco": "MCO",
    "Spain": "ESP",
    "Austria": "AUT",
    "UK": "GBR",
    "Belgium": "BEL",
    "Hungary": "HUN",
    "Netherlands": "NLD",
    "Italy": "ITA",
    "Azerbaijan": "AZE",
    "Singapore": "SGP",
    "Mexico": "MEX",
    "Brazil": "BRA",
    "Qatar": "QAT",
    "UAE": "ARE",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--year", type=int, help="Season year. Defaults to the current UTC year.")
    parser.add_argument("--now", help="Override current time with an ISO-8601 value.")
    parser.add_argument("--output", default="data/calendar.json", help="Output JSON path.")
    return parser.parse_args()


def parse_now(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def fetch_json(url: str) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "piasnews-calendar/1.0 (+https://github.com/ZnonYmitY/piasnews)",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode("utf-8"))


def session_datetime(session: dict[str, Any] | None) -> datetime | None:
    if not session or not session.get("date") or not session.get("time"):
        return None
    time_value = session["time"]
    parsed = datetime.fromisoformat(f"{session['date']}T{time_value}".replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def iso_value(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.isoformat().replace("+00:00", "Z")


def normalize_race(raw: dict[str, Any], year: int) -> dict[str, Any]:
    circuit = raw.get("Circuit") or {}
    location = circuit.get("Location") or {}
    race_start = session_datetime({"date": raw.get("date"), "time": raw.get("time")})
    sessions = {
        "practice_1": session_datetime(raw.get("FirstPractice")),
        "practice_2": session_datetime(raw.get("SecondPractice")),
        "practice_3": session_datetime(raw.get("ThirdPractice")),
        "sprint_qualifying": session_datetime(raw.get("SprintQualifying")),
        "sprint": session_datetime(raw.get("Sprint")),
        "qualifying": session_datetime(raw.get("Qualifying")),
        "race": race_start,
    }
    known_sessions = [value for value in sessions.values() if value is not None]
    race_name = str(raw.get("raceName") or "Formula 1 Grand Prix")
    country = str(location.get("country") or "")
    round_number = int(raw.get("round") or 0)

    return {
        "id": f"{year}-round-{round_number}",
        "season": year,
        "round": round_number,
        "name": race_name,
        "name_zh": RACE_NAMES_ZH.get(race_name, race_name),
        "country": country,
        "country_code": COUNTRY_CODES.get(country, country[:3].upper()),
        "locality": location.get("locality"),
        "circuit": circuit.get("circuitName"),
        "circuit_id": circuit.get("circuitId"),
        "weekend_start": iso_value(min(known_sessions) if known_sessions else race_start),
        "race_start": iso_value(race_start),
        "sessions": {key: iso_value(value) for key, value in sessions.items() if value is not None},
        "official_url": OFFICIAL_CALENDAR_TEMPLATE.format(year=year),
    }


def build_calendar(payload: dict[str, Any], now: datetime, year: int) -> dict[str, Any]:
    race_table = payload.get("MRData", {}).get("RaceTable", {})
    raw_races = race_table.get("Races") or []
    races = [normalize_race(raw, year) for raw in raw_races]
    races = [race for race in races if race["race_start"]]
    races.sort(key=lambda race: race["race_start"])
    next_race = next(
        (race for race in races if datetime.fromisoformat(race["race_start"].replace("Z", "+00:00")) > now),
        None,
    )
    api_url = API_TEMPLATE.format(year=year)

    return {
        "generated_at": now.isoformat().replace("+00:00", "Z"),
        "season": year,
        "race_count": len(races),
        "next_race": next_race,
        "races": races,
        "source": {
            "provider": "Jolpica F1 API",
            "api_url": api_url,
            "official_calendar_url": OFFICIAL_CALENDAR_TEMPLATE.format(year=year),
        },
    }


def main() -> int:
    args = parse_args()
    now = parse_now(args.now)
    year = args.year or now.year
    output_path = Path(args.output)
    api_url = API_TEMPLATE.format(year=year)

    try:
        payload = fetch_json(api_url)
        calendar = build_calendar(payload, now, year)
        if not calendar["races"]:
            raise ValueError(f"No Formula 1 races returned for {year}")
    except (OSError, ValueError, KeyError, json.JSONDecodeError, urllib.error.URLError) as exc:
        if output_path.exists():
            print(f"Calendar refresh failed; keeping {output_path}: {exc}", file=sys.stderr)
            return 0
        print(f"Calendar refresh failed and no fallback exists: {exc}", file=sys.stderr)
        return 1

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(calendar, indent=2, ensure_ascii=False) + "\n")
    print(f"Fetched {calendar['race_count']} races for {year} into {output_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
