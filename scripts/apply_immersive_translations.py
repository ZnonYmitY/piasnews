#!/usr/bin/env python3
"""Apply locally captured Immersive Translate mappings to static JSON.

The Chrome extension cannot run inside GitHub Actions, so the workflow treats
the captured mapping file as a reviewed build input. This script applies those
translations after fetchers have populated deterministic Chinese or English
fallback fields. Approved review rows are optional and are not part of the
default production path.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MAPPING = ROOT / "data" / "immersive_translations.zh.json"
DEFAULT_ITEMS = ROOT / "data" / "items.json"
DEFAULT_SOCIAL = ROOT / "data" / "social.json"
WHITESPACE_RE = re.compile(r"\s+")
URL_RE = re.compile(r"https?://\S+")

sys.path.insert(0, str(ROOT / "scripts"))
from translate_zh_argos import (  # noqa: E402
    apply_glossary,
    load_manual_translations,
    manual_headline_translation,
    manual_translation_for,
    social_prefix,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Apply Immersive Translate mappings to Piasnews data.")
    parser.add_argument("--mapping", default=str(DEFAULT_MAPPING), help="Immersive translation mapping JSON.")
    parser.add_argument("--items", default=str(DEFAULT_ITEMS), help="News items JSON to update.")
    parser.add_argument("--social", default=str(DEFAULT_SOCIAL), help="Social items JSON to update.")
    parser.add_argument("--review", default="", help="Optional approved manual translation CSV.")
    return parser.parse_args()


def normalize(value: str | None, *, strip_urls: bool = False) -> str:
    text = html.unescape(value or "")
    if strip_urls:
        text = URL_RE.sub("", text)
    return WHITESPACE_RE.sub(" ", text).strip()


def source_aware_repairs(source_text: str, zh: str) -> str:
    result = apply_glossary(zh)
    source_lower = source_text.casefold()
    if re.search(r"\bfia\b", source_lower):
        result = result.replace("Fia", "FIA")
        result = result.replace("国际汽联", "FIA")
    if re.search(r"\bmax\b", source_lower):
        result = result.replace("最大", "Max")
        result = result.replace("马克斯", "Max")
        result = result.replace("马克思", "Max")
    if re.search(r"\blando\b", source_lower):
        result = result.replace("兰多", "Lando")
    if re.search(r"\boscar\b", source_lower):
        result = result.replace("奥斯卡奖得主", "Oscar")
        result = result.replace("奥斯卡", "Oscar")
        result = result.replace("奥斯多", "Oscar")
    if re.search(r"\bzak brown\b", source_lower):
        result = result.replace("扎克·布朗", "Zak Brown")
        result = result.replace("扎克布朗", "Zak Brown")
    if "steward" in source_lower:
        result = result.replace("服务员", "FIA 干事")
        result = result.replace("管家", "FIA 干事")
        result = result.replace("主管", "FIA 干事")
    if "qualifying" in source_lower or re.search(r"\bquali\b", source_lower):
        result = result.replace("资格赛", "排位赛")
        result = result.replace("资格", "排位赛")
    if "pole" in source_lower:
        result = result.replace("极点", "杆位")
        result = result.replace("杆位位置", "杆位")
    if "downforce" in source_lower:
        result = result.replace("降压", "下压力")
    if "parc ferme" in source_lower or "parc fermé" in source_lower:
        result = result.replace("发烧", "parc ferme")
        result = result.replace("帕克费尔梅", "parc ferme")
    if "monster" in source_lower and "piastri" in source_lower and "can" in source_lower:
        result = result.replace("怪物能源", "Monster Energy")
        result = result.replace("怪物", "Monster")
        result = result.replace("Monster发射", "Monster 推出")
        result = result.replace("Monster 发射", "Monster 推出")
        result = result.replace("罐头", "联名罐")
        result = result.replace("F1罐", "F1 联名罐")
        result = result.replace("F1 罐", "F1 联名罐")
    if "red bull move" in source_lower or "move for piastri" in source_lower:
        result = result.replace("Red Bull行动", "Red Bull 转会")
        result = result.replace("Red Bull 行动", "Red Bull 转会")
        result = result.replace("行动", "转会")
    return normalize(result)


def load_translations(mapping_path: Path) -> dict[tuple[str, str], tuple[dict[str, str], dict[str, str]]]:
    if not mapping_path.exists():
        return {}
    payload = json.loads(mapping_path.read_text(encoding="utf-8"))
    translations = payload.get("translations") or {}
    grouped: dict[tuple[str, str], tuple[dict[str, str], dict[str, str]]] = {}
    for entry in translations.values():
        if not isinstance(entry, dict):
            continue
        dataset = normalize(entry.get("dataset"))
        if dataset == "news":
            dataset = "items"
        target_field = normalize(entry.get("target_field"))
        if dataset not in {"items", "social"} or target_field not in {"title_zh", "summary_zh"}:
            continue
        source_text = normalize(entry.get("source_text"))
        zh = normalize(entry.get("zh"))
        if not source_text or not zh:
            continue
        repaired = source_aware_repairs(source_text, zh)
        exact, without_urls = grouped.setdefault((dataset, target_field), ({}, {}))
        exact[source_text] = repaired
        without_url = normalize(source_text, strip_urls=True)
        if without_url:
            without_urls[without_url] = repaired
    return grouped


def get_translation(
    source_text: str,
    grouped: dict[tuple[str, str], tuple[dict[str, str], dict[str, str]]],
    dataset: str,
    target_field: str,
) -> str | None:
    exact, without_urls = grouped.get((dataset, target_field), ({}, {}))
    normalized = normalize(source_text)
    return exact.get(normalized) or without_urls.get(normalize(normalized, strip_urls=True))


def apply_item_translations(
    items_path: Path,
    grouped: dict[tuple[str, str], tuple[dict[str, str], dict[str, str]]],
    manual_translations: dict[str, str] | None = None,
) -> int:
    if not items_path.exists():
        return 0
    payload: dict[str, Any] = json.loads(items_path.read_text(encoding="utf-8"))
    updated = 0
    for item in payload.get("items", []):
        if not isinstance(item, dict):
            continue
        title = item.get("title") or ""
        title_zh = (
            manual_translation_for(title, manual_translations)
            or manual_headline_translation(title)
            or get_translation(title, grouped, "items", "title_zh")
        )
        if title_zh:
            item["title_zh"] = title_zh
            updated += 1
        summary = item.get("summary") or ""
        summary_zh = manual_translation_for(summary, manual_translations) or get_translation(
            summary,
            grouped,
            "items",
            "summary_zh",
        )
        if summary_zh:
            item["summary_zh"] = summary_zh
            updated += 1
    items_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return updated


def apply_social_translations(
    social_path: Path,
    grouped: dict[tuple[str, str], tuple[dict[str, str], dict[str, str]]],
    manual_translations: dict[str, str] | None = None,
) -> int:
    if not social_path.exists():
        return 0
    payload: dict[str, Any] = json.loads(social_path.read_text(encoding="utf-8"))
    updated = 0
    for item in payload.get("items", []):
        if not isinstance(item, dict):
            continue
        source_text = normalize(item.get("summary") or item.get("title"))
        translated = manual_translation_for(source_text, manual_translations) or get_translation(
            source_text,
            grouped,
            "social",
            "summary_zh",
        )
        if not translated:
            continue
        item["summary_zh"] = translated
        item["title_zh"] = f"{social_prefix(item)}{translated}"
        updated += 1
    social_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return updated


def main() -> int:
    args = parse_args()
    grouped = load_translations(Path(args.mapping))
    manual_translations = load_manual_translations(args.review) if args.review else {}
    item_count = apply_item_translations(Path(args.items), grouped, manual_translations)
    social_count = apply_social_translations(Path(args.social), grouped, manual_translations)
    mapping_count = sum(len(exact) for exact, _ in grouped.values())
    print(
        "Applied Immersive Translate mappings: "
        f"items={item_count} social={social_count} mappings={mapping_count}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
