#!/usr/bin/env python3
"""Fetch optional X/Instagram social updates for Piasnews.

The collector is intentionally optional. Without user/project-provided access,
it writes an empty `social.json` with source status metadata instead of trying
to bypass platform login or rate limits.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


DEFAULT_DAYS = 3
DEFAULT_LIMIT = 80
HTTP_TIMEOUT_SECONDS = 20
X_API_BASES = ("https://api.x.com/2", "https://api.twitter.com/2")
DIRECT_PIASTRI_RE = re.compile(r"\b(piastri|oscar|op81)\b", re.IGNORECASE)
URL_RE = re.compile(r"https?://\S+")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch optional Piasnews social updates.")
    parser.add_argument("--sources", default="piasnews/references/x-sources.json", help="X/IG source list.")
    parser.add_argument("--output", default="data/social.json", help="Output social JSON file.")
    parser.add_argument("--days", type=int, default=DEFAULT_DAYS, help="Recency window in days.")
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help="Maximum normalized social items.")
    parser.add_argument("--now", help="Override current UTC time, ISO-8601 format.")
    parser.add_argument("--input-json", help="Optional local JSON export to normalize instead of live API.")
    return parser.parse_args(argv)


def parse_now(value: str | None) -> datetime:
    if not value:
        return utc_now()
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def isoformat(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def stable_id(platform: str, url: str, text: str) -> str:
    digest = hashlib.sha1(f"{platform}|{url}|{text}".encode()).hexdigest()
    return f"piasnews-social-{digest[:16]}"


def clean_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value).strip()


def clean_title_text(value: str | None) -> str:
    return clean_text(URL_RE.sub("", value or ""))


def load_sources(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text())


def source_by_handle(sources: dict[str, Any]) -> dict[tuple[str, str], dict[str, Any]]:
    result = {}
    for source in sources.get("sources", []):
        platform = source.get("platform", "").lower()
        handle = source.get("handle", "").lower()
        if platform and handle:
            result[(platform, handle)] = source
    return result


def is_relevant(text: str, source: dict[str, Any]) -> bool:
    if source.get("source_role") == "official_driver":
        return True
    return bool(DIRECT_PIASTRI_RE.search(text))


def shorten_title_text(text: str, limit: int = 96) -> str:
    cleaned = clean_title_text(text)
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 1].rstrip() + "…"


def chinese_title_hint(text: str) -> str:
    cleaned = clean_title_text(text)
    lowered = cleaned.lower()
    if not cleaned:
        return ""
    if "piastri" not in lowered and "oscar" not in lowered and "op81" not in lowered:
        return ""
    if any(token in lowered for token in ("fp1", "fp2", "fp3", "practice")):
        return "Piastri 练习赛相关动态"
    if any(token in lowered for token in ("qualifying", "quali", "pole")):
        return "Piastri 排位赛相关动态"
    if any(token in lowered for token in ("race", "grand prix", "gp")):
        return "Piastri 正赛相关动态"
    if any(token in lowered for token in ("interview", "said", "says", "speaks")):
        return "Piastri 采访/表态动态"
    if any(token in lowered for token in ("photo", "photos", "pic", "pics", "poster", "wallpaper")):
        return "Piastri 图片/物料更新"
    if "mclaren" in lowered:
        return "Piastri 与 McLaren 相关动态"
    return f"Piastri 相关：{shorten_title_text(cleaned, 72)}"


def title_for_item(platform: str, handle: str, kind: str, text: str) -> str:
    platform_label = "Instagram" if platform == "instagram" else "X"
    snippet = shorten_title_text(text) or f"@{handle}"
    if kind == "repost":
        return f"{platform_label} repost from @{handle}: {snippet}"
    return f"{platform_label} post from @{handle}: {snippet}"


def title_zh_for_item(platform: str, handle: str, kind: str, text: str) -> str:
    platform_label = "Instagram" if platform == "instagram" else "X"
    snippet = chinese_title_hint(text) or shorten_title_text(text) or f"@{handle}"
    if kind == "repost":
        return f"{platform_label} 转帖：{snippet}"
    return f"{platform_label} 发帖：{snippet}"


def normalize_social_item(raw: dict[str, Any], source: dict[str, Any], now: datetime, cutoff: datetime) -> dict[str, Any] | None:
    platform = clean_text(raw.get("platform") or source.get("platform")).lower()
    handle = clean_text(raw.get("handle") or source.get("handle"))
    text = clean_text(raw.get("text") or raw.get("summary") or raw.get("title"))
    published_at = parse_iso_datetime(raw.get("published_at") or raw.get("created_at"))
    if not platform or not handle or not text or not published_at:
        return None
    if published_at < cutoff or published_at > now + timedelta(hours=2):
        return None
    if not is_relevant(text, source):
        return None

    kind = clean_text(raw.get("kind") or raw.get("post_kind") or "post").lower()
    if kind not in {"post", "repost", "reel"}:
        kind = "post"

    url = clean_text(raw.get("url"))
    if not url:
        if platform == "x":
            post_id = clean_text(raw.get("id") or raw.get("post_id"))
            if not post_id:
                return None
            url = f"https://x.com/{handle}/status/{post_id}"
        elif platform == "instagram":
            return None
    attribution_zh = source.get("attribution_template_zh") or f"引用自 @{handle}"
    attribution_en = source.get("attribution_template_en") or f"Referenced from @{handle}"
    summary = text
    summary_zh = clean_text(raw.get("summary_zh") or raw.get("text_zh")) or summary
    return {
        "id": stable_id(platform, url, text),
        "title": title_for_item(platform, handle, kind, text),
        "title_zh": title_zh_for_item(platform, handle, kind, text),
        "url": url,
        "source": f"@{handle}",
        "source_handle": handle,
        "source_type": platform,
        "source_group": source.get("group", "fan_watch"),
        "source_role": source.get("source_role"),
        "published_at": isoformat(published_at),
        "published_at_source": "platform_api_or_import",
        "date_verified": True,
        "discovered_at": isoformat(now),
        "category": "fan" if source.get("group") == "fan_watch" else "other",
        "summary": summary,
        "summary_zh": summary_zh,
        "attribution": attribution_en,
        "attribution_zh": attribution_zh,
        "copyright_notice": "Remove on rights request.",
        "copyright_notice_zh": "如有侵权请联系删除。",
        "official": source.get("trust_level") == "official",
        "verified": source.get("trust_level") in {"official", "reference"},
        "post_kind": kind,
        "platform": platform,
        "metrics": raw.get("metrics") or raw.get("public_metrics") or {},
        "tags": ["Oscar Piastri", "McLaren", "F1"],
        "language": raw.get("language") or raw.get("lang") or "unknown",
        "daily_key": published_at.date().isoformat(),
    }


def read_json_url(url: str, bearer_token: str) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={
            "Authorization": f"Bearer {bearer_token}",
            "User-Agent": "piasnews-social/0.1 (+https://github.com/ZnonYmitY/piasnews)",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
        return json.loads(response.read().decode("utf-8"))


def x_get(path: str, bearer_token: str, params: dict[str, str] | None = None) -> dict[str, Any]:
    query = f"?{urllib.parse.urlencode(params)}" if params else ""
    last_error: Exception | None = None
    for base in X_API_BASES:
        try:
            return read_json_url(f"{base}{path}{query}", bearer_token)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
    if last_error:
        raise last_error
    raise RuntimeError("X API request failed")


def fetch_x_source(source: dict[str, Any], bearer_token: str, now: datetime, cutoff: datetime, limit: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    handle = source["handle"]
    status = {"platform": "x", "handle": handle, "ok": False, "items": 0}
    try:
        user_payload = x_get(
            f"/users/by/username/{urllib.parse.quote(handle)}",
            bearer_token,
            {"user.fields": "username,name,verified"},
        )
        user_id = user_payload.get("data", {}).get("id")
        if not user_id:
            status["error"] = "user_not_found"
            return [], status
        params = {
            "max_results": str(max(5, min(100, limit))),
            "tweet.fields": "created_at,public_metrics,referenced_tweets,lang",
            "exclude": "replies",
        }
        timeline = x_get(f"/users/{user_id}/tweets", bearer_token, params)
    except Exception as exc:  # noqa: BLE001 - per-source failures should not fail the run
        status["error"] = f"{type(exc).__name__}: {exc}"
        return [], status

    items = []
    for tweet in timeline.get("data", []):
        referenced = tweet.get("referenced_tweets") or []
        kind = "repost" if any(ref.get("type") == "retweeted" for ref in referenced) else "post"
        raw = {
            "platform": "x",
            "handle": handle,
            "id": tweet.get("id"),
            "text": tweet.get("text"),
            "created_at": tweet.get("created_at"),
            "kind": kind,
            "public_metrics": tweet.get("public_metrics") or {},
            "lang": tweet.get("lang"),
        }
        normalized = normalize_social_item(raw, source, now, cutoff)
        if normalized:
            items.append(normalized)
    status["ok"] = True
    status["items"] = len(items)
    return items, status


def normalize_import_payload(payload: Any, source_label: str, sources: dict[str, Any], now: datetime, cutoff: datetime) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    raw_items = payload.get("items", payload if isinstance(payload, list) else [])
    source_map = source_by_handle(sources)
    items = []
    skipped = 0
    for raw in raw_items:
        platform = clean_text(raw.get("platform", "x")).lower()
        handle = clean_text(raw.get("handle", "")).lower()
        source = source_map.get((platform, handle))
        if not source:
            skipped += 1
            continue
        normalized = normalize_social_item(raw, source, now, cutoff)
        if normalized:
            items.append(normalized)
        else:
            skipped += 1
    return items, {"source": source_label, "ok": True, "items": len(items), "skipped": skipped}


def normalize_import(path: Path, sources: dict[str, Any], now: datetime, cutoff: datetime) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    return normalize_import_payload(json.loads(path.read_text()), str(path), sources, now, cutoff)


def dedupe_items(items: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    result = {}
    for item in sorted(items, key=lambda entry: entry["published_at"], reverse=True):
        result.setdefault(item["url"], item)
    return list(result.values())[:limit]


def build_empty_output(now: datetime, days: int, statuses: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "generated_at": isoformat(now),
        "window_days": days,
        "total_items": 0,
        "items": [],
        "source_status": statuses,
    }


def write_output(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


def main_with_args(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    now = parse_now(args.now)
    cutoff = now - timedelta(days=args.days)
    sources = load_sources(Path(args.sources))
    output_path = Path(args.output)
    statuses = []
    items: list[dict[str, Any]] = []

    input_json = args.input_json or os.environ.get("PIASNEWS_SOCIAL_INPUT")
    if input_json:
        imported_items, import_status = normalize_import(Path(input_json), sources, now, cutoff)
        items.extend(imported_items)
        statuses.append({"stage": "json_import", **import_status})

    input_json_text = os.environ.get("PIASNEWS_SOCIAL_INPUT_JSON")
    if input_json_text:
        try:
            imported_items, import_status = normalize_import_payload(
                json.loads(input_json_text),
                "PIASNEWS_SOCIAL_INPUT_JSON",
                sources,
                now,
                cutoff,
            )
            items.extend(imported_items)
            statuses.append({"stage": "json_import_env", **import_status})
        except json.JSONDecodeError as exc:
            statuses.append({"stage": "json_import_env", "ok": False, "error": f"invalid_json: {exc}"})

    x_token = os.environ.get("PIASNEWS_X_BEARER_TOKEN")
    x_sources = [source for source in sources.get("sources", []) if source.get("platform") == "x" and source.get("enabled", True)]
    if x_token:
        per_source_limit = max(5, min(100, args.limit))
        for source in x_sources:
            source_items, status = fetch_x_source(source, x_token, now, cutoff, per_source_limit)
            items.extend(source_items)
            statuses.append(status)
    else:
        statuses.append({"stage": "x_api", "ok": False, "reason": "PIASNEWS_X_BEARER_TOKEN not configured", "sources": len(x_sources)})

    instagram_sources = [source for source in sources.get("sources", []) if source.get("platform") == "instagram" and source.get("enabled", True)]
    if instagram_sources:
        statuses.append({"stage": "instagram", "ok": False, "reason": "Instagram public collection not configured; use PIASNEWS_SOCIAL_INPUT import", "sources": len(instagram_sources)})

    final_items = dedupe_items(items, args.limit)
    payload = build_empty_output(now, args.days, statuses)
    payload["items"] = final_items
    payload["total_items"] = len(final_items)
    write_output(output_path, payload)
    print(f"Fetched {len(final_items)} social items into {output_path}")
    return 0


def main() -> int:
    return main_with_args()


if __name__ == "__main__":
    sys.exit(main())
