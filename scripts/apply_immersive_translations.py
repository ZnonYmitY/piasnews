#!/usr/bin/env python3
"""Apply locally captured Immersive Translate mappings to static JSON.

The Chrome extension cannot run inside GitHub Actions, so the workflow treats
the captured mapping file as a reviewed build input. This script applies those
translations after the normal offline translator has populated Chinese fields.
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
DEFAULT_SOCIAL = ROOT / "data" / "social.json"
WHITESPACE_RE = re.compile(r"\s+")
URL_RE = re.compile(r"https?://\S+")

sys.path.insert(0, str(ROOT / "scripts"))
from translate_zh_argos import apply_glossary, social_prefix  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Apply Immersive Translate mappings to Piasnews data.")
    parser.add_argument("--mapping", default=str(DEFAULT_MAPPING), help="Immersive translation mapping JSON.")
    parser.add_argument("--social", default=str(DEFAULT_SOCIAL), help="Social items JSON to update.")
    return parser.parse_args()


def normalize(value: str | None, *, strip_urls: bool = False) -> str:
    text = html.unescape(value or "")
    if strip_urls:
        text = URL_RE.sub("", text)
    return WHITESPACE_RE.sub(" ", text).strip()


def source_aware_repairs(source_text: str, zh: str) -> str:
    result = apply_glossary(zh)
    source_lower = source_text.casefold()
    if re.search(r"\bmax\b", source_lower):
        result = result.replace("最大", "Max")
        result = result.replace("马克斯", "Max")
    if re.search(r"\blando\b", source_lower):
        result = result.replace("兰多", "Lando")
    if re.search(r"\boscar\b", source_lower):
        result = result.replace("奥斯卡奖得主", "Oscar")
        result = result.replace("奥斯卡", "Oscar")
        result = result.replace("奥斯多", "Oscar")
    if re.search(r"\bzak brown\b", source_lower):
        result = result.replace("扎克·布朗", "Zak Brown")
        result = result.replace("扎克布朗", "Zak Brown")
    return normalize(result)


def load_social_translations(mapping_path: Path) -> tuple[dict[str, str], dict[str, str]]:
    if not mapping_path.exists():
        return {}, {}
    payload = json.loads(mapping_path.read_text(encoding="utf-8"))
    translations = payload.get("translations") or {}
    exact: dict[str, str] = {}
    without_urls: dict[str, str] = {}
    for entry in translations.values():
        if not isinstance(entry, dict):
            continue
        if entry.get("dataset") != "social" or entry.get("target_field") != "summary_zh":
            continue
        source_text = normalize(entry.get("source_text"))
        zh = normalize(entry.get("zh"))
        if not source_text or not zh:
            continue
        repaired = source_aware_repairs(source_text, zh)
        exact[source_text] = repaired
        without_url = normalize(source_text, strip_urls=True)
        if without_url:
            without_urls[without_url] = repaired
    return exact, without_urls


def apply_social_translations(social_path: Path, exact: dict[str, str], without_urls: dict[str, str]) -> int:
    if not social_path.exists() or not exact:
        return 0
    payload: dict[str, Any] = json.loads(social_path.read_text(encoding="utf-8"))
    updated = 0
    for item in payload.get("items", []):
        if not isinstance(item, dict):
            continue
        source_text = normalize(item.get("summary") or item.get("title"))
        translated = exact.get(source_text) or without_urls.get(normalize(source_text, strip_urls=True))
        if not translated:
            continue
        item["summary_zh"] = translated
        item["title_zh"] = f"{social_prefix(item)}{translated}"
        updated += 1
    social_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return updated


def main() -> int:
    args = parse_args()
    exact, without_urls = load_social_translations(Path(args.mapping))
    social_count = apply_social_translations(Path(args.social), exact, without_urls)
    print(f"Applied Immersive Translate mappings: social={social_count} mappings={len(exact)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
