#!/usr/bin/env python3
"""Notify a dedicated Feishu group webhook after Piasnews public data refreshes."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


DEFAULT_SUMMARY_JSON = Path("/tmp/piasnews-refresh-summary.json")
TRACKED_FILES = {
    "news": ("items.json", "新闻数据"),
    "daily": ("daily.json", "日报统计"),
    "social": ("social.json", "粉丝源"),
    "calendar": ("calendar.json", "F1 赛历"),
    "translations": ("immersive_translations.zh.json", "中文映射"),
    "history_candidates": ("history-candidates.json", "历史候选"),
}
VOLATILE_KEYS = {"generated_at", "discovered_at", "source_status"}


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Send Piasnews refresh notification to Feishu.")
    parser.add_argument("--before-dir", default="", help="Directory containing previous data/*.json snapshot.")
    parser.add_argument("--data-dir", default="data", help="Directory containing current data/*.json files.")
    parser.add_argument("--summary-json", default=str(DEFAULT_SUMMARY_JSON))
    parser.add_argument("--page-url", default=os.environ.get("PIASNEWS_PAGE_URL", "https://znonymity.github.io/piasnews/"))
    parser.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", ""))
    parser.add_argument("--run-id", default=os.environ.get("GITHUB_RUN_ID", ""))
    parser.add_argument("--webhook-url", default=os.environ.get("PIASNEWS_FEISHU_WEBHOOK_URL", ""))
    parser.add_argument("--always", action="store_true", help="Send even when no meaningful public data changed.")
    parser.add_argument("--build-summary", action="store_true", help="Only build the summary JSON; do not send.")
    return parser.parse_args(argv)


def load_json(path: Path) -> Any:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def strip_volatile(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: strip_volatile(item) for key, item in sorted(value.items()) if key not in VOLATILE_KEYS}
    if isinstance(value, list):
        return [strip_volatile(item) for item in value]
    return value


def stable_hash(value: Any) -> str:
    data = json.dumps(strip_volatile(value), sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def item_key(item: dict[str, Any]) -> str:
    return str(item.get("id") or item.get("url") or item.get("title") or item.get("title_zh") or "")


def item_signature(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": item_key(item),
        "url": item.get("url", ""),
        "title": item.get("title", ""),
        "title_zh": item.get("title_zh", ""),
        "summary": item.get("summary", ""),
        "summary_zh": item.get("summary_zh", ""),
        "published_at": item.get("published_at", ""),
        "source": item.get("source", ""),
        "category": item.get("category", ""),
    }


def item_map(payload: Any) -> dict[str, dict[str, Any]]:
    if not isinstance(payload, dict):
        return {}
    result = {}
    for item in payload.get("items") or []:
        if not isinstance(item, dict):
            continue
        key = item_key(item)
        if key:
            result[key] = item_signature(item)
    return result


def parse_time(value: str) -> datetime:
    if not value:
        return datetime.min.replace(tzinfo=timezone.utc)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def latest_item(payload: Any) -> dict[str, str]:
    if not isinstance(payload, dict):
        return {}
    items = [item for item in payload.get("items") or [] if isinstance(item, dict)]
    if not items:
        return {}
    latest = max(items, key=lambda item: parse_time(str(item.get("published_at", ""))))
    return {
        "title": str(latest.get("title_zh") or latest.get("title") or ""),
        "source": str(latest.get("source") or ""),
        "published_at": str(latest.get("published_at") or ""),
        "url": str(latest.get("url") or ""),
    }


def compare_collection(before_payload: Any, current_payload: Any) -> dict[str, Any]:
    before_items = item_map(before_payload)
    current_items = item_map(current_payload)
    new_keys = sorted(set(current_items) - set(before_items))
    removed_keys = sorted(set(before_items) - set(current_items))
    changed_keys = sorted(key for key in set(current_items) & set(before_items) if current_items[key] != before_items[key])
    return {
        "current_count": len(current_items),
        "previous_count": len(before_items),
        "new_count": len(new_keys),
        "removed_count": len(removed_keys),
        "changed_count": len(changed_keys),
        "count_delta": len(current_items) - len(before_items),
        "changed": bool(new_keys or removed_keys or changed_keys),
        "latest": latest_item(current_payload),
    }


def compare_json_file(before_dir: Path, data_dir: Path, filename: str) -> bool:
    before_payload = load_json(before_dir / filename)
    current_payload = load_json(data_dir / filename)
    if current_payload is None:
        return False
    if before_payload is None:
        return True
    return stable_hash(before_payload) != stable_hash(current_payload)


def action_url(repo: str, run_id: str) -> str:
    if not repo or not run_id:
        return ""
    return f"https://github.com/{repo}/actions/runs/{run_id}"


def build_summary(before_dir: Path, data_dir: Path, *, page_url: str, repo: str, run_id: str) -> dict[str, Any]:
    items_before = load_json(before_dir / "items.json")
    items_current = load_json(data_dir / "items.json")
    social_before = load_json(before_dir / "social.json")
    social_current = load_json(data_dir / "social.json")

    sections = {
        "news": compare_collection(items_before, items_current),
        "social": compare_collection(social_before, social_current),
    }
    changed_files = []
    for section, (filename, label) in TRACKED_FILES.items():
        if section in {"news", "social"}:
            changed = sections[section]["changed"]
        elif section == "daily" and sections["news"]["changed"]:
            changed = False
        else:
            changed = compare_json_file(before_dir, data_dir, filename)
        if changed:
            changed_files.append({"section": section, "file": filename, "label": label})

    return {
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "has_changes": bool(changed_files),
        "changed_files": changed_files,
        "sections": sections,
        "page_url": page_url,
        "run_url": action_url(repo, run_id),
    }


def write_summary(summary: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def load_summary(path: Path) -> dict[str, Any]:
    payload = load_json(path)
    if not isinstance(payload, dict):
        return {"has_changes": False, "changed_files": [], "sections": {}}
    return payload


def format_latest(item: dict[str, str]) -> str:
    if not item:
        return "暂无"
    source = f" - {item['source']}" if item.get("source") else ""
    when = f" ({item['published_at']})" if item.get("published_at") else ""
    return f"{item.get('title') or '未命名'}{source}{when}"


def format_count_delta(delta: int) -> str:
    if delta > 0:
        return f"+{delta}"
    return str(delta)


def format_collection_line(label: str, section: dict[str, Any]) -> str:
    return (
        f"{label}：新增 {section.get('new_count', 0)} 条，"
        f"移出 {section.get('removed_count', 0)} 条，"
        f"内容变更 {section.get('changed_count', 0)} 条，"
        f"当前保留 {section.get('current_count', 0)} 条"
        f"（近3天，较上次 {format_count_delta(int(section.get('count_delta', 0)))}）"
    )


def build_text(summary: dict[str, Any]) -> str:
    sections = summary.get("sections") or {}
    news = sections.get("news") or {}
    social = sections.get("social") or {}
    changed_labels = [item.get("label", item.get("file", "")) for item in summary.get("changed_files") or []]
    changed_text = "、".join(label for label in changed_labels if label) or "无内容变化"

    links = []
    if summary.get("page_url"):
        links.append(f"网页: {summary['page_url']}")
    if summary.get("run_url"):
        links.append(f"GitHub Actions: {summary['run_url']}")
    links_text = "\n".join(links) if links else "未配置公开链接。"

    return (
        "Piasnews 网页信息刷新\n"
        f"已更新模块：{changed_text}\n\n"
        f"{format_collection_line('新闻数据', news)}\n"
        f"最新新闻：{format_latest(news.get('latest') or {})}\n\n"
        f"{format_collection_line('粉丝源', social)}\n"
        f"最新粉丝源：{format_latest(social.get('latest') or {})}\n\n"
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
                raise RuntimeError(f"Feishu refresh webhook failed: HTTP {response.status} {body}")
            print(f"Feishu refresh notification sent: HTTP {response.status}")
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Feishu refresh webhook request failed: {exc}") from exc


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    summary_path = Path(args.summary_json)
    if args.before_dir:
        summary = build_summary(
            Path(args.before_dir),
            Path(args.data_dir),
            page_url=args.page_url,
            repo=args.repo,
            run_id=args.run_id,
        )
        write_summary(summary, summary_path)
        if args.build_summary:
            print(f"Wrote refresh summary to {summary_path}")
            return 0
    else:
        summary = load_summary(summary_path)

    if not summary.get("has_changes") and not args.always:
        print("No public Piasnews data changes; skipping Feishu refresh notification.")
        return 0
    if not args.webhook_url:
        print("PIASNEWS_FEISHU_WEBHOOK_URL is not configured; skipping Feishu refresh notification.")
        return 0
    post_feishu_text(args.webhook_url, build_text(summary))
    return 0


if __name__ == "__main__":
    sys.exit(main())
