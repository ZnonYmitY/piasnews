#!/usr/bin/env python3
"""Sync Piasnews translation badcase candidates into Feishu Base."""

from __future__ import annotations

import argparse
import re
from pathlib import Path
from typing import Any

from feishu_translation_base import (
    BASE_FIELDS,
    BASE_ID_FIELD,
    BASE_STATUS_FIELD,
    DEFAULT_CANDIDATES_CSV,
    FeishuBaseClient,
    build_client_or_skip,
    clean,
    load_csv,
    main_guard,
    record_fields,
    record_id,
)


PRESERVED_STATUS = {"approved", "rejected", "ignore", "ignored"}
MARKDOWN_LINK_RE = re.compile(r"^\[[^\]]+\]\((https?://[^)]+)\)$")
URL_RE = re.compile(r"^https?://\S+$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync translation badcases to Feishu Base.")
    parser.add_argument("--input-csv", default=str(DEFAULT_CANDIDATES_CSV))
    parser.add_argument("--mark-missing-ignored", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def base_payload(row: dict[str, str], *, include_status: bool) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for csv_field, base_field in BASE_FIELDS.items():
        if csv_field == "status" and not include_status:
            continue
        value = row.get(csv_field, "")
        if csv_field == "url":
            value = normalize_url(value)
            if not value:
                continue
        payload[base_field] = value
    if include_status and not clean(payload.get(BASE_STATUS_FIELD)):
        payload[BASE_STATUS_FIELD] = "pending"
    return payload


def normalize_url(value: str) -> str:
    cleaned = clean(value)
    if not cleaned:
        return ""
    markdown_match = MARKDOWN_LINK_RE.match(cleaned)
    if markdown_match:
        cleaned = markdown_match.group(1)
    return cleaned if URL_RE.match(cleaned) else ""


def existing_records_by_candidate_id(client: FeishuBaseClient) -> dict[str, dict[str, Any]]:
    records = client.list_records(field_names=[BASE_ID_FIELD, BASE_STATUS_FIELD])
    index: dict[str, dict[str, Any]] = {}
    for record in records:
        fields = record_fields(record)
        candidate_id = clean(fields.get(BASE_ID_FIELD))
        if candidate_id:
            index[candidate_id] = record
    return index


def sync_rows(client: FeishuBaseClient, rows: list[dict[str, str]], *, dry_run: bool = False) -> tuple[int, int]:
    existing = existing_records_by_candidate_id(client)
    created = 0
    updated = 0
    for row in rows:
        candidate_id = clean(row.get("id"))
        if not candidate_id:
            continue
        existing_record = existing.get(candidate_id)
        if not existing_record:
            fields = base_payload(row, include_status=True)
            if dry_run:
                print(f"create {candidate_id}")
            else:
                client.create_record(fields)
            created += 1
            continue

        existing_status = clean(record_fields(existing_record).get(BASE_STATUS_FIELD)).casefold()
        include_status = existing_status not in PRESERVED_STATUS
        fields = base_payload(row, include_status=include_status)
        rid = record_id(existing_record)
        if dry_run:
            print(f"update {candidate_id} record_id={rid} preserve_status={not include_status}")
        elif rid:
            client.update_record(rid, fields)
        updated += 1
    return created, updated


def mark_missing_pending_ignored(
    client: FeishuBaseClient,
    rows: list[dict[str, str]],
    *,
    dry_run: bool = False,
) -> int:
    existing = existing_records_by_candidate_id(client)
    active_candidate_ids = {clean(row.get("id")) for row in rows if clean(row.get("id"))}
    marked = 0
    for candidate_id, existing_record in existing.items():
        if candidate_id in active_candidate_ids:
            continue
        fields = record_fields(existing_record)
        existing_status = clean(fields.get(BASE_STATUS_FIELD)).casefold()
        if existing_status in PRESERVED_STATUS:
            continue
        rid = record_id(existing_record)
        if not rid:
            continue
        payload = {
            BASE_STATUS_FIELD: "ignored",
            BASE_FIELDS["notes"]: append_note(
                clean(fields.get(BASE_FIELDS["notes"])),
                "自动标记：该候选已不在当前 translation_candidates.csv 中，可能已由规则/审核集覆盖。",
            ),
        }
        if dry_run:
            print(f"mark_missing_ignored {candidate_id} record_id={rid}")
        else:
            client.update_record(rid, payload)
        marked += 1
    return marked


def append_note(existing_note: str, new_note: str) -> str:
    if not existing_note:
        return new_note
    if new_note in existing_note:
        return existing_note
    return f"{existing_note} | {new_note}"


def main() -> int:
    args = parse_args()
    rows = load_csv(Path(args.input_csv))
    if not rows:
        print(f"No rows to sync from {args.input_csv}.")
        return 0
    client = build_client_or_skip()
    if client is None:
        return 0
    created, updated = sync_rows(client, rows, dry_run=args.dry_run)
    marked_ignored = 0
    if args.mark_missing_ignored:
        marked_ignored = mark_missing_pending_ignored(client, rows, dry_run=args.dry_run)
    print(
        f"Feishu Base synced: created={created}, updated={updated}, "
        f"marked_ignored={marked_ignored}, input={args.input_csv}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main_guard(main))
