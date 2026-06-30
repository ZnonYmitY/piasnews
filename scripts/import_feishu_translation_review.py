#!/usr/bin/env python3
"""Import approved translation reviews from Feishu Base into translation_review.csv."""

from __future__ import annotations

import argparse
import csv
from pathlib import Path
from typing import Any

from feishu_translation_base import (
    BASE_FIELDS,
    BASE_STATUS_FIELD,
    DEFAULT_REVIEW_CSV,
    REVIEW_FIELDS,
    FeishuBaseClient,
    build_client_or_skip,
    clean,
    load_csv,
    main_guard,
    record_fields,
)


REVERSE_BASE_FIELDS = {base_field: csv_field for csv_field, base_field in BASE_FIELDS.items()}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import approved translation rows from Feishu Base.")
    parser.add_argument("--review-csv", default=str(DEFAULT_REVIEW_CSV))
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def review_key(row: dict[str, str]) -> tuple[str, str]:
    return (clean(row.get("source_type")) or "unknown", clean(row.get("source_text")).casefold())


def row_from_base_fields(fields: dict[str, Any]) -> dict[str, str]:
    mapped: dict[str, str] = {}
    for base_field, value in fields.items():
        csv_field = REVERSE_BASE_FIELDS.get(base_field)
        if csv_field:
            mapped[csv_field] = clean(value)
    return {
        "id": mapped.get("id", ""),
        "source_type": mapped.get("source_type", ""),
        "domain": mapped.get("domain", ""),
        "source_text": mapped.get("source_text", ""),
        "current_zh": mapped.get("current_zh", ""),
        "suggested_zh": mapped.get("suggested_zh", ""),
        "status": "approved",
        "priority": mapped.get("priority", ""),
        "tags": mapped.get("tags", ""),
        "notes": mapped.get("notes", ""),
    }


def approved_rows_from_base(client: FeishuBaseClient) -> list[dict[str, str]]:
    records = client.list_records(field_names=list(BASE_FIELDS.values()))
    rows: list[dict[str, str]] = []
    for record in records:
        fields = record_fields(record)
        if clean(fields.get(BASE_STATUS_FIELD)).casefold() != "approved":
            continue
        row = row_from_base_fields(fields)
        if row["source_text"]:
            rows.append(row)
    return rows


def write_review_csv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=REVIEW_FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def merge_approved_reviews(existing: list[dict[str, str]], approved: list[dict[str, str]]) -> tuple[list[dict[str, str]], int]:
    merged = [{field: row.get(field, "") for field in REVIEW_FIELDS} for row in existing]
    existing_keys = {review_key(row) for row in merged if clean(row.get("source_text"))}
    added = 0
    for row in approved:
        key = review_key(row)
        if key in existing_keys:
            continue
        merged.append({field: row.get(field, "") for field in REVIEW_FIELDS})
        existing_keys.add(key)
        added += 1
    return merged, added


def main() -> int:
    args = parse_args()
    client = build_client_or_skip()
    if client is None:
        return 0
    review_path = Path(args.review_csv)
    existing = load_csv(review_path)
    approved = approved_rows_from_base(client)
    merged, added = merge_approved_reviews(existing, approved)
    if args.dry_run:
        print(f"Would import {added} approved Feishu rows into {args.review_csv}.")
        return 0
    write_review_csv(review_path, merged)
    print(f"Imported approved Feishu reviews: added={added}, total={len(merged)}, output={args.review_csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main_guard(main))

