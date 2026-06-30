#!/usr/bin/env python3
"""Shared helpers for syncing Piasnews translation review data with Feishu Base."""

from __future__ import annotations

import csv
import json
import os
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CANDIDATES_CSV = ROOT / "data" / "translation_candidates_latest.csv"
DEFAULT_REVIEW_CSV = ROOT / "data" / "translation_review.csv"

REVIEW_FIELDS = [
    "id",
    "source_type",
    "domain",
    "source_text",
    "current_zh",
    "suggested_zh",
    "status",
    "priority",
    "tags",
    "notes",
]

BASE_FIELDS = {
    "id": "候选ID",
    "run_id": "运行ID",
    "first_seen_at": "首次发现",
    "source_type": "来源类型",
    "domain": "场景",
    "url": "原始链接",
    "source": "来源",
    "source_text": "英文原文",
    "current_zh": "当前中文",
    "suggested_zh": "建议中文",
    "status": "审核状态",
    "priority": "优先级",
    "error_type": "错误类型",
    "tags": "标签",
    "notes": "备注",
}

BASE_STATUS_FIELD = BASE_FIELDS["status"]
BASE_ID_FIELD = BASE_FIELDS["id"]


def load_csv(path: Path | str) -> list[dict[str, str]]:
    csv_path = Path(path)
    if not csv_path.exists():
        return []
    with csv_path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path | str, rows: list[dict[str, str]], fields: list[str]) -> None:
    csv_path = Path(path)
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def clean(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, list):
        parts = []
        for item in value:
            if isinstance(item, dict):
                parts.append(str(item.get("text") or item.get("name") or item.get("id") or ""))
            else:
                parts.append(str(item))
        return ", ".join(part for part in parts if part).strip()
    if isinstance(value, dict):
        return str(value.get("text") or value.get("name") or value.get("link") or "")
    return str(value).strip()


def configured_from_env() -> dict[str, str]:
    return {
        "app_id": os.environ.get("FEISHU_APP_ID", ""),
        "app_secret": os.environ.get("FEISHU_APP_SECRET", ""),
        "app_token": os.environ.get("FEISHU_BASE_APP_TOKEN") or os.environ.get("FEISHU_BITABLE_APP_TOKEN", ""),
        "table_id": os.environ.get("FEISHU_BASE_TABLE_ID", ""),
    }


def missing_config(config: dict[str, str]) -> list[str]:
    mapping = {
        "app_id": "FEISHU_APP_ID",
        "app_secret": "FEISHU_APP_SECRET",
        "app_token": "FEISHU_BASE_APP_TOKEN",
        "table_id": "FEISHU_BASE_TABLE_ID",
    }
    return [mapping[key] for key, value in config.items() if not value]


class FeishuError(RuntimeError):
    pass


class FeishuBaseClient:
    def __init__(self, *, app_id: str, app_secret: str, app_token: str, table_id: str):
        self.app_id = app_id
        self.app_secret = app_secret
        self.app_token = app_token
        self.table_id = table_id
        self.base_url = "https://open.feishu.cn/open-apis"
        self._tenant_token = ""

    def request(
        self,
        method: str,
        path: str,
        *,
        query: dict[str, Any] | None = None,
        payload: dict[str, Any] | None = None,
        auth: bool = True,
    ) -> dict[str, Any]:
        url = self.base_url + path
        if query:
            url += "?" + urllib.parse.urlencode(query, doseq=True)
        data = json.dumps(payload or {}, ensure_ascii=False).encode("utf-8") if payload is not None else None
        headers = {"Content-Type": "application/json; charset=utf-8"}
        if auth:
            headers["Authorization"] = f"Bearer {self.tenant_token()}"
        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read().decode("utf-8", errors="replace")
        result = json.loads(body) if body else {}
        code = result.get("code", 0)
        if code not in (0, "0"):
            message = result.get("msg") or result.get("message") or "unknown error"
            raise FeishuError(f"Feishu API failed at {path}: code={code} msg={message}")
        return result

    def tenant_token(self) -> str:
        if self._tenant_token:
            return self._tenant_token
        result = self.request(
            "POST",
            "/auth/v3/tenant_access_token/internal",
            payload={"app_id": self.app_id, "app_secret": self.app_secret},
            auth=False,
        )
        token = result.get("tenant_access_token") or result.get("data", {}).get("tenant_access_token")
        if not token:
            raise FeishuError("Feishu tenant_access_token missing in response.")
        self._tenant_token = str(token)
        return self._tenant_token

    def list_records(self, *, field_names: list[str] | None = None) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []
        page_token = ""
        while True:
            query: dict[str, Any] = {"page_size": 500}
            if page_token:
                query["page_token"] = page_token
            if field_names:
                query["field_names"] = json.dumps(field_names, ensure_ascii=False)
            result = self.request(
                "GET",
                f"/bitable/v1/apps/{self.app_token}/tables/{self.table_id}/records",
                query=query,
            )
            data = result.get("data") or {}
            records.extend(data.get("items") or [])
            if not data.get("has_more"):
                break
            page_token = str(data.get("page_token") or "")
            if not page_token:
                break
        return records

    def create_record(self, fields: dict[str, Any]) -> dict[str, Any]:
        return self.request(
            "POST",
            f"/bitable/v1/apps/{self.app_token}/tables/{self.table_id}/records",
            payload={"fields": fields},
        )

    def update_record(self, record_id: str, fields: dict[str, Any]) -> dict[str, Any]:
        return self.request(
            "PUT",
            f"/bitable/v1/apps/{self.app_token}/tables/{self.table_id}/records/{record_id}",
            payload={"fields": fields},
        )


def record_fields(record: dict[str, Any]) -> dict[str, Any]:
    return record.get("fields") or {}


def record_id(record: dict[str, Any]) -> str:
    return str(record.get("record_id") or record.get("id") or "")


def build_client_or_skip() -> FeishuBaseClient | None:
    config = configured_from_env()
    missing = missing_config(config)
    if missing:
        print(f"Feishu Base config missing ({', '.join(missing)}); skipping.")
        return None
    return FeishuBaseClient(**config)


def main_guard(fn) -> int:
    try:
        return int(fn())
    except FeishuError as exc:
        print(str(exc), file=sys.stderr)
        return 1

