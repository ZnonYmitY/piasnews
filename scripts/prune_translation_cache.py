#!/usr/bin/env python3
"""Prune inactive Piasnews translation cache entries after a short buffer."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prune inactive Piasnews translation mappings.")
    parser.add_argument("--mapping", default=str(ROOT / "data/immersive_translations.zh.json"))
    parser.add_argument("--items", default=str(ROOT / "data/items.json"))
    parser.add_argument("--social", default=str(ROOT / "data/social.json"))
    parser.add_argument("--days", type=int, default=8)
    parser.add_argument("--now", help="Override current UTC time, ISO-8601 format.")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def read_json(path: Path, fallback: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def active_item_ids(items: dict[str, Any], social: dict[str, Any]) -> set[tuple[str, str]]:
    active = set()
    for dataset, payload in (("items", items), ("social", social)):
        for item in payload.get("items") or []:
            item_id = str(item.get("id") or item.get("url") or "").strip()
            if item_id:
                active.add((dataset, item_id))
    return active


def prune_mapping(
    mapping: dict[str, Any],
    active: set[tuple[str, str]],
    now: datetime,
    days: int,
) -> tuple[dict[str, Any], int]:
    cutoff = now - timedelta(days=days)
    kept = {}
    removed = 0
    for key, entry in (mapping.get("translations") or {}).items():
        dataset = str(entry.get("dataset") or "")
        item_id = str(entry.get("item_id") or "")
        captured_at = parse_time(entry.get("captured_at"))
        if (dataset, item_id) in active or captured_at is None or captured_at >= cutoff:
            kept[key] = entry
        else:
            removed += 1
    result = dict(mapping)
    result["generated_at"] = now.isoformat().replace("+00:00", "Z")
    result["retention_days"] = days
    result["translations"] = kept
    return result, removed


def main() -> int:
    args = parse_args()
    now = parse_time(args.now) or datetime.now(timezone.utc)
    mapping_path = Path(args.mapping)
    mapping = read_json(mapping_path, {"schema_version": 1, "translations": {}})
    active = active_item_ids(read_json(Path(args.items), {"items": []}), read_json(Path(args.social), {"items": []}))
    result, removed = prune_mapping(mapping, active, now, max(1, args.days))
    if not args.dry_run:
        mapping_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Translation cache prune: active_items={len(active)} removed={removed} kept={len(result['translations'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
