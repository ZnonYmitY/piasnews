#!/usr/bin/env python3
"""Build the admin-facing status for manual translation fallback.

The LLM mapping generator and this status builder deliberately share the same
target collection code. This prevents HTML entity normalization differences
from turning already translated rows into false Immersive Translate alerts.
"""

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)
TRANSLATABLE_TEXT_RE = re.compile(r"[A-Za-z]{2,}")

from translate_zh_llm_mapping import collect_targets, read_json  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build manual translation-fallback status JSON.")
    parser.add_argument("--items", default=str(ROOT / "data" / "items.json"))
    parser.add_argument("--social", default=str(ROOT / "data" / "social.json"))
    parser.add_argument("--mapping", default=str(ROOT / "data" / "immersive_translations.zh.json"))
    parser.add_argument("--output", default=str(ROOT / "data" / "translation-fallback.json"))
    return parser.parse_args()


def is_actionable_source(source_text: str) -> bool:
    without_urls = URL_RE.sub("", source_text or "")
    return bool(TRANSLATABLE_TEXT_RE.search(without_urls))


def fallback_status(
    items_path: Path,
    social_path: Path,
    mapping_path: Path,
    *,
    generated_at: str | None = None,
) -> dict[str, Any]:
    mapping = read_json(mapping_path, {"schema_version": 1, "translations": {}})
    missing = collect_targets(items_path, social_path, mapping)
    actionable = [target for target in missing if is_actionable_source(target["source_text"])]
    ignored = [target for target in missing if not is_actionable_source(target["source_text"])]
    timestamp = generated_at or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    return {
        "schema_version": 1,
        "generated_at": timestamp,
        "status": "action_required" if actionable else "healthy",
        "pending_count": len(actionable),
        "ignored_non_text_count": len(ignored),
        "workbench_path": "../immersive/translation-workbench.html",
        "items": [
            {
                "key": target["key"],
                "dataset": target["dataset"],
                "item_id": target["item_id"],
                "target_field": target["target_field"],
                "source_text": target["source_text"],
                "source_url": target["source_url"],
                "source_name": target["source_name"],
                "reason": "llm_mapping_missing",
            }
            for target in actionable
        ],
    }


def main() -> int:
    args = parse_args()
    output_path = Path(args.output)
    payload = fallback_status(Path(args.items), Path(args.social), Path(args.mapping))
    existing = read_json(output_path, {})
    stable_fields = ("status", "pending_count", "ignored_non_text_count", "workbench_path", "items")
    if existing.get("generated_at") and all(existing.get(field) == payload.get(field) for field in stable_fields):
        payload["generated_at"] = existing["generated_at"]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        "Translation fallback status: "
        f"status={payload['status']} pending={payload['pending_count']} "
        f"ignored_non_text={payload['ignored_non_text_count']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
