#!/usr/bin/env python3
"""Build a compact public social import JSON from normalized social data."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Compact normalized Piasnews social JSON for GitHub Actions import.")
    parser.add_argument("--input", default="data/social.json", help="Normalized social JSON input.")
    parser.add_argument("--output", default="/tmp/piasnews-social-input-compact.json", help="Compact import JSON output.")
    return parser.parse_args(argv)


def compact_item(item: dict[str, Any]) -> dict[str, Any]:
    return {
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


def compact_payload(payload: dict[str, Any]) -> dict[str, Any]:
    items = [compact_item(item) for item in payload.get("items", []) if isinstance(item, dict)]
    return {
        "source": "agent-reach/compact-social",
        "window_days": payload.get("window_days", 3),
        "items": items,
    }


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    payload = json.loads(Path(args.input).read_text())
    output = compact_payload(payload)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {len(output['items'])} compact social items to {output_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
