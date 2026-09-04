#!/usr/bin/env python3
"""Collect an official X account across its public history with explicit coverage.

The raw output defaults to /tmp so a public skill package does not mirror an
account's full post text. OpenCLI reuses the user's signed-in browser session.
The collector searches yearly windows, splits windows that reach the result
limit, checkpoints after every request, and stops immediately on rate limits.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any


DEFAULT_HANDLE = "OscarPiastri"
DEFAULT_START = date(2016, 5, 9)
DEFAULT_OUTPUT = Path("/tmp/piastri-x-history-raw.json")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect public X history with dated coverage windows.")
    parser.add_argument("--handle", default=DEFAULT_HANDLE)
    parser.add_argument("--start", default=DEFAULT_START.isoformat(), help="Inclusive date, YYYY-MM-DD.")
    parser.add_argument(
        "--end",
        default=(datetime.now(timezone.utc).date() + timedelta(days=1)).isoformat(),
        help="Exclusive date, YYYY-MM-DD.",
    )
    parser.add_argument("--limit-per-window", type=int, default=1000)
    parser.add_argument("--page-timeout", type=int, default=240)
    parser.add_argument("--delay", type=float, default=3.0)
    parser.add_argument("--opencli-cmd", default="opencli")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--restart", action="store_true", help="Ignore an existing checkpoint.")
    return parser.parse_args()


def parse_day(value: str) -> date:
    return date.fromisoformat(value)


def yearly_windows(start: date, end: date) -> list[tuple[date, date]]:
    windows: list[tuple[date, date]] = []
    cursor = start
    while cursor < end:
        next_year = date(cursor.year + 1, 1, 1)
        boundary = min(next_year, end)
        windows.append((cursor, boundary))
        cursor = boundary
    return windows


def window_key(start: date, end: date) -> str:
    return f"{start.isoformat()}/{end.isoformat()}"


def split_window(start: date, end: date) -> tuple[tuple[date, date], tuple[date, date]] | None:
    width = (end - start).days
    if width <= 1:
        return None
    middle = start + timedelta(days=max(1, width // 2))
    return (start, middle), (middle, end)


def extract_json(stdout: str) -> list[dict[str, Any]]:
    start = stdout.find("[")
    end = stdout.rfind("]")
    if start < 0 or end < start:
        raise ValueError("OpenCLI output did not contain a JSON array")
    value = json.loads(stdout[start : end + 1])
    if not isinstance(value, list):
        raise ValueError("OpenCLI output was not a list")
    return [row for row in value if isinstance(row, dict)]


def normalize(row: dict[str, Any], handle: str) -> dict[str, Any] | None:
    item_id = str(row.get("id") or "").strip()
    if not item_id:
        return None
    text = str(row.get("text") or "").strip()
    url = str(row.get("url") or f"https://x.com/{handle}/status/{item_id}")
    if "/i/status/" in url:
        url = f"https://x.com/{handle}/status/{item_id}"
    if bool(row.get("is_retweet")) or text.upper().startswith("RT @"):
        kind = "repost"
    elif text.startswith("@"):
        kind = "reply"
    else:
        kind = "post"
    return {
        "id": item_id,
        "url": url,
        "created_at": row.get("created_at"),
        "kind": kind,
        "text": text,
        "likes": row.get("likes"),
        "retweets": row.get("retweets"),
        "replies": row.get("replies"),
        "views": row.get("views"),
        "has_media": bool(row.get("has_media")),
        "media_urls": row.get("media_urls") or [],
        "quoted_tweet": row.get("quoted_tweet"),
    }


def load_checkpoint(path: Path, restart: bool) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    if restart or not path.exists():
        return [], {}
    value = json.loads(path.read_text(encoding="utf-8"))
    coverage = [row for row in value.get("coverage", []) if isinstance(row, dict)]
    items = {
        str(row["id"]): row
        for row in value.get("items", [])
        if isinstance(row, dict) and row.get("id")
    }
    return coverage, items


def summarize(items: dict[str, dict[str, Any]]) -> dict[str, Any]:
    values = list(items.values())
    kinds = {"post": 0, "reply": 0, "repost": 0}
    for row in values:
        kinds[row.get("kind", "post")] = kinds.get(row.get("kind", "post"), 0) + 1
    ordered = sorted(values, key=lambda row: str(row.get("id", "")), reverse=True)
    return {
        "unique_items": len(values),
        "kinds": kinds,
        "with_media": sum(1 for row in values if row.get("has_media")),
        "newest": ordered[0].get("created_at") if ordered else None,
        "oldest": ordered[-1].get("created_at") if ordered else None,
    }


def save(
    path: Path,
    handle: str,
    start: date,
    end: date,
    limit: int,
    coverage: list[dict[str, Any]],
    items: dict[str, dict[str, Any]],
    status: str,
) -> None:
    payload = {
        "schema_version": "1.0",
        "handle": handle,
        "requested_window": window_key(start, end),
        "retrieval_method": "opencli twitter search; product=live; dated windows",
        "retrieved_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "limit_per_window": limit,
        "status": status,
        "summary": summarize(items),
        "coverage": coverage,
        "items": sorted(items.values(), key=lambda row: str(row.get("id", "")), reverse=True),
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def fetch_window(args: argparse.Namespace, start: date, end: date) -> tuple[list[dict[str, Any]], str | None]:
    query = f"from:{args.handle} since:{start.isoformat()} until:{end.isoformat()}"
    cmd = [
        args.opencli_cmd,
        "twitter",
        "search",
        query,
        "--product",
        "live",
        "--limit",
        str(args.limit_per_window),
        "--window",
        "background",
        "--site-session",
        "persistent",
        "-f",
        "json",
    ]
    env = os.environ.copy()
    env["OPENCLI_BROWSER_COMMAND_TIMEOUT"] = str(args.page_timeout)
    try:
        result = subprocess.run(
            cmd,
            text=True,
            capture_output=True,
            env=env,
            timeout=args.page_timeout + 20,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return [], "OpenCLI subprocess timed out"
    if result.returncode != 0:
        return [], (result.stderr or result.stdout).strip()[-1600:]
    try:
        return extract_json(result.stdout), None
    except (ValueError, json.JSONDecodeError) as exc:
        return [], str(exc)


def main() -> int:
    args = parse_args()
    start = parse_day(args.start)
    end = parse_day(args.end)
    if start >= end:
        raise SystemExit("--start must be earlier than --end")
    if args.limit_per_window < 1:
        raise SystemExit("--limit-per-window must be positive")

    coverage, items = load_checkpoint(args.output, args.restart)
    completed = {
        row.get("window")
        for row in coverage
        if row.get("status") == "complete" and row.get("window")
    }
    queue = yearly_windows(start, end)
    status = "running"

    while queue:
        window_start, window_end = queue.pop(0)
        key = window_key(window_start, window_end)
        if key in completed:
            continue

        rows, error = fetch_window(args, window_start, window_end)
        if error:
            rate_limited = "429" in error or "rate-limit" in error.lower()
            status = "partial_rate_limited" if rate_limited else "partial_error"
            coverage.append({"window": key, "status": status, "error": error})
            save(args.output, args.handle, start, end, args.limit_per_window, coverage, items, status)
            print(json.dumps({"window": key, "status": status}, ensure_ascii=False), flush=True)
            return 75 if rate_limited else 1

        for raw in rows:
            item = normalize(raw, args.handle)
            if item:
                items[item["id"]] = item

        split = split_window(window_start, window_end) if len(rows) >= args.limit_per_window else None
        if split:
            coverage.append({
                "window": key,
                "status": "split_required",
                "count": len(rows),
                "reason": "result_count_reached_window_limit",
            })
            queue = [split[0], split[1], *queue]
        else:
            coverage.append({
                "window": key,
                "status": "complete",
                "count": len(rows),
                "newest": rows[0].get("created_at") if rows else None,
                "oldest": rows[-1].get("created_at") if rows else None,
            })
            completed.add(key)

        save(args.output, args.handle, start, end, args.limit_per_window, coverage, items, "running")
        print(
            json.dumps(
                {"window": key, "count": len(rows), "unique_total": len(items), "split": bool(split)},
                ensure_ascii=False,
            ),
            flush=True,
        )
        time.sleep(max(0.0, args.delay))

    status = "complete_for_visible_search_index"
    save(args.output, args.handle, start, end, args.limit_per_window, coverage, items, status)
    print(json.dumps({"status": status, **summarize(items)}, ensure_ascii=False), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
