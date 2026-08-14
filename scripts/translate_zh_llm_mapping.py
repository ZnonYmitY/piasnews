#!/usr/bin/env python3
"""Generate missing Piasnews Chinese translation mappings with an LLM.

This script writes the same mapping file consumed by
apply_immersive_translations.py. It is intentionally optional: when no API key is
configured, the workflow skips it and the existing Immersive/Argos fallbacks keep
the site publishable.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MAPPING = ROOT / "data" / "immersive_translations.zh.json"
DEFAULT_ITEMS = ROOT / "data" / "items.json"
DEFAULT_SOCIAL = ROOT / "data" / "social.json"
ENGINE = "piasnews_llm_translation"
DEFAULT_BASE_URL = "https://api.openai.com/v1"
DEFAULT_MODEL = "gpt-4.1-mini"
WHITESPACE_RE = re.compile(r"\s+")
URL_ONLY_RE = re.compile(r"^https?://\S+$", re.IGNORECASE)
CJK_RE = re.compile(r"[\u3400-\u9fff]")
EN_WORD_RE = re.compile(r"[A-Za-z][A-Za-z'’-]*")
ALLOWED_EN_WORDS = {
    "ai",
    "alpine",
    "aston",
    "audi",
    "bull",
    "bulls",
    "cadillac",
    "drs",
    "ferrari",
    "fia",
    "f1",
    "fp1",
    "fp2",
    "fp3",
    "gp",
    "haas",
    "hamilton",
    "lando",
    "lewis",
    "max",
    "mclaren",
    "mercedes",
    "norris",
    "op",
    "op81",
    "oscar",
    "piastri",
    "q1",
    "q2",
    "q3",
    "racing",
    "red",
    "sauber",
    "verstappen",
    "williams",
}

sys.path.insert(0, str(ROOT / "scripts"))
from apply_immersive_translations import source_aware_repairs  # noqa: E402


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate missing Chinese translation mappings with an LLM.")
    parser.add_argument("--items", default=str(DEFAULT_ITEMS), help="News items JSON path.")
    parser.add_argument("--social", default=str(DEFAULT_SOCIAL), help="Social items JSON path.")
    parser.add_argument("--mapping", default=str(DEFAULT_MAPPING), help="Translation mapping JSON path.")
    parser.add_argument("--base-url", default=os.environ.get("PIASNEWS_LLM_TRANSLATION_BASE_URL") or DEFAULT_BASE_URL)
    parser.add_argument("--model", default=os.environ.get("PIASNEWS_LLM_TRANSLATION_MODEL") or DEFAULT_MODEL)
    parser.add_argument("--api-key-env", default="PIASNEWS_LLM_TRANSLATION_API_KEY")
    parser.add_argument("--batch-size", type=int, default=12)
    parser.add_argument("--limit", type=int, default=80, help="Maximum missing targets to translate in one run.")
    parser.add_argument("--timeout", type=int, default=60)
    parser.add_argument("--strict", action="store_true", help="Fail instead of skipping on missing API config/errors.")
    parser.add_argument("--dry-run", action="store_true", help="Print target count without calling the API or writing.")
    return parser.parse_args()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def clean(value: str | None) -> str:
    return WHITESPACE_RE.sub(" ", html.unescape(value or "")).strip()


def sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:24]


def target_key(dataset: str, item_id: str, field: str, source_text: str) -> str:
    return f"{dataset}:{item_id}:{field}:{sha256(source_text)}"


def is_url_only(value: str) -> bool:
    return bool(URL_ONLY_RE.match(clean(value)))


def read_json(path: Path, fallback: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def mapping_has_translation(mapping: dict[str, Any], key: str) -> bool:
    entry = (mapping.get("translations") or {}).get(key)
    return bool(isinstance(entry, dict) and clean(entry.get("zh")))


def push_target(targets: list[dict[str, str]], mapping: dict[str, Any], target: dict[str, str]) -> None:
    if not target["source_text"] or is_url_only(target["source_text"]):
        return
    if mapping_has_translation(mapping, target["key"]):
        return
    targets.append(target)


def collect_item_targets(items_payload: dict[str, Any], mapping: dict[str, Any]) -> list[dict[str, str]]:
    targets: list[dict[str, str]] = []
    for item in items_payload.get("items") or []:
        if not isinstance(item, dict):
            continue
        item_id = clean(item.get("id") or item.get("url"))
        if not item_id:
            continue
        title = clean(item.get("title"))
        push_target(targets, mapping, {
            "key": target_key("items", item_id, "title", title),
            "dataset": "items",
            "item_id": item_id,
            "field": "title",
            "target_field": "title_zh",
            "source_text": title,
            "source_url": clean(item.get("url")),
            "source_name": clean(item.get("source")),
        })
        summary = clean(item.get("summary"))
        push_target(targets, mapping, {
            "key": target_key("items", item_id, "summary", summary),
            "dataset": "items",
            "item_id": item_id,
            "field": "summary",
            "target_field": "summary_zh",
            "source_text": summary,
            "source_url": clean(item.get("url")),
            "source_name": clean(item.get("source")),
        })
    return targets


def collect_social_targets(social_payload: dict[str, Any], mapping: dict[str, Any]) -> list[dict[str, str]]:
    targets: list[dict[str, str]] = []
    for item in social_payload.get("items") or []:
        if not isinstance(item, dict):
            continue
        item_id = clean(item.get("id") or item.get("url"))
        source_text = clean(item.get("summary") or item.get("title"))
        if not item_id:
            continue
        push_target(targets, mapping, {
            "key": target_key("social", item_id, "summary", source_text),
            "dataset": "social",
            "item_id": item_id,
            "field": "summary",
            "target_field": "summary_zh",
            "source_text": source_text,
            "source_url": clean(item.get("url")),
            "source_name": clean(item.get("source")),
        })
    return targets


def collect_targets(items_path: Path, social_path: Path, mapping: dict[str, Any]) -> list[dict[str, str]]:
    items = read_json(items_path, {"items": []})
    social = read_json(social_path, {"items": []})
    return collect_item_targets(items, mapping) + collect_social_targets(social, mapping)


def build_prompt(targets: list[dict[str, str]]) -> list[dict[str, str]]:
    compact_targets = [
        {
            "key": target["key"],
            "dataset": target["dataset"],
            "target_field": target["target_field"],
            "source_name": target["source_name"],
            "source_text": target["source_text"],
        }
        for target in targets
    ]
    system = (
        "You translate Oscar Piastri Formula 1 news and fan posts into natural Simplified Chinese. "
        "Preserve driver/team names such as Oscar, Piastri, Lando, Norris, McLaren, Ferrari, Red Bull, FIA, "
        "Max Verstappen, handles, hashtags, race abbreviations, and emoji when they carry meaning. "
        "Remove plain tracking URLs from Chinese output. Do not add facts. Return JSON only."
    )
    user = (
        "Translate each source_text. Return exactly this shape: "
        '{"translations":[{"key":"...","zh":"..."}]}. '
        "Keep each key unchanged.\n\n"
        f"{json.dumps(compact_targets, ensure_ascii=False)}"
    )
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]


def extract_json_object(text: str) -> dict[str, Any]:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped)
        stripped = re.sub(r"\s*```$", "", stripped)
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start >= 0 and end > start:
            return json.loads(stripped[start:end + 1])
        raise


def openai_chat_completion_client(
    *,
    base_url: str,
    api_key: str,
    model: str,
    timeout: int,
) -> Callable[[list[dict[str, str]]], str]:
    endpoint = f"{base_url.rstrip('/')}/chat/completions"

    def request(messages: list[dict[str, str]]) -> str:
        payload = {
            "model": model,
            "messages": messages,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
        }
        if "deepseek.com" in base_url:
            payload["thinking"] = {"type": "disabled"}
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            endpoint,
            data=data,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout) as response:
            body = json.loads(response.read().decode("utf-8"))
        content = ((body.get("choices") or [{}])[0].get("message") or {}).get("content")
        if not content:
            raise RuntimeError("LLM response did not contain choices[0].message.content")
        return str(content)

    return request


def valid_translation(source_text: str, zh: str) -> str:
    repaired = source_aware_repairs(source_text, clean(zh))
    if not repaired or not CJK_RE.search(repaired):
        return ""
    if repaired.casefold() == clean(source_text).casefold():
        return ""
    disallowed_words = [
        word for word in EN_WORD_RE.findall(repaired)
        if word.casefold() not in ALLOWED_EN_WORDS
        and not re.fullmatch(r"[PQ]\d{1,2}", word, re.IGNORECASE)
    ]
    if len(disallowed_words) >= 2:
        return ""
    return repaired


def translate_batch(
    targets: list[dict[str, str]],
    client: Callable[[list[dict[str, str]]], str],
) -> dict[str, str]:
    payload = extract_json_object(client(build_prompt(targets)))
    translations = payload.get("translations")
    if not isinstance(translations, list):
        raise RuntimeError("LLM response JSON missing translations list")
    by_key: dict[str, str] = {}
    source_by_key = {target["key"]: target["source_text"] for target in targets}
    for row in translations:
        if not isinstance(row, dict):
            continue
        key = clean(row.get("key"))
        if key not in source_by_key:
            continue
        zh = valid_translation(source_by_key[key], clean(row.get("zh")))
        if zh:
            by_key[key] = zh
    return by_key


def chunked(items: list[dict[str, str]], size: int) -> list[list[dict[str, str]]]:
    return [items[index:index + size] for index in range(0, len(items), size)]


def update_mapping(
    mapping: dict[str, Any],
    targets: list[dict[str, str]],
    translated: dict[str, str],
    *,
    model: str,
    base_url: str,
) -> int:
    mapping["schema_version"] = mapping.get("schema_version") or 1
    mapping["generated_at"] = now_iso()
    mapping["translations"] = mapping.get("translations") or {}
    target_by_key = {target["key"]: target for target in targets}
    count = 0
    for key, zh in translated.items():
        target = target_by_key.get(key)
        if not target or mapping_has_translation(mapping, key):
            continue
        mapping["translations"][key] = {
            "dataset": target["dataset"],
            "item_id": target["item_id"],
            "field": target["field"],
            "target_field": target["target_field"],
            "source_text": target["source_text"],
            "zh": zh,
            "engine": ENGINE,
            "model": model,
            "api_base_url": base_url.rstrip("/"),
            "captured_at": now_iso(),
        }
        count += 1
    return count


def main() -> int:
    args = parse_args()
    mapping_path = Path(args.mapping)
    mapping = read_json(mapping_path, {"schema_version": 1, "generated_at": None, "translations": {}})
    targets = collect_targets(Path(args.items), Path(args.social), mapping)
    if args.limit > 0:
        targets = targets[:args.limit]

    if args.dry_run:
        print(f"LLM translation mapping dry run: targets={len(targets)}")
        return 0
    if not targets:
        print("LLM translation mapping skipped: no missing targets.")
        return 0

    api_key = os.environ.get(args.api_key_env) or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        message = f"LLM translation mapping skipped: missing {args.api_key_env} or OPENAI_API_KEY."
        if args.strict:
            raise RuntimeError(message)
        print(message)
        return 0

    client = openai_chat_completion_client(
        base_url=args.base_url,
        api_key=api_key,
        model=args.model,
        timeout=args.timeout,
    )
    translated: dict[str, str] = {}
    try:
        for batch in chunked(targets, max(1, args.batch_size)):
            translated.update(translate_batch(batch, client))
            time.sleep(0.2)
    except (RuntimeError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        if args.strict:
            raise
        print(f"LLM translation mapping skipped after API error: {exc}", file=sys.stderr)
        return 0

    added = update_mapping(mapping, targets, translated, model=args.model, base_url=args.base_url)
    mapping_path.write_text(json.dumps(mapping, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Generated LLM translation mappings: targets={len(targets)} translated={len(translated)} added={added}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
