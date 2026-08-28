#!/usr/bin/env python3
"""Build a compact public social import JSON from normalized social data."""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


SCHEMA_VERSION = 2
COLLECTOR_VERSION = "media-preserving-v2"
MEDIA_FIELDS = ("image_url", "video_url", "video_poster_url")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compact normalized Piasnews social JSON for GitHub Actions import.")
    parser.add_argument("--input", default="data/social.json", help="Normalized social JSON input.")
    parser.add_argument("--output", default="/tmp/piasnews-social-input-compact.json", help="Compact import JSON output.")
    parser.add_argument("--days", type=int, default=3, help="Recent discovery window included in compact output.")
    return parser.parse_args(argv)


def compact_item(item: dict[str, Any]) -> dict[str, Any]:
    compacted = {
        "platform": item.get("platform") or item.get("source_type"),
        "handle": item.get("source_handle"),
        "id": item.get("url", "").rstrip("/").split("/")[-1] or item.get("id"),
        "url": item.get("url"),
        "text": item.get("summary") or item.get("title"),
        "created_at": item.get("published_at"),
        "kind": item.get("post_kind", "post"),
        "metrics": item.get("metrics", {}),
        "language": item.get("language", "unknown"),
    }
    for field in ("image_url", "video_url", "video_poster_url"):
        if item.get(field):
            compacted[field] = item[field]
    return compacted


def parse_time(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def compact_payload(payload: dict[str, Any], days: int = 3) -> dict[str, Any]:
    generated_at = parse_time(payload.get("generated_at"))
    cutoff = generated_at - timedelta(days=max(1, days)) if generated_at else None
    retained = []
    for item in payload.get("items", []):
        if not isinstance(item, dict):
            continue
        published_at = parse_time(item.get("published_at"))
        if cutoff and (not published_at or published_at < cutoff):
            continue
        retained.append(item)
    items = [compact_item(item) for item in retained]
    return {
        "schema_version": SCHEMA_VERSION,
        "collector_version": COLLECTOR_VERSION,
        "source": "agent-reach/compact-social",
        "generated_at": payload.get("generated_at"),
        "window_days": max(1, days),
        "item_count": len(items),
        "media_item_count": sum(1 for item in items if any(item.get(field) for field in MEDIA_FIELDS)),
        "latest_item_at": max((item.get("created_at") or "" for item in items), default="") or None,
        "items": items,
    }


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    payload = json.loads(Path(args.input).read_text())
    output = compact_payload(payload, args.days)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {len(output['items'])} compact social items to {output_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
