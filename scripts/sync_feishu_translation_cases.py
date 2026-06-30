#!/usr/bin/env python3
"""Sync approved translation review rows into a Feishu Base case-library table."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Any

from feishu_translation_base import (
    DEFAULT_REVIEW_CSV,
    FeishuBaseClient,
    clean,
    configured_from_env,
    load_csv,
    main_guard,
    record_fields,
    record_id,
)


CASE_ID_FIELD = "样本ID"
CASE_FIELDS = {
    "source_text": "英文原文",
    "current_zh": "当前中文",
    "suggested_zh": "建议中文",
    "status": "审核状态",
    "notes": "备注",
    "id": CASE_ID_FIELD,
    "source_type": "来源类型",
    "domain": "场景",
    "priority": "优先级",
    "tags": "标签",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync approved translation review rows to Feishu Base.")
    parser.add_argument("--review-csv", default=str(DEFAULT_REVIEW_CSV))
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def build_client_or_skip() -> FeishuBaseClient | None:
    config = configured_from_env()
    case_table_id = os.environ.get("FEISHU_CASE_TABLE_ID", "")
    required = {
        "app_id": "FEISHU_APP_ID",
        "app_secret": "FEISHU_APP_SECRET",
        "app_token": "FEISHU_BASE_APP_TOKEN",
    }
    missing = [env_name for key, env_name in required.items() if not config.get(key)]
    if not case_table_id:
        missing.append("FEISHU_CASE_TABLE_ID")
    if missing:
        print(f"Feishu case library config missing ({', '.join(missing)}); skipping.")
        return None
    return FeishuBaseClient(
        app_id=config["app_id"],
        app_secret=config["app_secret"],
        app_token=config["app_token"],
        table_id=case_table_id,
    )


def approved_review_rows(path: Path | str) -> list[dict[str, str]]:
    rows = []
    for row in load_csv(path):
        if clean(row.get("status")).casefold() == "approved" and clean(row.get("source_text")):
            rows.append(row)
    return rows


def case_payload(row: dict[str, str]) -> dict[str, Any]:
    payload = {}
    for csv_field, base_field in CASE_FIELDS.items():
        value = row.get(csv_field, "")
        if csv_field == "status":
            value = "approved"
        payload[base_field] = value
    return payload


def existing_cases_by_sample_id(client: FeishuBaseClient) -> dict[str, dict[str, Any]]:
    records = client.list_records(field_names=[CASE_ID_FIELD])
    index = {}
    for record in records:
        sample_id = clean(record_fields(record).get(CASE_ID_FIELD))
        if sample_id:
            index[sample_id] = record
    return index


def sync_cases(client: FeishuBaseClient, rows: list[dict[str, str]], *, dry_run: bool = False) -> tuple[int, int]:
    existing = existing_cases_by_sample_id(client)
    created = 0
    updated = 0
    for row in rows:
        sample_id = clean(row.get("id"))
        if not sample_id:
            continue
        payload = case_payload(row)
        existing_record = existing.get(sample_id)
        if existing_record:
            rid = record_id(existing_record)
            if dry_run:
                print(f"update case {sample_id} record_id={rid}")
            elif rid:
                client.update_record(rid, payload)
            updated += 1
        else:
            if dry_run:
                print(f"create case {sample_id}")
            else:
                client.create_record(payload)
            created += 1
    return created, updated


def main() -> int:
    args = parse_args()
    rows = approved_review_rows(Path(args.review_csv))
    if not rows:
        print(f"No approved review rows to sync from {args.review_csv}.")
        return 0
    client = build_client_or_skip()
    if client is None:
        return 0
    created, updated = sync_cases(client, rows, dry_run=args.dry_run)
    print(f"Feishu case library synced: created={created}, updated={updated}, input={args.review_csv}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main_guard(main))
