#!/usr/bin/env python3
"""Generate Chinese title and summary fields with optional Argos Translate.

The workflow is intentionally build-time only: visitors and installed skills read
static JSON and do not call an online translation API. If Argos or its en->zh
model is unavailable, the script falls back to deterministic glossary cleanup so
data generation remains reliable.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Callable


URL_RE = re.compile(r"https?://\S+")
CJK_RE = re.compile(r"[\u3400-\u9fff]")
WHITESPACE_RE = re.compile(r"\s+")

TERM_REPLACEMENTS = (
    ("Oscar Piastri", "Oscar Piastri"),
    ("Piastri", "Piastri"),
    ("OP81", "OP81"),
    ("McLaren", "McLaren"),
    ("Formula 1", "Formula 1"),
    ("F1", "F1"),
    ("Grand Prix", "大奖赛"),
    ("Austrian GP", "奥地利大奖赛"),
    ("Austrian Grand Prix", "奥地利大奖赛"),
    ("Red Bull Ring", "Red Bull Ring"),
    ("qualifying", "排位赛"),
    ("Qualifying", "排位赛"),
    ("quali", "排位赛"),
    ("pole", "杆位"),
    ("practice", "练习赛"),
    ("FP1", "一练"),
    ("FP2", "二练"),
    ("FP3", "三练"),
    ("race", "正赛"),
    ("sprint", "冲刺赛"),
    ("podium", "领奖台"),
    ("team radio", "车队无线电"),
    ("Team Radio", "车队无线电"),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Translate Piasnews static JSON Chinese fields.")
    parser.add_argument("--items", default="data/items.json", help="News items JSON path.")
    parser.add_argument("--social", default="data/social.json", help="Social items JSON path.")
    parser.add_argument("--strict-argos", action="store_true", help="Fail if Argos en->zh translation is unavailable.")
    return parser.parse_args()


def clean_text(value: str | None) -> str:
    return WHITESPACE_RE.sub(" ", URL_RE.sub("", value or "")).strip()


def has_cjk(value: str | None) -> bool:
    return bool(CJK_RE.search(value or ""))


def apply_glossary(value: str) -> str:
    result = value
    for source, target in TERM_REPLACEMENTS:
        result = result.replace(source, target)
    result = re.sub(r"奥斯卡[·・]?Piastri(?:\(Oscar Piastri\))?", "Oscar Piastri", result)
    result = re.sub(r"皮亚斯特里(?:\(Piastri\))?", "Piastri", result)
    result = re.sub(r"麦克拉伦(?:\(McLaren\))?", "McLaren", result)
    result = re.sub(r"一级方程式(?:\(Formula 1\))?", "Formula 1", result)
    result = re.sub(r"\b[fF]1\b", "F1", result)
    result = result.replace("贝莫安", "谈到")
    result = result.replace("贝莫恩", "谈到")
    result = result.replace("Magicles", "没有“魔法”")
    result = result.replace("magicless", "没有“魔法”")
    result = result.replace("非常艰难的McLaren", "McLaren 的艰难")
    result = result.replace("迈凯伦", "McLaren")
    result = result.replace("皮亚斯特里", "Piastri")
    result = result.replace("奥斯卡·皮亚斯特里", "Oscar Piastri")
    result = result.replace("一级方程式", "Formula 1")
    return clean_text(result)


def fallback_title(text: str, *, prefix: str = "") -> str:
    cleaned = apply_glossary(clean_text(text))
    if not cleaned:
        return prefix.rstrip("：")
    if len(cleaned) > 88:
        cleaned = cleaned[:87].rstrip() + "…"
    return f"{prefix}{cleaned}" if prefix else cleaned


def load_argos_translator(strict: bool = False) -> Callable[[str], str] | None:
    try:
        import argostranslate.package
        import argostranslate.translate
    except Exception as exc:  # noqa: BLE001 - optional dependency
        if strict:
            raise RuntimeError(f"Argos Translate import failed: {exc}") from exc
        return None

    from_code = "en"
    to_code = "zh"

    def installed_pair_available() -> bool:
        installed = argostranslate.translate.get_installed_languages()
        source_language = next((item for item in installed if item.code == from_code), None)
        target_language = next((item for item in installed if item.code == to_code), None)
        if not source_language or not target_language:
            return False
        try:
            source_language.get_translation(target_language)
            return True
        except Exception:  # noqa: BLE001 - package may not be installed
            return False

    try:
        if not installed_pair_available():
            argostranslate.package.update_package_index()
            packages = argostranslate.package.get_available_packages()
            package = next(
                item for item in packages
                if item.from_code == from_code and item.to_code == to_code
            )
            argostranslate.package.install_from_path(package.download())
    except Exception as exc:  # noqa: BLE001 - network/model availability
        if strict:
            raise RuntimeError(f"Argos en->zh package setup failed: {exc}") from exc
        return None

    def translate(text: str) -> str:
        cleaned = clean_text(text)
        if not cleaned:
            return ""
        try:
            return apply_glossary(argostranslate.translate.translate(cleaned, from_code, to_code))
        except Exception as exc:  # noqa: BLE001 - keep data generation reliable
            if strict:
                raise RuntimeError(f"Argos translation failed: {exc}") from exc
            return apply_glossary(cleaned)

    return translate


def translate_or_fallback(text: str, translator: Callable[[str], str] | None, *, prefix: str = "") -> str:
    cleaned = clean_text(text)
    if not cleaned:
        return ""
    if translator:
        translated = translator(cleaned)
        if translated and translated != cleaned:
            return translated
    return fallback_title(cleaned, prefix=prefix)


def update_news_item(item: dict[str, Any], translator: Callable[[str], str] | None) -> None:
    title = clean_text(item.get("title"))
    summary = clean_text(item.get("summary"))
    if title:
        item["title_zh"] = translate_or_fallback(title, translator)
    existing_summary_zh = clean_text(item.get("summary_zh"))
    if existing_summary_zh and has_cjk(existing_summary_zh):
        item["summary_zh"] = apply_glossary(existing_summary_zh)
    elif summary:
        item["summary_zh"] = translate_or_fallback(summary, translator)


def social_prefix(item: dict[str, Any]) -> str:
    platform = "Instagram" if item.get("source_type") == "instagram" else "X"
    kind = "转帖" if item.get("post_kind") == "repost" else "发帖"
    source = item.get("source") or ""
    return f"{platform} {kind} {source}："


def update_social_item(item: dict[str, Any], translator: Callable[[str], str] | None) -> None:
    summary = clean_text(item.get("summary") or item.get("title"))
    if summary:
        item["summary_zh"] = translate_or_fallback(summary, translator)
        item["title_zh"] = translate_or_fallback(summary, translator, prefix=social_prefix(item))


def update_payload(path: Path, updater: Callable[[dict[str, Any], Callable[[str], str] | None], None], translator: Callable[[str], str] | None) -> int:
    if not path.exists():
        return 0
    payload = json.loads(path.read_text())
    items = payload.get("items", [])
    if not isinstance(items, list):
        return 0
    for item in items:
        if isinstance(item, dict):
            updater(item, translator)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    return len(items)


def main() -> int:
    args = parse_args()
    translator = load_argos_translator(strict=args.strict_argos)
    news_count = update_payload(Path(args.items), update_news_item, translator)
    social_count = update_payload(Path(args.social), update_social_item, translator)
    mode = "argos" if translator else "fallback"
    print(f"Translated Chinese fields with {mode}: news={news_count} social={social_count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
