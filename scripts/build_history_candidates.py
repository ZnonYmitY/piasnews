#!/usr/bin/env python3
"""Build deterministic history-review candidates from recent Piasnews items."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


MIN_CANDIDATE_SCORE = 70

SPECULATIVE_RE = re.compile(
    r"\b(could|may|might|prediction|predicts|contender|odds|rumou?r|reportedly|"
    r"tipped|warning|market value|rank(?:ed|ing)?|rates?|why)\b",
    re.IGNORECASE,
)

SIGNAL_RULES = (
    (
        "championship",
        55,
        re.compile(r"\b(crowned|clinches?|secures?)\b.{0,35}\b(champion|championship|title)\b|\bworld champion\b", re.IGNORECASE),
    ),
    (
        "race_win",
        50,
        re.compile(
            r"\b(piastri|oscar piastri)\b.{0,70}\b(wins?|won|victory|takes the win|claims the win)\b|"
            r"\b(wins?|won)\b.{0,45}\b(piastri|oscar piastri)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "podium_or_pole",
        35,
        re.compile(
            r"\b(piastri|oscar piastri)\b.{0,70}\b(podium|pole position|takes pole|claims pole|secures pole)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "career_move",
        40,
        re.compile(
            r"\b(piastri|oscar piastri)\b.{0,70}\b(signs|signed|extends|extended|joins|joined|leaves|left|contract)\b|"
            r"\b(signs|signed|extends|extended)\b.{0,45}\b(piastri|oscar piastri)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "record_or_first",
        30,
        re.compile(r"\b(piastri|oscar piastri)\b.{0,70}\b(first|record|youngest|milestone)\b", re.IGNORECASE),
    ),
    (
        "major_ruling",
        30,
        re.compile(r"\b(disqualified|disqualification|major penalty|contract ruling|team orders?)\b", re.IGNORECASE),
    ),
)

STOPWORDS = {
    "a",
    "after",
    "and",
    "at",
    "for",
    "from",
    "in",
    "is",
    "of",
    "on",
    "oscar",
    "piastri",
    "the",
    "to",
    "with",
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build Piasnews history-review candidates.")
    parser.add_argument("--items", default="data/items.json")
    parser.add_argument("--history", default="data/history.json")
    parser.add_argument("--candidates", default="data/history-candidates.json")
    parser.add_argument("--now", help="Override current UTC time, ISO-8601 format.")
    return parser.parse_args()


def parse_now(value: str | None) -> datetime:
    if not value:
        return utc_now()
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def title_tokens(title: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9]+", title.lower())
        if len(token) > 2 and token not in STOPWORDS
    }


def similar_title(left: str, right: str) -> bool:
    left_tokens = title_tokens(left)
    right_tokens = title_tokens(right)
    if not left_tokens or not right_tokens:
        return False
    overlap = len(left_tokens & right_tokens) / len(left_tokens | right_tokens)
    return overlap >= 0.42


def cluster_items(items: list[dict[str, Any]]) -> list[list[dict[str, Any]]]:
    clusters: list[list[dict[str, Any]]] = []
    for item in items:
        for cluster in clusters:
            if similar_title(item["title"], cluster[0]["title"]):
                cluster.append(item)
                break
        else:
            clusters.append([item])
    return clusters


def score_cluster(cluster: list[dict[str, Any]]) -> tuple[int, list[str], str]:
    lead = max(cluster, key=lambda item: (item.get("official", False), item.get("verified", False)))
    title = lead["title"]
    if lead.get("category") in {"rumor", "interview"} or SPECULATIVE_RE.search(title):
        return 0, ["excluded_speculative_or_interview"], "other"

    score = 0
    signals: list[str] = []
    event_kind = "other"

    if lead.get("official"):
        score += 35
        signals.append("official_source")

    for name, points, pattern in SIGNAL_RULES:
        if pattern.search(title):
            score += points
            signals.append(name)
            if event_kind == "other":
                event_kind = name

    source_count = len({item.get("source") for item in cluster if item.get("source")})
    if source_count >= 3:
        score += 25
        signals.append("coverage_3_plus_sources")
    elif source_count == 2:
        score += 15
        signals.append("coverage_2_sources")

    return min(score, 100), signals, event_kind


def slug_key(value: str) -> str:
    words = [word for word in re.findall(r"[a-z0-9]+", value.lower()) if word not in STOPWORDS]
    return "_".join(words[:6]) or "event"


def candidate_id(item: dict[str, Any], event_date: str) -> str:
    digest = hashlib.sha1(f"{item['title']}|{item['url']}".encode()).hexdigest()[:10]
    return f"piastri-{event_date}-auto-{digest}"


def event_type(event_kind: str) -> str:
    return {
        "championship": "career_milestone",
        "race_win": "race_win",
        "podium_or_pole": "career_milestone",
        "career_move": "career_turning_point",
        "record_or_first": "career_milestone",
        "major_ruling": "career_turning_point",
    }.get(event_kind, "other")


def build_candidate(cluster: list[dict[str, Any]], score: int, signals: list[str], event_kind: str, now: datetime) -> dict[str, Any]:
    lead = max(cluster, key=lambda item: (item.get("official", False), item.get("verified", False)))
    event_date = lead["published_at"][:10]
    source_item_ids = sorted({item["id"] for item in cluster})
    source_names = sorted({item.get("source", "Unknown") for item in cluster})
    strong_keys = [event_kind, slug_key(lead["title"])] if event_kind != "other" else [slug_key(lead["title"])]

    return {
        "id": candidate_id(lead, event_date),
        "date": event_date,
        "month_day": event_date[5:],
        "year": int(event_date[:4]),
        "title": lead["title"],
        "summary": lead.get("summary") or "Candidate generated from recent public news metadata.",
        "type": event_type(event_kind),
        "source": lead.get("source") or "Unknown",
        "url": lead["url"],
        "verification": {
            "status": "needs_review",
            "source_type": lead.get("source_type", "media"),
            "primary_source": bool(lead.get("official")),
        },
        "candidate": {
            "status": "pending",
            "score": score,
            "signals": signals,
            "source_count": len(source_names),
            "sources": source_names,
            "source_item_ids": source_item_ids,
            "discovered_at": now.isoformat().replace("+00:00", "Z"),
            "origin": "deterministic_recent_news_rules",
            "reviewed_at": None,
            "reviewed_by": None,
            "decision_reason": None,
        },
        "selection": {
            "review_status": "pending",
            "include": None,
            "historical_value": None,
            "peak_attention": None,
            "lasting_significance": None,
            "career_impact": None,
            "fan_recognition": None,
            "inclusion_reason": f"Automatically nominated from signals: {', '.join(signals)}.",
        },
        "semantic": {
            "event_kind": event_kind,
            "themes": [signal for signal in signals if not signal.startswith("coverage_") and signal != "official_source"],
            "entities": ["Oscar Piastri", "McLaren"],
            "competition": "Formula 1",
            "season": int(event_date[:4]),
            "round": None,
            "circuit": None,
            "session": None,
            "outcome": lead["title"],
            "strong_keys": strong_keys,
            "embedding_text": f"{lead['title']}. {lead.get('summary', '')}".strip(),
        },
        "tags": ["Oscar Piastri", "McLaren", "F1", event_kind],
    }


def main() -> int:
    args = parse_args()
    now = parse_now(args.now)
    items_payload = load_json(Path(args.items))
    history_payload = load_json(Path(args.history))
    candidates_path = Path(args.candidates)
    candidates_payload = load_json(candidates_path)

    items = [item for item in items_payload.get("items", []) if item.get("verified")]
    existing_ids = {event["id"] for event in history_payload.get("events", [])}
    existing_titles = [
        event.get("title", "")
        for event in history_payload.get("events", []) + candidates_payload.get("candidates", [])
    ]
    existing_urls = {
        event.get("url")
        for event in history_payload.get("events", []) + candidates_payload.get("candidates", [])
        if event.get("url")
    }
    known_source_items = {
        item_id
        for candidate in candidates_payload.get("candidates", [])
        for item_id in candidate.get("candidate", {}).get("source_item_ids", [])
    }

    additions = []
    for cluster in cluster_items(items):
        if any(item["id"] in known_source_items for item in cluster):
            continue
        if any(item.get("url") in existing_urls for item in cluster):
            continue
        if any(similar_title(cluster[0]["title"], title) for title in existing_titles if title):
            continue
        score, signals, event_kind = score_cluster(cluster)
        if score < MIN_CANDIDATE_SCORE:
            continue
        candidate = build_candidate(cluster, score, signals, event_kind, now)
        if candidate["id"] in existing_ids:
            continue
        additions.append(candidate)

    if additions:
        candidates_payload["generated_at"] = now.isoformat().replace("+00:00", "Z")
        candidates_payload.setdefault("candidates", []).extend(additions)
        candidates_path.write_text(json.dumps(candidates_payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"Added {len(additions)} history candidates; {len(candidates_payload.get('candidates', []))} total.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
