#!/usr/bin/env python3
"""Audit Piasnews Chinese translations and emit pending badcase candidates.

The audit is deterministic and intentionally conservative about approval:
it can discover likely bad translations, but every row is written as
``pending`` for human review before it can affect production translation.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import re
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from xml.sax.saxutils import escape


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_ITEMS = ROOT / "data" / "items.json"
DEFAULT_SOCIAL = ROOT / "data" / "social.json"
DEFAULT_REVIEW = ROOT / "data" / "translation_review.csv"
DEFAULT_CANDIDATES = ROOT / "data" / "translation_candidates.csv"
DEFAULT_LATEST_CSV = ROOT / "data" / "translation_candidates_latest.csv"
DEFAULT_LATEST_XLSX = ROOT / "data" / "translation_candidates_latest.xlsx"

FIELDS = [
    "id",
    "run_id",
    "first_seen_at",
    "source_type",
    "domain",
    "url",
    "source",
    "source_text",
    "current_zh",
    "suggested_zh",
    "status",
    "priority",
    "error_type",
    "tags",
    "notes",
]

GLOSSARY_MANAGED_ERRORS = {
    "person_name_translation",
    "team_name_translation",
}

PERSON_REPLACEMENTS = (
    ("奥斯卡·皮亚斯特里", "Oscar Piastri"),
    ("奥斯卡·皮阿斯特里", "Oscar Piastri"),
    ("奥斯卡·Piastri", "Oscar Piastri"),
    ("皮亚斯特里", "Piastri"),
    ("皮阿斯特里", "Piastri"),
    ("马克斯·弗斯泰彭", "Max Verstappen"),
    ("马克斯·维斯塔潘", "Max Verstappen"),
    ("弗斯泰彭", "Verstappen"),
    ("维斯塔潘", "Verstappen"),
    ("兰多·诺里斯", "Lando Norris"),
    ("诺里斯", "Norris"),
    ("乔治·罗素", "George Russell"),
    ("罗素", "Russell"),
    ("刘易斯·汉密尔顿", "Lewis Hamilton"),
    ("汉密尔顿", "Hamilton"),
    ("查尔斯·勒克莱尔", "Charles Leclerc"),
    ("勒克莱尔", "Leclerc"),
    ("亚历克丝·布伦德", "Alex Brundle"),
    ("布伦德", "Brundle"),
    ("马克·韦伯", "Mark Webber"),
    ("韦伯", "Webber"),
)

TEAM_REPLACEMENTS = (
    ("红牛环", "Red Bull Ring"),
    ("红牛", "Red Bull"),
    ("迈凯伦", "McLaren"),
    ("麦拉伦", "McLaren"),
    ("法拉利", "Ferrari"),
    ("梅赛德斯", "Mercedes"),
    ("奔驰", "Mercedes"),
)

TERM_REPLACEMENTS = (
    ("服务员", "干事"),
    ("管理者", "干事"),
    ("主管", "干事"),
    ("管家", "干事"),
    ("拿起杆子", "拿下杆位"),
    ("降压", "下压力"),
    ("发烧", "parc ferme"),
)

MACHINE_ENGLISH_WORDS = {
    "about",
    "after",
    "ahead",
    "amid",
    "and",
    "are",
    "as",
    "at",
    "before",
    "breaks",
    "clear",
    "clears",
    "confirms",
    "could",
    "decision",
    "destination",
    "driver",
    "following",
    "for",
    "from",
    "hint",
    "in",
    "is",
    "linked",
    "major",
    "of",
    "over",
    "reacts",
    "rumours",
    "shock",
    "shuffle",
    "star",
    "summoned",
    "the",
    "to",
    "transfer",
    "uncertainty",
    "verdict",
    "was",
    "were",
    "with",
}

CJK_RE = re.compile(r"[\u3400-\u9fff]")
URL_RE = re.compile(r"https?://\S+")
WORD_RE = re.compile(r"[A-Za-z][A-Za-z'-]*")
WHITESPACE_RE = re.compile(r"\s+")


@dataclass(frozen=True)
class TranslationEntry:
    source_type: str
    domain: str
    url: str
    source: str
    source_text: str
    current_zh: str


@dataclass(frozen=True)
class Issue:
    error_type: str
    priority: str
    tags: tuple[str, ...]
    notes: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit Piasnews translation badcases.")
    parser.add_argument("--items", default=str(DEFAULT_ITEMS))
    parser.add_argument("--social", default=str(DEFAULT_SOCIAL))
    parser.add_argument("--review", default=str(DEFAULT_REVIEW))
    parser.add_argument("--candidates", default=str(DEFAULT_CANDIDATES))
    parser.add_argument("--latest-csv", default=str(DEFAULT_LATEST_CSV))
    parser.add_argument("--latest-xlsx", default=str(DEFAULT_LATEST_XLSX))
    return parser.parse_args()


def clean_text(value: str | None) -> str:
    return WHITESPACE_RE.sub(" ", URL_RE.sub("", html.unescape(value or ""))).strip()


def has_cjk(value: str | None) -> bool:
    return bool(CJK_RE.search(value or ""))


def utc_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def load_json(path: Path | str) -> dict[str, Any]:
    return json.loads(Path(path).read_text(encoding="utf-8"))


def load_csv_rows(path: Path | str) -> list[dict[str, str]]:
    csv_path = Path(path)
    if not csv_path.exists():
        return []
    with csv_path.open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def approved_review_keys(path: Path | str) -> set[tuple[str, str]]:
    keys: set[tuple[str, str]] = set()
    for row in load_csv_rows(path):
        if (row.get("status") or "").strip().lower() != "approved":
            continue
        source_type = clean_text(row.get("source_type")) or "unknown"
        source_text = clean_text(row.get("source_text"))
        if source_text:
            keys.add((source_type, source_text.casefold()))
    return keys


def existing_candidate_ids(rows: Iterable[dict[str, str]]) -> set[str]:
    return {clean_text(row.get("id")) for row in rows if clean_text(row.get("id"))}


def make_id(entry: TranslationEntry) -> str:
    raw = "|".join([entry.source_type, entry.domain, clean_text(entry.source_text).casefold()])
    return "tc-" + hashlib.sha1(raw.encode("utf-8")).hexdigest()[:14]


def normalize_tags(values: Iterable[str]) -> str:
    tags = []
    seen = set()
    for value in values:
        for tag in value.split(","):
            cleaned = clean_text(tag).replace(" ", "_")
            if cleaned and cleaned not in seen:
                tags.append(cleaned)
                seen.add(cleaned)
    return ",".join(tags)


def entries_from_items(payload: dict[str, Any]) -> list[TranslationEntry]:
    entries: list[TranslationEntry] = []
    for item in payload.get("items") or []:
        title = clean_text(item.get("title"))
        title_zh = clean_text(item.get("title_zh"))
        if title:
            entries.append(TranslationEntry(
                source_type="news",
                domain="f1_news_title",
                url=clean_text(item.get("url")),
                source=clean_text(item.get("source")),
                source_text=title,
                current_zh=title_zh,
            ))
        summary = clean_text(item.get("summary"))
        summary_zh = clean_text(item.get("summary_zh"))
        if summary and summary_zh:
            entries.append(TranslationEntry(
                source_type="news",
                domain="f1_news_summary",
                url=clean_text(item.get("url")),
                source=clean_text(item.get("source")),
                source_text=summary,
                current_zh=summary_zh,
            ))
    return entries


def social_domain(text: str) -> str:
    lowered = text.lower()
    if "radio" in lowered or "📻" in text:
        return "team_radio"
    if lowered.startswith("q:") or " oscar:" in lowered:
        return "interview_quote"
    return "x_post"


def entries_from_social(payload: dict[str, Any]) -> list[TranslationEntry]:
    entries: list[TranslationEntry] = []
    for item in payload.get("items") or []:
        summary = clean_text(item.get("summary"))
        summary_zh = clean_text(item.get("summary_zh"))
        if not summary:
            continue
        entries.append(TranslationEntry(
            source_type="social",
            domain=social_domain(summary),
            url=clean_text(item.get("url")),
            source=clean_text(item.get("source")),
            source_text=summary,
            current_zh=summary_zh,
        ))
    return entries


def machine_english_hits(value: str) -> list[str]:
    hits = []
    for word in WORD_RE.findall(value):
        lowered = word.casefold()
        if lowered in MACHINE_ENGLISH_WORDS:
            hits.append(word)
    return hits


def detect_issues(entry: TranslationEntry) -> list[Issue]:
    text = entry.source_text
    zh = entry.current_zh
    lowered = text.casefold()
    issues: list[Issue] = []

    if any(bad in zh for bad, _good in PERSON_REPLACEMENTS):
        issues.append(Issue(
            "person_name_translation",
            "high",
            ("person", "name", entry.domain),
            "人名应保留英文，避免中文音译或半中半英。",
        ))
    if any(bad in zh for bad, _good in TEAM_REPLACEMENTS):
        issues.append(Issue(
            "team_name_translation",
            "high",
            ("team", "name", entry.domain),
            "车队名/赛道名应按术语表保留英文。",
        ))
    if "steward" in lowered and any(term in zh for term in ("管家", "服务员", "主管", "管理者")):
        issues.append(Issue(
            "stewards_term",
            "high",
            ("stewards", "penalty", entry.domain),
            "stewards 应译为 FIA 干事，不能译成管家/服务员/主管。",
        ))
    if ("qualifying" in lowered or "quali" in lowered) and "资格" in zh:
        issues.append(Issue(
            "qualifying_term",
            "high",
            ("qualifying", entry.domain),
            "qualifying/quali 在 F1 语境应译为排位赛。",
        ))
    if "pole" in lowered and "杆子" in zh:
        issues.append(Issue(
            "pole_term",
            "high",
            ("pole", "qualifying", entry.domain),
            "pole 应译为杆位。",
        ))
    if "downforce" in lowered and "降压" in zh:
        issues.append(Issue(
            "downforce_term",
            "high",
            ("downforce", "technical", entry.domain),
            "downforce 是下压力，不是降压。",
        ))
    if "parc" in lowered and "发烧" in zh:
        issues.append(Issue(
            "parc_ferme_term",
            "high",
            ("parc_ferme", "penalty", entry.domain),
            "parc ferme 不应译成发烧。",
        ))

    english_hits = machine_english_hits(zh)
    if len(english_hits) >= 3:
        issues.append(Issue(
            "mixed_machine_english",
            "medium",
            ("mixed_language", entry.domain),
            f"疑似机器翻译残留英文功能词：{', '.join(english_hits[:6])}。",
        ))
    if not has_cjk(zh) and len(text) >= 28:
        issues.append(Issue(
            "untranslated_fallback",
            "medium",
            ("untranslated", entry.domain),
            "新闻标题/摘要疑似仍为英文兜底，需要人工判断是否中文化。",
        ))
    if ("…" in zh or "..." in zh) and len(text) > 50:
        issues.append(Issue(
            "truncated_translation",
            "low",
            ("truncation", entry.domain),
            "中文内容疑似截断；高曝光标题需要人工确认是否可读。",
        ))
    if "互联网档案馆" in zh or "存檔" in zh:
        issues.append(Issue(
            "web_archive_noise",
            "high",
            ("noise", entry.domain),
            "翻译混入网页归档噪音。",
        ))
    return issues


def suggested_translation(entry: TranslationEntry) -> str:
    result = entry.current_zh
    for bad, good in (*PERSON_REPLACEMENTS, *TEAM_REPLACEMENTS, *TERM_REPLACEMENTS):
        result = result.replace(bad, good)
    if "qualifying" in entry.source_text.casefold() or "quali" in entry.source_text.casefold():
        result = result.replace("资格赛", "排位赛").replace("资格", "排位赛")
    result = result.replace("  ", " ").strip()
    return result if result != entry.current_zh else ""


def priority_rank(priority: str) -> int:
    return {"high": 0, "medium": 1, "low": 2}.get(priority, 3)


def candidate_row(entry: TranslationEntry, issues: list[Issue], run_id: str, seen_at: str) -> dict[str, str]:
    issue_types = ",".join(issue.error_type for issue in issues)
    priority = sorted((issue.priority for issue in issues), key=priority_rank)[0]
    tags = normalize_tags(tag for issue in issues for tag in issue.tags)
    notes = " | ".join(issue.notes for issue in issues)
    return {
        "id": make_id(entry),
        "run_id": run_id,
        "first_seen_at": seen_at,
        "source_type": entry.source_type,
        "domain": entry.domain,
        "url": entry.url,
        "source": entry.source,
        "source_text": entry.source_text,
        "current_zh": entry.current_zh,
        "suggested_zh": suggested_translation(entry),
        "status": "pending",
        "priority": priority,
        "error_type": issue_types,
        "tags": tags,
        "notes": notes,
    }


def audit_entries(
    entries: Iterable[TranslationEntry],
    *,
    approved_keys: set[tuple[str, str]],
    existing_ids: set[str],
    run_id: str,
    seen_at: str,
) -> list[dict[str, str]]:
    new_rows: list[dict[str, str]] = []
    new_ids: set[str] = set()
    for entry in entries:
        source_text = clean_text(entry.source_text)
        if not source_text or not clean_text(entry.current_zh):
            continue
        if (entry.source_type, source_text.casefold()) in approved_keys:
            continue
        row_id = make_id(entry)
        if row_id in existing_ids or row_id in new_ids:
            continue
        issues = detect_issues(entry)
        issues = [issue for issue in issues if issue.error_type not in GLOSSARY_MANAGED_ERRORS]
        if not issues:
            continue
        new_rows.append(candidate_row(entry, issues, run_id, seen_at))
        new_ids.add(row_id)
    return sorted(new_rows, key=lambda row: (priority_rank(row["priority"]), row["source_type"], row["domain"], row["source_text"]))


def write_csv(path: Path | str, rows: list[dict[str, str]]) -> None:
    csv_path = Path(path)
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def append_candidates(path: Path | str, existing_rows: list[dict[str, str]], new_rows: list[dict[str, str]]) -> None:
    rows = [
        normalize_existing_candidate_row(row)
        for row in existing_rows
        if not candidate_errors_are_glossary_managed(row)
    ] + new_rows
    write_csv(path, rows)


def normalize_row(row: dict[str, str]) -> dict[str, str]:
    return {field: row.get(field, "") for field in FIELDS}


def normalize_existing_candidate_row(row: dict[str, str]) -> dict[str, str]:
    normalized = normalize_row(row)
    error_types = [
        clean_text(error_type)
        for error_type in normalized["error_type"].split(",")
        if clean_text(error_type) and clean_text(error_type) not in GLOSSARY_MANAGED_ERRORS
    ]
    tags = [
        clean_text(tag)
        for tag in normalized["tags"].split(",")
        if clean_text(tag) not in {"person", "name", "team"}
    ]
    notes = [
        clean_text(note)
        for note in normalized["notes"].split("|")
        if clean_text(note)
        and "人名应保留英文" not in note
        and "车队名/赛道名" not in note
    ]
    normalized["error_type"] = ",".join(error_types)
    normalized["tags"] = normalize_tags(tags)
    normalized["notes"] = " | ".join(notes)
    return normalized


def candidate_errors_are_glossary_managed(row: dict[str, str]) -> bool:
    error_types = {
        clean_text(error_type)
        for error_type in (row.get("error_type") or "").split(",")
        if clean_text(error_type)
    }
    return bool(error_types) and error_types.issubset(GLOSSARY_MANAGED_ERRORS)


def column_name(index: int) -> str:
    name = ""
    value = index + 1
    while value:
        value, remainder = divmod(value - 1, 26)
        name = chr(65 + remainder) + name
    return name


def write_xlsx(path: Path | str, rows: list[dict[str, str]]) -> None:
    xlsx_path = Path(path)
    xlsx_path.parent.mkdir(parents=True, exist_ok=True)
    sheet_rows = [FIELDS] + [[row.get(field, "") for field in FIELDS] for row in rows]
    worksheet = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>',
        '<cols>',
    ]
    widths = [18, 22, 22, 14, 18, 42, 18, 64, 64, 64, 12, 12, 32, 32, 64]
    for idx, width in enumerate(widths, start=1):
        worksheet.append(f'<col min="{idx}" max="{idx}" width="{width}" customWidth="1"/>')
    worksheet.append("</cols><sheetData>")
    for row_index, values in enumerate(sheet_rows, start=1):
        worksheet.append(f'<row r="{row_index}">')
        for column_index, value in enumerate(values):
            ref = f"{column_name(column_index)}{row_index}"
            escaped = escape(str(value), {'"': "&quot;"})
            style = ' s="1"' if row_index == 1 else ""
            worksheet.append(f'<c r="{ref}" t="inlineStr"{style}><is><t>{escaped}</t></is></c>')
        worksheet.append("</row>")
    worksheet.append("</sheetData></worksheet>")

    styles = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>"""

    with zipfile.ZipFile(xlsx_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>""")
        archive.writestr("_rels/.rels", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>""")
        archive.writestr("xl/workbook.xml", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="new_candidates" sheetId="1" r:id="rId1"/></sheets>
</workbook>""")
        archive.writestr("xl/_rels/workbook.xml.rels", """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>""")
        archive.writestr("xl/worksheets/sheet1.xml", "\n".join(worksheet))
        archive.writestr("xl/styles.xml", styles)


def run_audit(args: argparse.Namespace) -> list[dict[str, str]]:
    seen_at = utc_iso()
    run_id = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    existing_rows = load_csv_rows(args.candidates)
    approved_keys = approved_review_keys(args.review)
    existing_ids = existing_candidate_ids(existing_rows)
    entries = [
        *entries_from_items(load_json(args.items)),
        *entries_from_social(load_json(args.social)),
    ]
    new_rows = audit_entries(
        entries,
        approved_keys=approved_keys,
        existing_ids=existing_ids,
        run_id=run_id,
        seen_at=seen_at,
    )
    append_candidates(args.candidates, existing_rows, new_rows)
    write_csv(args.latest_csv, new_rows)
    write_xlsx(args.latest_xlsx, new_rows)
    print(
        f"Audited {len(entries)} translations; new_candidates={len(new_rows)}; "
        f"candidates={args.candidates}; latest_xlsx={args.latest_xlsx}"
    )
    return new_rows


def main() -> None:
    run_audit(parse_args())


if __name__ == "__main__":
    main()
