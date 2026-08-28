#!/usr/bin/env python3
"""Reject a social refresh that strips known media from retained posts."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


MEDIA_FIELDS = ("image_url", "video_url", "video_poster_url")


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Validate Piasnews social media retention.")
    parser.add_argument("--before", required=True, help="Social JSON before refresh.")
    parser.add_argument("--after", required=True, help="Social JSON after refresh.")
    return parser.parse_args(argv)


def read_items(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8"))
    return [item for item in payload.get("items") or [] if isinstance(item, dict)]


def media_fields(item: dict[str, Any]) -> set[str]:
    return {field for field in MEDIA_FIELDS if item.get(field)}


def audit(before_items: list[dict[str, Any]], after_items: list[dict[str, Any]]) -> dict[str, Any]:
    before_by_url = {item.get("url"): item for item in before_items if item.get("url")}
    after_by_url = {item.get("url"): item for item in after_items if item.get("url")}
    stripped = []
    preserved = 0
    for url, before in before_by_url.items():
        after = after_by_url.get(url)
        if not after:
            continue
        missing = sorted(media_fields(before) - media_fields(after))
        if missing:
            stripped.append({"url": url, "fields": missing})
        elif media_fields(before):
            preserved += 1
    return {
        "before_items": len(before_items),
        "after_items": len(after_items),
        "before_media_items": sum(bool(media_fields(item)) for item in before_items),
        "after_media_items": sum(bool(media_fields(item)) for item in after_items),
        "retained_media_items": preserved,
        "stripped_items": stripped,
    }


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    result = audit(read_items(Path(args.before)), read_items(Path(args.after)))
    print(json.dumps(result, ensure_ascii=False))
    if result["stripped_items"]:
        print(
            f"Rejected social refresh: {len(result['stripped_items'])} retained post(s) lost media fields.",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
