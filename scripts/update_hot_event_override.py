#!/usr/bin/env python3
"""Apply an authenticated hot-event workbench change to the override layer."""

from __future__ import annotations

import argparse
import base64
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
EVENT_ID_RE = re.compile(r"^evt-[a-z0-9-]{4,120}$")
ALLOWED_LABELS = {"官", "媒", "粉"}
ALLOWED_SOURCE_TYPES = {"official", "media", "fan"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Update a Piasnews hot-event override.")
    parser.add_argument("--event-id", required=True)
    parser.add_argument("--status", required=True, choices=("draft", "active"))
    parser.add_argument("--payload-b64", required=True)
    parser.add_argument("--reviewer", required=True)
    parser.add_argument("--expected-updated-at", default=None)
    parser.add_argument("--overrides", default=str(ROOT / "data/hot-event-overrides.json"))
    parser.add_argument("--audit", default=str(ROOT / "data/hot-event-audit.json"))
    return parser.parse_args()


def decode_payload(value: str) -> dict[str, Any]:
    padding = "=" * (-len(value) % 4)
    payload = json.loads(base64.urlsafe_b64decode(value + padding).decode("utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("Override payload must be an object")
    return payload


def read_json(path: Path, fallback: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def clean_optional_url(value: Any) -> str | None:
    cleaned = str(value or "").strip()
    if not cleaned:
        return None
    if not re.match(r"^https://", cleaned, re.IGNORECASE):
        raise ValueError("Media URLs must use HTTPS")
    return cleaned


def normalize_content_items(value: Any) -> list[dict[str, Any]] | None:
    if value is None:
        return None
    if not isinstance(value, list) or len(value) > 50:
        raise ValueError("Content items must be a list with at most 50 entries")
    normalized = []
    seen_ids: set[str] = set()
    for index, item in enumerate(value):
        if not isinstance(item, dict):
            raise ValueError("Each content item must be an object")
        item_id = str(item.get("item_id") or "").strip()
        if not re.fullmatch(r"[A-Za-z0-9._:-]{3,180}", item_id) or item_id in seen_ids:
            raise ValueError("Each content item needs a unique valid item_id")
        seen_ids.add(item_id)
        source_type = str(item.get("source_type") or "").strip()
        if source_type not in ALLOWED_SOURCE_TYPES:
            raise ValueError("Invalid content source_type")
        source = str(item.get("source") or "").strip()
        title = str(item.get("title") or "").strip()
        title_zh = str(item.get("title_zh") or "").strip()
        if not source or len(source) > 120 or not (title or title_zh):
            raise ValueError("Each content item needs a source and title")
        url = clean_optional_url(item.get("url"))
        if not url:
            raise ValueError("Each content item needs an HTTPS content URL")
        normalized.append({
            "item_id": item_id,
            "dataset": str(item.get("dataset") or "manual").strip()[:30] or "manual",
            "source_type": source_type,
            "source": source,
            "title": title,
            "title_zh": title_zh,
            "summary": str(item.get("summary") or "").strip()[:2000],
            "summary_zh": str(item.get("summary_zh") or "").strip()[:2000],
            "url": url,
            "published_at": str(item.get("published_at") or "").strip()[:40] or None,
            "image_url": clean_optional_url(item.get("image_url")),
            "video_url": clean_optional_url(item.get("video_url")),
            "video_poster_url": clean_optional_url(item.get("video_poster_url")),
            "manual": bool(item.get("manual")),
        })
    return normalized


def normalize_change(event_id: str, status: str, payload: dict[str, Any], reviewer: str) -> dict[str, Any]:
    if not EVENT_ID_RE.fullmatch(event_id):
        raise ValueError("Invalid event ID")
    hot_word_zh = str(payload.get("hot_word_zh") or "").strip()
    hot_word_en = str(payload.get("hot_word_en") or "").strip()
    if not hot_word_zh or len(hot_word_zh) > 80:
        raise ValueError("Chinese hot word is required and must be at most 80 characters")
    if hot_word_en and len(hot_word_en) > 180:
        raise ValueError("English hot word must be at most 180 characters")
    labels = payload.get("source_labels") or []
    if not isinstance(labels, list) or any(label not in ALLOWED_LABELS for label in labels):
        raise ValueError("Invalid source labels")
    pinned_rank = payload.get("pinned_rank")
    if pinned_rank in ("", None):
        pinned_rank = None
    else:
        pinned_rank = int(pinned_rank)
        if not 1 <= pinned_rank <= 15:
            raise ValueError("Pinned rank must be between 1 and 15")
    heat = payload.get("heat")
    if heat in ("", None):
        heat = None
    else:
        heat = int(heat)
        if not 0 <= heat <= 100:
            raise ValueError("Heat must be between 0 and 100")
    reason = str(payload.get("reason") or "").strip()
    if not reason or len(reason) > 500:
        raise ValueError("A change reason is required and must be at most 500 characters")
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "event_id": event_id,
        "status": status,
        "manual_event": bool(payload.get("manual_event")),
        "hot_word_zh": hot_word_zh,
        "hot_word_en": hot_word_en or None,
        "source_labels": labels,
        "heat": heat,
        "pinned_rank": pinned_rank,
        "hidden": bool(payload.get("hidden")),
        "image_url": clean_optional_url(payload.get("image_url")),
        "video_url": clean_optional_url(payload.get("video_url")),
        "content_items": normalize_content_items(payload.get("content_items")),
        "reason": reason,
        "updated_at": now,
        "updated_by": reviewer,
    }


def merge_change(changes: list[dict[str, Any]], change: dict[str, Any]) -> list[dict[str, Any]]:
    """Keep a draft beside the active version until a publisher activates it."""
    event_id = change["event_id"]
    if change["status"] == "draft":
        kept = [
            row for row in changes
            if not (row.get("event_id") == event_id and row.get("status") == "draft")
        ]
    else:
        kept = [row for row in changes if row.get("event_id") != event_id]
    kept.append(change)
    return sorted(kept, key=lambda row: (row.get("event_id", ""), row.get("status") != "active"))


def preferred_change(changes: list[dict[str, Any]], event_id: str) -> dict[str, Any] | None:
    return next((row for row in changes if row.get("event_id") == event_id and row.get("status") == "draft"), None) \
        or next((row for row in changes if row.get("event_id") == event_id and row.get("status") == "active"), None)


def assert_expected_version(changes: list[dict[str, Any]], event_id: str, expected: str | None) -> None:
    if expected is None:
        return
    current = preferred_change(changes, event_id)
    current_version = str(current.get("updated_at") or "") if current else "__none__"
    if current_version != expected:
        raise ValueError("Hot event was changed by another administrator; refresh before saving")


def main() -> int:
    args = parse_args()
    change = normalize_change(args.event_id, args.status, decode_payload(args.payload_b64), args.reviewer)
    overrides_path = Path(args.overrides)
    audit_path = Path(args.audit)
    overrides = read_json(overrides_path, {"schema_version": 1, "updated_at": None, "changes": []})
    assert_expected_version(overrides.get("changes") or [], args.event_id, args.expected_updated_at)
    changes = merge_change(overrides.get("changes") or [], change)
    overrides.update({"schema_version": 1, "updated_at": change["updated_at"], "changes": changes})
    audit = read_json(audit_path, {"schema_version": 1, "changes": []})
    audit.setdefault("changes", []).append(change)
    overrides_path.write_text(json.dumps(overrides, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    audit_path.write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Saved {args.status} hot-event override for {args.event_id}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
