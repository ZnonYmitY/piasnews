#!/usr/bin/env python3
"""Collect X posts through Agent-Reach's active Twitter backend.

This script is intentionally local-first. It calls the `twitter` command that
Agent-Reach routes to, writes an import JSON file, and leaves normalization and
3-day filtering to `fetch_social_sources.py`.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


DEFAULT_IMPORT_OUTPUT = "/tmp/piasnews-agent-reach-social.json"
DEFAULT_TWITTER_CMD = "twitter"
AGENT_REACH_CONFIG = Path.home() / ".agent-reach" / "config.yaml"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect Piasnews X items through Agent-Reach/twitter-cli.")
    parser.add_argument("--sources", default="piasnews/references/x-sources.json", help="Piasnews X/IG source config.")
    parser.add_argument("--output", default=DEFAULT_IMPORT_OUTPUT, help="Import JSON output path.")
    parser.add_argument("--days", type=int, default=3, help="Recency window in days.")
    parser.add_argument("--per-source", type=int, default=20, help="Max posts to request per source.")
    parser.add_argument("--group", action="append", help="Optional source group to include, repeatable.")
    parser.add_argument("--twitter-cmd", default=os.environ.get("PIASNEWS_TWITTER_CMD", DEFAULT_TWITTER_CMD))
    parser.add_argument(
        "--method",
        choices=("user-posts", "search"),
        default="user-posts",
        help="twitter-cli method. user-posts is more stable; search can fail when X changes endpoints.",
    )
    parser.add_argument("--now", help="Override current UTC time, ISO-8601 format.")
    parser.add_argument("--update-social", action="store_true", help="Also update data/social.json after collection.")
    parser.add_argument("--social-output", default="data/social.json", help="Target social JSON when --update-social is set.")
    return parser.parse_args()


def parse_now(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def isoformat(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_datetime(value: Any) -> str | None:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    candidates = [
        "%a %b %d %H:%M:%S %z %Y",
        "%Y-%m-%d %H:%M:%S%z",
        "%Y-%m-%d %H:%M:%S",
    ]
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        parsed = None
    if parsed is None:
        for fmt in candidates:
            try:
                parsed = datetime.strptime(text, fmt)
                break
            except ValueError:
                continue
    if parsed is None:
        return text
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return isoformat(parsed)


def load_sources(path: Path, groups: set[str] | None) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text())
    sources = []
    for source in payload.get("sources", []):
        if source.get("platform") != "x" or source.get("enabled") is False:
            continue
        if groups and source.get("group") not in groups:
            continue
        sources.append(source)
    return sources


def load_agent_reach_twitter_env(config_path: Path = AGENT_REACH_CONFIG) -> dict[str, str]:
    """Bridge Agent-Reach's saved X cookies into twitter-cli env vars."""
    if os.environ.get("TWITTER_AUTH_TOKEN") and os.environ.get("TWITTER_CT0"):
        return {}
    if not config_path.exists():
        return {}

    values: dict[str, str] = {}
    for raw_line in config_path.read_text().splitlines():
        if ":" not in raw_line or raw_line.lstrip().startswith("#"):
            continue
        key, value = raw_line.split(":", 1)
        key = key.strip()
        value = value.strip().strip("'\"")
        if key in {"twitter_auth_token", "twitter_ct0"} and value:
            values[key] = value

    env: dict[str, str] = {}
    if values.get("twitter_auth_token"):
        env["TWITTER_AUTH_TOKEN"] = values["twitter_auth_token"]
    if values.get("twitter_ct0"):
        env["TWITTER_CT0"] = values["twitter_ct0"]
    return env


