#!/usr/bin/env python3
"""Notify a Feishu incoming webhook about new translation badcase candidates."""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


DEFAULT_LATEST_CSV = Path("data/translation_candidates_latest.csv")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Send Piasnews translation badcase notification to Feishu.")
    parser.add_argument("--latest-csv", default=str(DEFAULT_LATEST_CSV))
    parser.add_argument("--webhook-url", default=os.environ.get("FEISHU_WEBHOOK_URL", ""))
    parser.add_argument("--base-url", default=os.environ.get("FEISHU_BASE_URL", ""))
    parser.add_argument("--page-url", default=os.environ.get("PIASNEWS_PAGE_URL", ""))
    parser.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", ""))
    parser.add_argument("--run-id", default=os.environ.get("GITHUB_RUN_ID", ""))
    parser.add_argument("--always", action="store_true", help="Send even when there are no new candidates.")
    return parser.parse_args()


def load_rows(path: Path | str) -> list[dict[str, str]]:
    csv_path = Path(path)
    if not csv_path.exists():
        return []
    with csv_path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def public_file_url(page_url: str, filename: str) -> str:
    if not page_url:
        return ""
    return urllib.parse.urljoin(page_url.rstrip("/") + "/", f"data/{filename}")


def run_url(repo: str, run_id: str) -> str:
    if not repo or not run_id:
        return ""
    return f"https://github.com/{repo}/actions/runs/{run_id}"


def build_text(rows: list[dict[str, str]], *, base_url: str, page_url: str, repo: str, run_id: str) -> str:
    count = len(rows)
    xlsx_url = public_file_url(page_url, "translation_candidates_latest.xlsx")
    csv_url = public_file_url(page_url, "translation_candidates_latest.csv")
    action_url = run_url(repo, run_id)
    preview = []
    for row in rows[:3]:
        source = row.get("source") or row.get("source_type") or "unknown"
        error_type = row.get("error_type") or "unknown"
        text = row.get("source_text") or ""
        if len(text) > 80:
            text = text[:79].rstrip() + "..."
        preview.append(f"- [{error_type}] {source}: {text}")
    preview_text = "\n".join(preview) if preview else "- 本轮没有新增候选。"
    links = []
    if base_url:
        links.append(f"飞书记录表: {base_url}")
    if xlsx_url:
        links.append(f"Excel: {xlsx_url}")
    if csv_url:
        links.append(f"CSV: {csv_url}")
    if action_url:
        links.append(f"GitHub Actions: {action_url}")
    links_text = "\n".join(links) if links else "未配置公开链接。"
    return (
        "Piasnews 翻译 badcase 审查更新\n"
        f"本轮新增候选：{count} 条\n\n"
        f"{preview_text}\n\n"
        "说明：生产链路已不依赖飞书 pending 审核；这里仅通知仍需人工关注、且已带建议中文的候选。\n\n"
        f"{links_text}"
    )


def post_feishu_text(webhook_url: str, text: str) -> None:
    payload = json.dumps({
        "msg_type": "text",
        "content": {"text": text},
    }).encode("utf-8")
    request = urllib.request.Request(
        webhook_url,
        data=payload,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            body = response.read().decode("utf-8", errors="replace")
            if response.status >= 300:
                raise RuntimeError(f"Feishu webhook failed: HTTP {response.status} {body}")
            print(f"Feishu notification sent: HTTP {response.status}")
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Feishu webhook request failed: {exc}") from exc


def main() -> int:
    args = parse_args()
    rows = load_rows(args.latest_csv)
    if not rows and not args.always:
        print("No new translation candidates; skipping Feishu notification.")
        return 0
    if not args.webhook_url:
        print("FEISHU_WEBHOOK_URL is not configured; skipping Feishu notification.")
        return 0
    post_feishu_text(
        args.webhook_url,
        build_text(rows, base_url=args.base_url, page_url=args.page_url, repo=args.repo, run_id=args.run_id),
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
