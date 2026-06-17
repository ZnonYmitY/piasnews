#!/usr/bin/env python3
"""Fetch recent Oscar Piastri news from public RSS sources.

The script intentionally uses only Python's standard library so GitHub Actions
and agent environments can run it without dependency installation.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime, parsedate_to_datetime
from pathlib import Path
from typing import Any


PROJECT_NAME = "Piasnews"
DEFAULT_DAYS = 3
DEFAULT_LIMIT = 80

GOOGLE_NEWS_BASE = "https://news.google.com/rss/search"
GOOGLE_PARAMS = {"hl": "en-US", "gl": "US", "ceid": "US:en"}

QUERY_SPECS = [
    {
        "query": 'site:mclaren.com/racing/formula-1/articles/ "Piastri" when:3d',
        "source_group": "official_direct",
    },
    {
        "query": 'site:formula1.com/en/latest "Piastri" when:3d',
        "source_group": "official_direct",
    },
    {
        "query": 'site:oscarpiastri.com "Piastri" when:3d',
        "source_group": "official_direct",
    },
    {"query": '"Oscar Piastri" when:3d', "source_group": "rss_discovery"},
    {"query": '"Piastri" "McLaren" when:3d', "source_group": "rss_discovery"},
    {"query": '"OP81" when:3d', "source_group": "rss_discovery"},
    {"query": '"Oscar Piastri" "qualifying" when:3d', "source_group": "rss_discovery"},
    {"query": '"Oscar Piastri" "race" when:3d', "source_group": "rss_discovery"},
    {"query": '"Oscar Piastri" "interview" when:3d', "source_group": "rss_discovery"},
]

OFFICIAL_SOURCES = {
    "Formula 1",
    "McLaren",
    "McLaren Racing",
    "Oscar Piastri",
}

OFFICIAL_DOMAINS = (
    "formula1.com",
    "mclaren.com",
    "oscarpiastri.com",
    "fia.com",
)

LOW_CONFIDENCE_SOURCES = {
    "MSN",
    "Mshale",
    "Motorcycle Sports",
    "SSBCrack",
}

EXCLUDED_SOURCES = {
    "Fathom Journal",
    "Mshale",
    "Motorcycle Sports",
    "SSBCrack",
}

EXCLUDED_TITLE_PATTERNS = [
    re.compile(r"\([A-Za-z0-9_-]{8,}\)\s*$"),
    re.compile(r"\b2025\s+Dutch\s+Grand\s+Prix\b", re.IGNORECASE),
    re.compile(r"\bJapanese\s+GP\s+practice\b", re.IGNORECASE),
    re.compile(r"\bJeff\s+Probst\b", re.IGNORECASE),
    re.compile(r"\bWalter\s+Cup\b", re.IGNORECASE),
    re.compile(r"\bGhost\s+Car\b", re.IGNORECASE),
]

TITLE_SUFFIX_RE = re.compile(r"\s+-\s+[^-]+$")
TRACKING_PARAMS = {"fbclid", "gclid", "igshid", "mc_cid", "mc_eid"}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fetch latest Oscar Piastri news.")
    parser.add_argument("--days", type=int, default=DEFAULT_DAYS, help="Recency window in days.")
    parser.add_argument("--limit", type=int, default=DEFAULT_LIMIT, help="Maximum items to keep.")
    parser.add_argument("--output-dir", default="data", help="Output directory for JSON/RSS files.")
    parser.add_argument("--now", help="Override current UTC time, ISO-8601 format.")
    return parser.parse_args()


def parse_now(value: str | None) -> datetime:
    if not value:
        return utc_now()
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def build_google_news_url(query: str) -> str:
    params = dict(GOOGLE_PARAMS)
    params["q"] = query
    return f"{GOOGLE_NEWS_BASE}?{urllib.parse.urlencode(params)}"


def fetch_text(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "piasnews/0.6 (+https://github.com/ZnonYmitY/piasnews)",
            "Accept": "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8", errors="replace")


def parse_pub_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def clean_text(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def clean_title(raw_title: str, source: str) -> str:
    title = clean_text(raw_title)
    suffix = f" - {source}"
    if source and title.endswith(suffix):
        return title[: -len(suffix)].strip()
    return TITLE_SUFFIX_RE.sub("", title).strip()


def normalize_url(url: str) -> str:
    parsed = urllib.parse.urlsplit(url)
    query = []
    for key, value in urllib.parse.parse_qsl(parsed.query, keep_blank_values=True):
        if key.startswith("utm_") or key in TRACKING_PARAMS:
            continue
        query.append((key, value))
    return urllib.parse.urlunsplit(
        (
            parsed.scheme.lower(),
            parsed.netloc.lower(),
            parsed.path,
            urllib.parse.urlencode(query),
            "",
        )
    )


def normalize_title(title: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", title.lower()).strip()


def stable_id(title: str, url: str, published_at: str) -> str:
    digest = hashlib.sha1(f"{normalize_title(title)}|{normalize_url(url)}|{published_at}".encode()).hexdigest()
    return f"piasnews-{digest[:16]}"


def is_relevant(title: str, description: str) -> bool:
    text = f"{title} {description}".lower()
    return "piastri" in text or "op81" in text or "oscar piastri" in text


def is_noise(title: str, source: str) -> bool:
    if source in EXCLUDED_SOURCES:
        return True
    return any(pattern.search(title) for pattern in EXCLUDED_TITLE_PATTERNS)


def classify_item(title: str) -> str:
    text = title.lower()
    if any(word in text for word in ["red bull", "replacement", "market", "target", "transfer"]):
        return "rumor"
    if any(word in text for word in ["qualifying", "practice", "fp1", "fp2", "fp3", "race", "grand prix", "gp", "barcelona", "austria", "penalty", "steward"]):
        return "race"
    if any(word in text for word in ["interview", "reacts", "says", "admits", "warning", "comments", "mind-blown", "mind blown"]):
        return "interview"
    if any(word in text for word in ["mclaren", "mercedes", "ferrari", "upgrade", "car", "pace"]):
        return "team"
    if any(word in text for word in ["contract", "sponsor", "partnership"]):
        return "contract"
    if any(word in text for word in ["fan", "merch", "wasp", "species"]):
        return "fan"
    return "other"


def infer_summary(title: str, category: str) -> str:
    if category == "rumor":
        return "Rumor or speculative report; treat as unverified unless confirmed by official sources."
    if category == "race":
        return "Race-week or performance-related item discovered from public news metadata."
    if category == "interview":
        return "Quote or interview-related item discovered from public news metadata."
    if category == "team":
        return "Team or car-performance item discovered from public news metadata."
    if category == "fan":
        return "Fan/community or off-track item discovered from public news metadata."
    return "Oscar Piastri-related item discovered from public news metadata."


def is_official_source(source: str, source_url: str, item_url: str) -> bool:
    urls = f"{source_url} {item_url}".lower()
    return source in OFFICIAL_SOURCES or any(domain in urls for domain in OFFICIAL_DOMAINS)


def source_type(source: str, source_url: str, item_url: str) -> str:
    return "official" if is_official_source(source, source_url, item_url) else "media"


def verified(source: str, category: str) -> bool:
    if category == "rumor":
        return False
    if source in LOW_CONFIDENCE_SOURCES:
        return False
    return True


def parse_feed(xml_text: str, query: str, source_group: str, fetched_url: str, now: datetime, cutoff: datetime) -> list[dict[str, Any]]:
    root = ET.fromstring(xml_text)
    channel = root.find("channel")
    if channel is None:
        return []

    items: list[dict[str, Any]] = []
    for item in channel.findall("item"):
        raw_title = clean_text(item.findtext("title"))
        link = clean_text(item.findtext("link"))
        pub_date = parse_pub_date(item.findtext("pubDate"))
        source_el = item.find("source")
        source = clean_text(source_el.text if source_el is not None else "")
        source_url = clean_text(source_el.attrib.get("url", "") if source_el is not None else "")
        description = clean_text(item.findtext("description"))

        if not raw_title or not link or pub_date is None:
            continue
        if pub_date < cutoff or pub_date > now + timedelta(hours=2):
            continue

        title = clean_title(raw_title, source)
        if not is_relevant(title, description):
            continue
        if is_noise(title, source):
            continue

        category = classify_item(title)
        published_iso = pub_date.isoformat().replace("+00:00", "Z")
        item_url = normalize_url(link)
        item_id = stable_id(title, item_url, published_iso)
        item_source_type = source_type(source, source_url, item_url)

        items.append(
            {
                "id": item_id,
                "title": title,
                "url": item_url,
                "source": source or "Google News",
                "source_url": source_url,
                "source_type": item_source_type,
                "source_group": source_group,
                "discovery_method": "google_news_rss",
                "discovery_query": query,
                "discovery_url": fetched_url,
                "published_at": published_iso,
                "discovered_at": now.isoformat().replace("+00:00", "Z"),
                "category": category,
                "summary": infer_summary(title, category),
                "official": item_source_type == "official",
                "verified": verified(source, category),
                "tags": ["Oscar Piastri", "McLaren", "F1"],
                "language": "en",
                "daily_key": pub_date.date().isoformat(),
            }
        )
    return items


def fetch_items(days: int, limit: int, now: datetime) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    cutoff = now - timedelta(days=days)
    all_items: list[dict[str, Any]] = []
    feed_status: list[dict[str, Any]] = []

    for spec in QUERY_SPECS:
        query = spec["query"]
        source_group = spec["source_group"]
        url = build_google_news_url(query)
        status: dict[str, Any] = {"query": query, "source_group": source_group, "url": url, "ok": False, "items": 0}
        try:
            xml_text = fetch_text(url)
            parsed_items = parse_feed(xml_text, query, source_group, url, now, cutoff)
            status["ok"] = True
            status["items"] = len(parsed_items)
            all_items.extend(parsed_items)
        except Exception as exc:  # noqa: BLE001 - capture source health in generated metadata
            status["error"] = f"{type(exc).__name__}: {exc}"
        feed_status.append(status)

    deduped: dict[str, dict[str, Any]] = {}
    title_seen: set[str] = set()
    for item in sorted(all_items, key=lambda it: it["published_at"], reverse=True):
        key = normalize_url(item["url"])
        title_key = f'{normalize_title(item["title"])}|{item["daily_key"]}'
        if key in deduped or title_key in title_seen:
            continue
        deduped[key] = item
        title_seen.add(title_key)

    return list(deduped.values())[:limit], feed_status


def build_daily(items: list[dict[str, Any]], now: datetime, days: int, feed_status: list[dict[str, Any]]) -> dict[str, Any]:
    daily_items: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for item in items:
        daily_items[item["daily_key"]].append(item)

    days_data = []
    for date_key in sorted(daily_items.keys(), reverse=True):
        entries = daily_items[date_key]
        by_source = Counter(entry["source"] for entry in entries)
        by_category = Counter(entry["category"] for entry in entries)
        days_data.append(
            {
                "date": date_key,
                "total_new_items": len(entries),
                "official_new_items": sum(1 for entry in entries if entry["official"]),
                "media_new_items": sum(1 for entry in entries if entry["source_type"] == "media"),
                "x_new_items": 0,
                "rumor_new_items": sum(1 for entry in entries if entry["category"] == "rumor"),
                "sources": dict(sorted(by_source.items())),
                "categories": dict(sorted(by_category.items())),
            }
        )

    return {
        "generated_at": now.isoformat().replace("+00:00", "Z"),
        "window_days": days,
        "total_items": len(items),
        "latest_date": days_data[0]["date"] if days_data else None,
        "days": days_data,
        "feed_status": feed_status,
    }


def xml_escape(value: str) -> str:
    return html.escape(value, quote=True)


def build_rss(items: list[dict[str, Any]], now: datetime) -> str:
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0">',
        "<channel>",
        f"<title>{PROJECT_NAME}</title>",
        "<link>https://github.com/ZnonYmitY/piasnews</link>",
        "<description>Latest Oscar Piastri news discovered by Piasnews.</description>",
        "<language>en-US</language>",
        f"<lastBuildDate>{format_datetime(now)}</lastBuildDate>",
    ]

    for item in items:
        pub_dt = datetime.fromisoformat(item["published_at"].replace("Z", "+00:00"))
        lines.extend(
            [
                "<item>",
                f"<title>{xml_escape(item['title'])}</title>",
                f"<link>{xml_escape(item['url'])}</link>",
                f"<guid isPermaLink=\"false\">{xml_escape(item['id'])}</guid>",
                f"<pubDate>{format_datetime(pub_dt)}</pubDate>",
                f"<source>{xml_escape(item['source'])}</source>",
                f"<category>{xml_escape(item['category'])}</category>",
                f"<description>{xml_escape(item['summary'])}</description>",
                "</item>",
            ]
        )

    lines.extend(["</channel>", "</rss>", ""])
    return "\n".join(lines)


def write_outputs(output_dir: Path, items: list[dict[str, Any]], daily: dict[str, Any], now: datetime) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "items.json").write_text(json.dumps({"generated_at": daily["generated_at"], "items": items}, indent=2, ensure_ascii=False) + "\n")
    (output_dir / "daily.json").write_text(json.dumps(daily, indent=2, ensure_ascii=False) + "\n")
    (output_dir / "rss.xml").write_text(build_rss(items, now))


def main() -> int:
    args = parse_args()
    now = parse_now(args.now)
    items, feed_status = fetch_items(args.days, args.limit, now)
    daily = build_daily(items, now, args.days, feed_status)
    write_outputs(Path(args.output_dir), items, daily, now)
    print(f"Fetched {len(items)} items into {args.output_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