def tweet_items(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        return []
    for key in ("tweets", "items", "data", "results"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    return []


def text_from_tweet(tweet: dict[str, Any]) -> str:
    for key in ("text", "full_text", "content", "body"):
        value = tweet.get(key)
        if value:
            return str(value)
    return ""


def id_from_tweet(tweet: dict[str, Any]) -> str:
    for key in ("id", "tweet_id", "id_str", "rest_id"):
        value = tweet.get(key)
        if value:
            return str(value)
    url = str(tweet.get("url") or tweet.get("link") or "")
    return url.rstrip("/").split("/")[-1] if url else ""


def kind_from_tweet(tweet: dict[str, Any]) -> str:
    markers = ("retweeted", "is_retweet", "isRetweet", "is_repost", "repost")
    if any(bool(tweet.get(key)) for key in markers):
        return "repost"
    text = text_from_tweet(tweet).lstrip()
    if text.upper().startswith("RT @"):
        return "repost"
    return "post"


def normalize_raw_tweet(tweet: dict[str, Any], handle: str) -> dict[str, Any] | None:
    tweet_id = id_from_tweet(tweet)
    text = text_from_tweet(tweet)
    created_at = parse_datetime(
        tweet.get("created_at")
        or tweet.get("createdAtISO")
        or tweet.get("createdAt")
        or tweet.get("date")
        or tweet.get("time")
    )
    if not tweet_id or not text or not created_at:
        return None
    author = tweet.get("author") if isinstance(tweet.get("author"), dict) else {}
    author_handle = str(author.get("screenName") or author.get("username") or handle).lstrip("@")
    url = str(tweet.get("url") or tweet.get("link") or f"https://x.com/{author_handle}/status/{tweet_id}")
    metrics = tweet.get("metrics") or tweet.get("public_metrics") or {}
    return {
        "platform": "x",
        "handle": handle,
        "author_handle": author_handle,
        "id": tweet_id,
        "url": url,
        "text": text,
        "created_at": created_at,
        "kind": kind_from_tweet(tweet),
        "metrics": metrics,
        "language": tweet.get("lang") or tweet.get("language") or "unknown",
    }


def twitter_command(method: str, handle: str, since_date: str, per_source: int, output_path: Path) -> list[str]:
    if method == "search":
        return [
            "search",
            "--from",
            handle,
            "--since",
            since_date,
            "--type",
            "latest",
            "--max",
            str(per_source),
            "--json",
            "--output",
            str(output_path),
        ]
    return [
        "user-posts",
        handle,
        "--max",
        str(per_source),
        "--json",
        "--output",
        str(output_path),
    ]


def run_twitter_search(twitter_cmd: str, handle: str, since_date: str, per_source: int, method: str = "user-posts") -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if not shutil.which(twitter_cmd):
        return [], {"platform": "x", "handle": handle, "ok": False, "error": f"{twitter_cmd} not found on PATH"}

    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    cmd = [twitter_cmd, *twitter_command(method, handle, since_date, per_source, tmp_path)]
    try:
        command_env = os.environ.copy()
        command_env.update(load_agent_reach_twitter_env())
        result = subprocess.run(cmd, text=True, capture_output=True, check=False, timeout=90, env=command_env)
        if result.returncode != 0:
            error_parts = [part.strip() for part in (result.stderr, result.stdout) if part.strip()]
            return [], {
                "platform": "x",
                "handle": handle,
                "ok": False,
                "error": "\n".join(error_parts) or f"exit_{result.returncode}",
            }
        payload_text = tmp_path.read_text() if tmp_path.exists() else result.stdout
        payload = json.loads(payload_text)
        items = [item for tweet in tweet_items(payload) if (item := normalize_raw_tweet(tweet, handle))]
        return items, {"platform": "x", "handle": handle, "ok": True, "method": method, "items": len(items)}
    except json.JSONDecodeError as exc:
        return [], {"platform": "x", "handle": handle, "ok": False, "error": f"invalid_json: {exc}"}
    except subprocess.TimeoutExpired:
        return [], {"platform": "x", "handle": handle, "ok": False, "error": "twitter command timed out"}
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            pass


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


def update_social(import_path: Path, social_output: Path, days: int, now: datetime) -> int:
    import fetch_social_sources

    return fetch_social_sources.main_with_args([
        "--input-json",
        str(import_path),
        "--days",
        str(days),
        "--output",
        str(social_output),
        "--now",
        isoformat(now),
    ])


def main() -> int:
    args = parse_args()
    now = parse_now(args.now)
    since_date = (now - timedelta(days=args.days)).date().isoformat()
    groups = set(args.group) if args.group else None
    sources = load_sources(Path(args.sources), groups)
    statuses: list[dict[str, Any]] = []
    items: list[dict[str, Any]] = []

    for source in sources:
        source_items, status = run_twitter_search(args.twitter_cmd, source["handle"], since_date, args.per_source, args.method)
        items.extend(source_items)
        statuses.append(status)

    payload = {
        "generated_at": isoformat(now),
        "source": "agent-reach/twitter-cli",
        "window_days": args.days,
        "total_items": len(items),
        "items": items,
        "source_status": statuses,
    }
    output_path = Path(args.output)
    write_json(output_path, payload)
    print(f"Wrote {len(items)} Agent-Reach social items to {output_path}")
    if args.update_social:
        return update_social(output_path, Path(args.social_output), args.days, now)
    return 0


if __name__ == "__main__":
    sys.exit(main())
