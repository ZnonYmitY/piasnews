#!/usr/bin/env python3
"""Send the two scheduled Piasnews daily messages to a Feishu group."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path
from typing import Any

from notify_feishu_refresh import build_summary, format_count_delta, format_latest, load_json, post_feishu_text


DEFAULT_PAGE_URL = "https://znonymity.github.io/piasnews/"


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Send daily Piasnews update and hot-ranking messages to Feishu.")
    parser.add_argument("--before-dir", required=True, help="Data snapshot from approximately 24 hours ago.")
    parser.add_argument("--data-dir", default="data", help="Directory containing current data files.")
    parser.add_argument("--hot-events", default="data/hot-events.json", help="Current published hot ranking JSON.")
    parser.add_argument("--page-url", default=os.environ.get("PIASNEWS_PAGE_URL", DEFAULT_PAGE_URL))
    parser.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", ""))
    parser.add_argument("--run-id", default=os.environ.get("GITHUB_RUN_ID", ""))
    parser.add_argument("--webhook-url", default=os.environ.get("PIASNEWS_FEISHU_WEBHOOK_URL", ""))
    return parser.parse_args(argv)


def format_daily_collection(label: str, section: dict[str, Any]) -> str:
    return (
        f"{label}：新增 {section.get('new_count', 0)} 条，"
        f"移出 {section.get('removed_count', 0)} 条，"
        f"内容/翻译变更 {section.get('changed_count', 0)} 条，"
        f"当前保留 {section.get('current_count', 0)} 条"
        f"（近3天，较昨日 {format_count_delta(int(section.get('count_delta', 0)))}）"
    )


def build_daily_update_text(summary: dict[str, Any]) -> str:
    sections = summary.get("sections") or {}
    news = sections.get("news") or {}
    social = sections.get("social") or {}
    labels = [row.get("label", row.get("file", "")) for row in summary.get("changed_files") or []]
    changed_text = "、".join(label for label in labels if label) or "无内容变化"

    return (
        "Piasnews 每日更新｜过去24小时\n"
        f"更新模块：{changed_text}\n\n"
        f"{format_daily_collection('新闻数据', news)}\n"
        f"最新新闻：{format_latest(news.get('latest') or {})}\n\n"
        f"{format_daily_collection('粉丝源', social)}\n"
        f"最新粉丝源：{format_latest(social.get('latest') or {})}\n\n"
        f"网页：{summary.get('page_url') or DEFAULT_PAGE_URL}"
    )


def event_anchor_url(event: dict[str, Any]) -> str:
    items = [item for item in event.get("items") or [] if isinstance(item, dict)]
    anchor_id = str(event.get("anchor_item_id") or "")
    if anchor_id:
        for item in items:
            if str(item.get("item_id") or "") == anchor_id and item.get("url"):
                return str(item["url"])
    for item in items:
        if item.get("url"):
            return str(item["url"])
    return ""


def visible_ranked_events(payload: Any) -> list[dict[str, Any]]:
    if not isinstance(payload, dict):
        return []
    events = [
        event
        for event in payload.get("events") or []
        if isinstance(event, dict) and event.get("hidden") is not True
    ]
    return sorted(events, key=lambda event: int(event.get("rank") or 10**9))


def build_hot_ranking_text(payload: Any, page_url: str) -> str:
    events = visible_ranked_events(payload)
    lines = ["Piasnews 今日热榜"]
    if not events:
        lines.append("当前暂无可见热榜条目。")
    for event in events:
        rank = int(event.get("rank") or 0)
        word = str(event.get("hot_word_zh") or event.get("hot_word_en") or "未命名热点")
        labels = "/".join(str(label) for label in event.get("source_labels") or []) or "未分类"
        heat = event.get("heat", 0)
        item_count = len([item for item in event.get("items") or [] if isinstance(item, dict)])
        lines.append(f"{rank}. [{labels}] {word}（热度 {heat}，{item_count} 条相关内容）")
        url = event_anchor_url(event)
        if url:
            lines.append(url)
    lines.extend(["", f"完整热榜：{page_url}"])
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    if not args.webhook_url:
        print("PIASNEWS_FEISHU_WEBHOOK_URL is not configured; skipping daily Feishu notifications.")
        return 0

    summary = build_summary(
        Path(args.before_dir),
        Path(args.data_dir),
        page_url=args.page_url,
        repo=args.repo,
        run_id=args.run_id,
    )
    hot_payload = load_json(Path(args.hot_events))
    post_feishu_text(args.webhook_url, build_daily_update_text(summary))
    post_feishu_text(args.webhook_url, build_hot_ranking_text(hot_payload, args.page_url))
    return 0


if __name__ == "__main__":
    sys.exit(main())
