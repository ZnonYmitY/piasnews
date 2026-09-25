#!/usr/bin/env python3
"""Build one deterministic Piasnews hot-event list from news and social data."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import re
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
TOKEN_RE = re.compile(r"[a-z0-9]+", re.IGNORECASE)
URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)
SOCIAL_PREFIX_RE = re.compile(r"^(?:X|Instagram)\s+(?:post|repost|发帖|转帖)[^:：]*[:：]\s*", re.IGNORECASE)
REPOST_PREFIX_RE = re.compile(r"^(?:RT|repost|转发)\s+@[a-z0-9_.-]+\s*[:：]\s*", re.IGNORECASE)
HANDLE_RE = re.compile(r"(?<![\w])@[a-z0-9_.-]+", re.IGNORECASE)
MEDIA_CREDIT_RE = re.compile(r"(?:📸|🎥|🎬|credit)\s*[:：]?\s*@?[a-z0-9_.-]+\s*$", re.IGNORECASE)
GENERIC_MEDIA_POINTER_RE = re.compile(
    r"^(?:(?:exact(?:ly)?\s+)?same|another|more|full)?\s*(?:video|clip|photo|picture|pics?)\s*(?:here|below)?$"
    r"|^(?:watch|see|look\s+at)\s+(?:this|the)(?:\s+(?:video|clip|photo|picture))?$",
    re.IGNORECASE,
)
STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "has", "have", "he", "his",
    "in", "is", "it", "mclaren", "of", "on", "oscar", "piastri", "that", "the", "this", "to", "was",
    "with", "x", "f1", "gp", "grand", "prix",
}
SOURCE_LABELS = {"official": "官", "media": "媒", "fan": "粉"}
POSITION_WORDS = {
    "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5,
    "sixth": 6, "seventh": 7, "eighth": 8, "ninth": 9, "tenth": 10,
    "eleventh": 11, "twelfth": 12, "thirteenth": 13, "fourteenth": 14,
    "fifteenth": 15, "sixteenth": 16, "seventeenth": 17, "eighteenth": 18,
    "nineteenth": 19, "twentieth": 20,
}
POSITION_TOKEN = r"(?:p?(?:[1-9]|1\d|20)(?:st|nd|rd|th)?|" + "|".join(POSITION_WORDS) + r")"
SESSION_LABELS = {
    "practice_1": ("一练", "Practice 1"),
    "practice_2": ("二练", "Practice 2"),
    "practice_3": ("三练", "Practice 3"),
    "sprint_qualifying": ("冲刺排位", "Sprint Qualifying"),
    "sprint": ("冲刺赛", "Sprint"),
    "qualifying": ("排位赛", "Qualifying"),
    "race": ("正赛", "Race"),
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build Piasnews hot events.")
    parser.add_argument("--items", default=str(ROOT / "data/items.json"))
    parser.add_argument("--social", default=str(ROOT / "data/social.json"))
    parser.add_argument("--calendar", default=str(ROOT / "data/calendar.json"))
    parser.add_argument("--session-results", default=str(ROOT / "data/session-results.json"))
    parser.add_argument("--config", default=str(ROOT / "config/hot-ranking.json"))
    parser.add_argument("--overrides", default=str(ROOT / "data/hot-event-overrides.json"))
    parser.add_argument("--previous", default=str(ROOT / "data/hot-events.json"))
    parser.add_argument("--output", default=str(ROOT / "data/hot-events.json"))
    parser.add_argument("--now", help="Override current UTC time, ISO-8601 format.")
    parser.add_argument("--refresh-reason", default="", help="Refresh-gate reason used for session-result hard pins.")
    return parser.parse_args()


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def now_time(value: str | None) -> datetime:
    return parse_time(value) or datetime.now(timezone.utc)


def isoformat(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def read_json(path: Path, fallback: dict[str, Any]) -> dict[str, Any]:
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def clean(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def item_text(item: dict[str, Any]) -> str:
    return " ".join(clean(item.get(field)) for field in ("title", "title_zh", "summary", "summary_zh") if item.get(field)).lower()


def normalize_semantic_fragment(value: Any, *, strip_handles: bool = True) -> str:
    text = html.unescape(clean(value))
    text = SOCIAL_PREFIX_RE.sub("", text)
    text = REPOST_PREFIX_RE.sub("", text)
    text = URL_RE.sub(" ", text)
    text = MEDIA_CREDIT_RE.sub("", text)
    if strip_handles:
        text = HANDLE_RE.sub(" ", text)
    return clean(text).strip(" ·:-—|/\\")


def semantic_key(value: Any) -> str:
    return "".join(character.casefold() for character in clean(value) if character.isalnum())


def low_information_keys(config: dict[str, Any]) -> set[str]:
    phrases = [
        *(config.get("low_information_phrases") or []),
        *(config.get("media_review_phrases") or []),
    ]
    return {semantic_key(value) for value in phrases if semantic_key(value)}


def is_informative_fragment(value: Any, config: dict[str, Any]) -> bool:
    text = normalize_semantic_fragment(value)
    key = semantic_key(text)
    if not key or key in low_information_keys(config):
        return False
    normalized_words = " ".join(TOKEN_RE.findall(text.casefold()))
    if normalized_words and GENERIC_MEDIA_POINTER_RE.fullmatch(normalized_words):
        return False
    latin_tokens = {token for token in TOKEN_RE.findall(text.casefold()) if token not in STOPWORDS}
    has_cjk = any("\u3400" <= character <= "\u9fff" for character in text)
    if not has_cjk and len(latin_tokens) <= 1 and len(key) < 8:
        return False
    return True


def semantic_fragments(
    item: dict[str, Any], config: dict[str, Any], *, informative_only: bool = True
) -> list[str]:
    fragments = []
    seen = set()
    for field in ("title", "title_zh", "summary", "summary_zh"):
        fragment = normalize_semantic_fragment(item.get(field))
        if not fragment or (informative_only and not is_informative_fragment(fragment, config)):
            continue
        key = semantic_key(fragment)
        if not key or key in seen:
            continue
        seen.add(key)
        fragments.append(fragment)
    return fragments


def semantic_item_text(item: dict[str, Any], config: dict[str, Any], *, informative_only: bool = True) -> str:
    return " ".join(semantic_fragments(item, config, informative_only=informative_only)).casefold()


def source_type(item: dict[str, Any], dataset: str) -> str:
    if item.get("official"):
        return "official"
    return "fan" if dataset == "social" else "media"


def age_hours(item: dict[str, Any], now: datetime) -> float:
    published = parse_time(clean(item.get("published_at")))
    return max(0.0, (now - published).total_seconds() / 3600) if published else 10_000.0


def decay_factor(hours: float, config: dict[str, Any]) -> float:
    for row in config.get("decay") or []:
        if hours <= float(row["max_hours"]):
            return float(row["factor"])
    return 0.0


def engagement(item: dict[str, Any]) -> float:
    metrics = item.get("metrics") or {}
    return (
        float(metrics.get("likes") or 0)
        + 2 * float(metrics.get("retweets") or 0)
        + 2 * float(metrics.get("quotes") or 0)
        + 3 * float(metrics.get("replies") or 0)
        + 0.01 * float(metrics.get("views") or 0)
    )


def item_heat(item: dict[str, Any], dataset: str, now: datetime, config: dict[str, Any]) -> float:
    factor = decay_factor(age_hours(item, now), config)
    if dataset == "social":
        return math.log1p(max(0.0, engagement(item) * factor))
    return factor * (3.0 if item.get("official") else 1.0)


def token_set(value: str) -> set[str]:
    return {token for token in TOKEN_RE.findall(value.lower()) if token not in STOPWORDS and len(token) > 1}


def similarity(left: str, right: str) -> float:
    left_tokens, right_tokens = token_set(left), token_set(right)
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / len(left_tokens | right_tokens)


def matches_rule(text: str, rule: dict[str, Any]) -> bool:
    match_sets = rule.get("match_sets") or []
    if match_sets and not any(
        all(any(clean(term).lower() in text for term in group) for group in group_set)
        for group_set in match_sets
    ):
        return False
    groups = rule.get("match_all") or []
    if groups and not all(any(clean(term).lower() in text for term in group) for group in groups):
        return False
    alternatives = rule.get("match_any") or []
    if alternatives and not any(clean(term).lower() in text for term in alternatives):
        return False
    excluded = rule.get("exclude") or []
    return not any(clean(term).lower() in text for term in excluded)


def fragment_richness(value: str) -> tuple[int, int]:
    key = semantic_key(value)
    tokens = set(TOKEN_RE.findall(value.casefold()))
    return min(len(key), 120), min(len(tokens), 24)


def truncate_hot_word(value: str, limit: int) -> str:
    if len(value) <= limit:
        return value
    boundary = max(
        (value.rfind(mark, 0, limit + 1) for mark in ("。", "！", "？", "；", ".", "!", "?", ";")),
        default=-1,
    )
    if boundary >= limit // 2:
        return value[:boundary + 1].strip()
    return value[: limit - 1].rstrip("，。；：,.;: ") + "…"


def contains_cjk(value: str) -> bool:
    return any("\u3400" <= character <= "\u9fff" for character in value)


def best_semantic_fragment(
    item: dict[str, Any],
    fields: tuple[str, ...],
    config: dict[str, Any],
    *,
    prefer_cjk: bool | None = None,
) -> str:
    candidates = [
        normalize_semantic_fragment(item.get(field), strip_handles=False)
        for field in fields
        if is_informative_fragment(item.get(field), config)
    ]
    preferred = [candidate for candidate in candidates if contains_cjk(candidate) is prefer_cjk]
    if prefer_cjk is not None and preferred:
        candidates = preferred
    return max(candidates, key=fragment_richness) if candidates else ""


def objective_hot_word(item: dict[str, Any], config: dict[str, Any]) -> tuple[str | None, str | None]:
    zh = best_semantic_fragment(item, ("title_zh", "summary_zh"), config, prefer_cjk=True)
    en = best_semantic_fragment(item, ("title", "summary"), config, prefer_cjk=False)
    zh = truncate_hot_word(zh or en, 46) if zh or en else ""
    en = truncate_hot_word(en or zh, 110) if en or zh else ""
    return (zh or None), (en or None)


def select_title_record(records: list[dict[str, Any]], config: dict[str, Any]) -> dict[str, Any] | None:
    candidates = [record for record in records if semantic_fragments(record["item"], config)]
    if not candidates:
        return None
    source_priority = {"official": 3, "media": 2, "fan": 1}
    return max(
        candidates,
        key=lambda record: (
            max(fragment_richness(fragment) for fragment in semantic_fragments(record["item"], config)),
            source_priority.get(record["source_type"], 0),
            record["item_heat"],
        ),
    )


def event_id_for(rule_id: str | None, anchor: dict[str, Any]) -> str:
    if rule_id:
        return f"evt-{rule_id}"
    seed = clean(anchor.get("id") or anchor.get("url") or anchor.get("title"))
    digest = hashlib.sha1(seed.encode("utf-8")).hexdigest()[:12]
    published = clean(anchor.get("published_at"))[:10] or "undated"
    return f"evt-{published}-{digest}"


def allocate_unique_event_id(
    preferred_id: str | None,
    rule_id: str | None,
    anchor: dict[str, Any],
    member_ids: set[str],
    used_event_ids: set[str],
) -> str:
    base_id = event_id_for(rule_id, anchor)
    for candidate in (clean(preferred_id), base_id, event_id_for(None, anchor)):
        if candidate and candidate not in used_event_ids:
            return candidate
    fingerprint_seed = "|".join(sorted(member_ids)) or clean(anchor.get("id") or anchor.get("url") or anchor.get("title"))
    fingerprint = hashlib.sha1(fingerprint_seed.encode("utf-8")).hexdigest()[:8]
    candidate = f"{event_id_for(None, anchor)}-{fingerprint}"
    suffix = 2
    while candidate in used_event_ids:
        candidate = f"{event_id_for(None, anchor)}-{fingerprint}-{suffix}"
        suffix += 1
    return candidate


def previous_event_id(
    member_ids: set[str], title: str, previous: dict[str, Any], used_event_ids: set[str]
) -> str | None:
    best: tuple[float, str] | None = None
    for event in previous.get("events") or []:
        if clean(event.get("event_id")) in used_event_ids:
            continue
        old_ids = {clean(row.get("item_id")) for row in event.get("items") or []}
        overlap = len(member_ids & old_ids)
        score = float(overlap) + similarity(title, clean(event.get("hot_word_zh") or event.get("hot_word_en")))
        if score > 0 and (best is None or score > best[0]):
            best = (score, clean(event.get("event_id")))
    return best[1] if best and best[1] else None


def result_item_text(item: dict[str, Any]) -> str:
    return " ".join(
        clean(item.get(field))
        for field in ("title", "title_zh", "summary", "summary_zh", "article_search_text")
        if item.get(field)
    ).lower()


def normalize_position(value: str) -> int | None:
    token = clean(value).lower()
    if token in POSITION_WORDS:
        return POSITION_WORDS[token]
    match = re.search(r"(?:p|第)?(\d{1,2})", token)
    position = int(match.group(1)) if match else 0
    return position if 1 <= position <= 20 else None


def result_position(text: str) -> int | None:
    patterns = (
        rf"(?:oscar\s+)?piastri\s*\([^)]*?/\s*({POSITION_TOKEN})\s*\)",
        rf"(?:oscar\s+)?piastri.{{0,55}}?\b(?:finished|finishes|qualified|qualifies|ended|ends|came|was|is|slumps?\s+to|slipped.{{0,20}}?to).{{0,24}}?\b({POSITION_TOKEN})\b",
        rf"(?:oscar\s+)?piastri.{{0,80}}?\b({POSITION_TOKEN})[- ](?:place|placed|finish|finisher)\b",
        rf"\b({POSITION_TOKEN})[- ]place\s+finisher\s+(?:oscar\s+)?piastri\b",
        r"(?:oscar|皮亚斯特里).{0,55}?第\s*([1-9]|1\d|20)\s*名",
    )
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            position = normalize_position(match.group(1))
            if position:
                return position
    return None


def session_context_matches(text: str, race: dict[str, Any], session: str) -> bool:
    race_terms = [race.get("name"), race.get("name_zh"), race.get("country"), race.get("locality"), race.get("circuit_id")]
    has_race_context = any(clean(term).lower() in text for term in race_terms if clean(term))
    if session == "race":
        return has_race_context or bool(re.search(r"\b(?:grand prix|gp|race)\b|正赛|大奖赛", text))
    if session == "qualifying":
        return bool(re.search(r"\b(?:qualifying|qualified|qualifies|grid|q[123])\b|排位", text))
    if session == "sprint_qualifying":
        return bool(re.search(r"\b(?:sprint qualifying|sprint shootout)\b|冲刺排位", text))
    if session == "sprint":
        return bool(re.search(r"\bsprint\b|冲刺赛", text))
    practice_number = session[-1] if session.startswith("practice_") else ""
    return bool(re.search(rf"\b(?:fp{practice_number}|practice\s*{practice_number}|free practice\s*{practice_number})\b|[一二三]练", text))


def session_result_candidate(
    records: list[dict[str, Any]], calendar: dict[str, Any], refresh_reason: str, now: datetime
) -> tuple[dict[str, Any], dict[str, Any], str, int] | None:
    prefix = "session_completed:"
    if not refresh_reason.startswith(prefix):
        return None
    session_ref = refresh_reason[len(prefix):]
    race_id, separator, session = session_ref.rpartition(":")
    if not separator or session not in SESSION_LABELS:
        return None
    race = next((row for row in calendar.get("races") or [] if clean(row.get("id")) == race_id), None)
    if not race:
        return None
    started = parse_time((race.get("sessions") or {}).get(session) or (race.get("race_start") if session == "race" else None))
    if not started:
        return None
    candidates = sorted(
        (
            record for record in records
            if (published := parse_time(clean(record["item"].get("published_at"))))
            and started - timedelta(hours=1) <= published <= now
        ),
        key=lambda record: clean(record["item"].get("published_at")),
        reverse=True,
    )
    for record in candidates:
        text = result_item_text(record["item"])
        position = result_position(text)
        if position and session_context_matches(text, race, session):
            return record, race, session, position
    return None


def apply_session_result_hard_rule(
    events: list[dict[str, Any]], records: list[dict[str, Any]], calendar: dict[str, Any], refresh_reason: str, now: datetime
) -> None:
    result = session_result_candidate(records, calendar, refresh_reason, now)
    if not result:
        return
    record, race, session, position = result
    item_id = clean(record["item"].get("id"))
    event = next((row for row in events if any(item.get("item_id") == item_id for item in row.get("items") or [])), None)
    if not event:
        return
    session_zh, session_en = SESSION_LABELS[session]
    race_zh = clean(race.get("name_zh") or race.get("name") or "最近一站").replace("大奖赛", "站")
    race_en = clean(race.get("name") or "the latest Grand Prix")
    event["hot_word_zh"] = f"Oscar 在{race_zh}{session_zh}获得第{position}名"
    if session == "race":
        event["hot_word_en"] = f"Oscar finishes P{position} in the {race_en}"
    elif session == "qualifying":
        event["hot_word_en"] = f"Oscar qualifies P{position} for the {race_en}"
    else:
        event["hot_word_en"] = f"Oscar finishes P{position} in {race_en} {session_en}"
    event["pinned_rank"] = 1
    event["hard_rule"] = {
        "type": "session_result",
        "race_id": clean(race.get("id")),
        "session": session,
        "position": position,
        "source_item_id": item_id,
    }


def structured_session_result_event(
    session_results: dict[str, Any],
    calendar: dict[str, Any],
    refresh_reason: str,
    now: datetime,
    max_age_hours: int = 24,
) -> dict[str, Any] | None:
    result = session_results.get("latest") or {}
    latest_ref = clean(result.get("session_ref"))
    if not latest_ref:
        return None
    attempted_ref = clean(session_results.get("attempted_session_ref"))
    completed_prefix = "session_completed:"
    completed_ref = refresh_reason[len(completed_prefix):] if refresh_reason.startswith(completed_prefix) else ""
    if (attempted_ref and attempted_ref != latest_ref) or (completed_ref and completed_ref != latest_ref):
        return None

    race_id = clean(result.get("race_id"))
    race = next((row for row in calendar.get("races") or [] if clean(row.get("id")) == race_id), {})
    session = clean(result.get("session"))
    if session not in SESSION_LABELS:
        return None
    ranked_at = parse_time(clean(result.get("first_ranked_at") or result.get("fetched_at")))
    result_time = parse_time(clean(result.get("session_end")))
    if not result_time:
        session_start = parse_time(clean(result.get("session_start")))
        if session_start:
            result_time = session_start + timedelta(minutes=SESSION_DURATIONS.get(session, 60))
    if not result_time:
        result_time = ranked_at
    if not ranked_at:
        ranked_at = result_time
    if not result_time or not ranked_at or ranked_at > now + timedelta(hours=2):
        return None
    if now - ranked_at >= timedelta(hours=max(1, max_age_hours)):
        return None
    session_zh, session_en = SESSION_LABELS[session]
    race_zh = clean(result.get("race_name_zh") or race.get("name_zh") or result.get("race_name") or "最近一站")
    race_zh = race_zh.replace("大奖赛", "站")
    race_en = clean(result.get("race_name") or race.get("name") or "the latest Grand Prix")
    status = clean(result.get("status")) or "classified"
    position = result.get("position")
    provisional = result.get("provisional") is True
    if status == "DSQ":
        hot_word_zh = f"Oscar 在{race_zh}{session_zh}被取消成绩（DSQ）"
        hot_word_en = f"Oscar is disqualified from {race_en} {session_en}"
    elif status == "DNS":
        hot_word_zh = f"Oscar 未能参加{race_zh}{session_zh}（DNS）"
        hot_word_en = f"Oscar does not start {race_en} {session_en}"
    elif status == "DNF":
        hot_word_zh = f"Oscar 在{race_zh}{session_zh}未能完赛（DNF）"
        hot_word_en = f"Oscar does not finish {race_en} {session_en}"
    elif isinstance(position, int) and 1 <= position <= 99:
        hot_word_zh = f"Oscar 在{race_zh}{session_zh}获得第{position}名"
        if session == "race":
            hot_word_en = f"Oscar finishes P{position} in the {race_en}"
        elif session == "qualifying":
            hot_word_en = f"Oscar qualifies P{position} for the {race_en}"
        else:
            hot_word_en = f"Oscar finishes P{position} in {race_en} {session_en}"
    else:
        return None
    if provisional:
        hot_word_zh = f"{hot_word_zh}（暂定）"
        hot_word_en = f"Provisional: {hot_word_en}"

    source_url = clean(result.get("source_url"))
    published_at = isoformat(ranked_at)
    item_id = f"session-result-{race_id or 'race'}-{session}"
    hard_rule = {
        "type": "session_result",
        "race_id": race_id,
        "session": session,
        "position": position,
        "status": status,
        "provisional": provisional,
        "source_item_id": item_id,
        "source": clean(result.get("source")) or "OpenF1",
    }
    return {
        "event_id": f"evt-session-result-{race_id or 'race'}-{session}",
        "rule_id": None,
        "hot_word_zh": hot_word_zh,
        "hot_word_en": hot_word_en,
        "first_seen_at": published_at,
        "last_seen_at": published_at,
        "anchor_item_id": item_id,
        "image_url": None,
        "video_url": None,
        "video_poster_url": None,
        "review_needed": False,
        "review_needed_reason": None,
        "official_heat": 0,
        "media_heat": 100,
        "fan_heat": 0,
        "heat": 100,
        "source_labels": [SOURCE_LABELS["media"]],
        "source_counts": {"official": 0, "media": 1, "fan": 0},
        "pinned_rank": 1,
        "hidden": False,
        "hard_rule": hard_rule,
        "items": [{
            "item_id": item_id,
            "dataset": "session_result",
            "source_type": "media",
            "source": clean(result.get("source")) or "OpenF1",
            "title": hot_word_en,
            "title_zh": hot_word_zh,
            "summary": "Provisional structured session result for Oscar Piastri." if provisional else "Structured session result for Oscar Piastri.",
            "summary_zh": "Oscar Piastri 的暂定结构化场次成绩。" if provisional else "Oscar Piastri 的结构化场次成绩。",
            "url": source_url,
            "published_at": published_at,
            "image_url": None,
            "video_url": None,
            "video_poster_url": None,
            "heat_contribution": 100,
            "metrics": {},
        }],
    }


def media_fields(item: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    image = clean(item.get("image_url") or item.get("thumbnail_url") or item.get("og_image")) or None
    video = clean(item.get("video_url")) or None
    poster = clean(item.get("video_poster_url") or item.get("poster_url") or image) or None
    return image, video, poster


def requires_media_review(record: dict[str, Any], config: dict[str, Any]) -> bool:
    text = item_text(record["item"])
    phrases = [clean(value).lower() for value in config.get("media_review_phrases") or [] if clean(value)]
    if not any(phrase in text for phrase in phrases):
        return False
    image, video, poster = media_fields(record["item"])
    return not any((image, video, poster))


def cluster_media_review_reason(records: list[dict[str, Any]], config: dict[str, Any]) -> str | None:
    if not any(requires_media_review(record, config) for record in records):
        return None
    if any(any(media_fields(record["item"])) for record in records):
        return None
    return "media_evidence_missing"


def fallback_cluster_match(left: str, right: str, config: dict[str, Any]) -> bool:
    left_tokens, right_tokens = token_set(left), token_set(right)
    if not left_tokens or not right_tokens:
        return False
    overlap = len(left_tokens & right_tokens)
    union = len(left_tokens | right_tokens)
    jaccard = overlap / union if union else 0.0
    containment = overlap / min(len(left_tokens), len(right_tokens))
    return (
        jaccard >= float(config.get("fallback_similarity") or 0.42)
        or (
            overlap >= int(config.get("fallback_min_shared_tokens") or 2)
            and containment >= float(config.get("fallback_containment") or 0.6)
        )
    )


def cluster_items(records: list[dict[str, Any]], config: dict[str, Any]) -> list[dict[str, Any]]:
    rules = config.get("topic_rules") or []
    clusters: list[dict[str, Any]] = []
    by_rule: dict[str, dict[str, Any]] = {}
    unmatched: list[dict[str, Any]] = []
    for record in records:
        text = semantic_item_text(record["item"], config, informative_only=False)
        rule = next((candidate for candidate in rules if matches_rule(text, candidate)), None)
        if rule:
            cluster = by_rule.get(rule["id"])
            if cluster is None:
                cluster = {"rule": rule, "records": []}
                by_rule[rule["id"]] = cluster
                clusters.append(cluster)
            cluster["records"].append(record)
        elif not semantic_item_text(record["item"], config):
            clusters.append({
                "rule": None,
                "records": [record],
                "review_reason": "insufficient_semantic_text",
            })
        else:
            unmatched.append(record)

    for record in unmatched:
        text = semantic_item_text(record["item"], config)
        for cluster in clusters:
            anchor_text = semantic_item_text(cluster["records"][0]["item"], config)
            if (
                not cluster.get("rule")
                and not cluster.get("review_reason")
                and fallback_cluster_match(text, anchor_text, config)
            ):
                cluster["records"].append(record)
                break
        else:
            clusters.append({"rule": None, "records": [record]})
    return clusters


def component_raw(records: list[dict[str, Any]], source: str, max_per_source: int) -> float:
    selected = [record for record in records if record["source_type"] == source and record["item_heat"] > 0]
    selected.sort(key=lambda record: record["item_heat"], reverse=True)
    source_counts: dict[str, int] = defaultdict(int)
    capped = []
    for record in selected:
        name = clean(record["item"].get("source") or "Unknown")
        if source_counts[name] >= max_per_source:
            continue
        source_counts[name] += 1
        capped.append(record)
    if not capped:
        return 0.0
    lead = capped[0]["item_heat"]
    related = sum(record["item_heat"] for record in capped[1:])
    diversity = math.log1p(len(source_counts)) * 4
    return 0.6 * lead + 0.25 * related + 0.15 * diversity


def apply_override(event: dict[str, Any], override: dict[str, Any]) -> dict[str, Any]:
    updated = dict(event)
    for field in (
        "hot_word_zh", "hot_word_en", "image_url", "video_url", "pinned_rank", "hidden", "source_labels",
    ):
        if field in override and override[field] is not None:
            updated[field] = override[field]
    if override.get("heat") is not None:
        updated["heat"] = max(0, min(100, int(override["heat"])))
    if isinstance(override.get("content_items"), list):
        updated["items"] = [dict(item) for item in override["content_items"]]
        updated["image_url"] = next(
            (clean(item.get("image_url") or item.get("video_poster_url")) for item in updated["items"] if clean(item.get("image_url") or item.get("video_poster_url"))),
            None,
        )
        updated["video_url"] = next(
            (clean(item.get("video_url")) for item in updated["items"] if clean(item.get("video_url"))),
            None,
        )
        updated["source_counts"] = {
            source: len({clean(item.get("source")) for item in updated["items"] if item.get("source_type") == source})
            for source in SOURCE_LABELS
        }
    updated["override"] = {
        "updated_at": override.get("updated_at"),
        "updated_by": override.get("updated_by"),
        "reason": override.get("reason"),
    }
    return updated


def rank_events(events: list[dict[str, Any]], maximum_events: int) -> list[dict[str, Any]]:
    """Place the latest session result first, then editorial and heat-ranked events."""
    slots: list[dict[str, Any] | None] = [None] * maximum_events
    remaining = list(events)
    placed_ids: set[str] = set()

    def editorial_recency(event: dict[str, Any]) -> float:
        updated = parse_time((event.get("override") or {}).get("updated_at"))
        return updated.timestamp() if updated else 0.0

    hard_rules = sorted(
        (event for event in remaining if (event.get("hard_rule") or {}).get("type") == "session_result"),
        key=lambda event: (-event["heat"], event["event_id"]),
    )
    if hard_rules and slots:
        slots[0] = hard_rules[0]
        placed_ids.add(hard_rules[0]["event_id"])

    pinned = sorted(
        (
            event for event in remaining
            if event.get("pinned_rank") and (event.get("hard_rule") or {}).get("type") != "session_result"
        ),
        key=lambda event: (
            int(event["pinned_rank"]),
            -editorial_recency(event),
            -event["heat"],
            event["event_id"],
        ),
    )
    for event in pinned:
        slot = int(event["pinned_rank"]) - 1
        if 0 <= slot < maximum_events and slots[slot] is None:
            slots[slot] = event
            placed_ids.add(event["event_id"])

    remaining = [event for event in remaining if event["event_id"] not in placed_ids]
    remaining = sorted(
        (event for event in remaining if event["event_id"] not in placed_ids),
        key=lambda event: (-event["heat"], event["event_id"]),
    )
    for event in remaining:
        free_slot = next((index for index, value in enumerate(slots) if value is None), None)
        if free_slot is None:
            break
        slots[free_slot] = event

    ranked = [event for event in slots if event is not None]
    for index, event in enumerate(ranked, start=1):
        event["rank"] = index
    return ranked


def normalized_source_account(value: Any) -> str:
    return clean(value).casefold().lstrip("@")


def fan_only_source_account(event: dict[str, Any]) -> str | None:
    items = event.get("items") or []
    if not items or any(item.get("source_type") != "fan" for item in items):
        return None
    sources = {normalized_source_account(item.get("source")) for item in items}
    sources.discard("")
    return next(iter(sources)) if len(sources) == 1 else None


def rank_public_events(
    events: list[dict[str, Any]], maximum_events: int, max_fan_events_per_account: int
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    ordered = rank_events(events, max(maximum_events, len(events)))
    public = []
    suppressed = []
    source_counts: dict[str, int] = defaultdict(int)
    for event in ordered:
        if len(public) >= maximum_events:
            break
        hard_result = (event.get("hard_rule") or {}).get("type") == "session_result"
        account = fan_only_source_account(event)
        if event.get("override") or hard_result or not account or max_fan_events_per_account <= 0:
            public.append(event)
            continue
        if source_counts[account] >= max_fan_events_per_account:
            held = dict(event)
            held.pop("rank", None)
            held["review_needed"] = True
            held["review_needed_reason"] = "fan_account_public_cap"
            held["review_needed_context"] = {
                "source_account": f"@{account}",
                "limit": max_fan_events_per_account,
            }
            suppressed.append(held)
            continue
        source_counts[account] += 1
        public.append(event)
    return rank_events(public, maximum_events), suppressed


def validate_unique_event_ids(*groups: list[dict[str, Any]]) -> None:
    identifiers = [clean(event.get("event_id")) for group in groups for event in group]
    duplicates = sorted({event_id for event_id in identifiers if event_id and identifiers.count(event_id) > 1})
    if duplicates:
        raise ValueError(f"duplicate_event_id:{','.join(duplicates)}")


def build(args: argparse.Namespace) -> dict[str, Any]:
    now = now_time(args.now)
    config = read_json(Path(args.config), {})
    items_payload = read_json(Path(args.items), {"items": []})
    social_payload = read_json(Path(args.social), {"items": []})
    calendar = read_json(Path(getattr(args, "calendar", ROOT / "data/calendar.json")), {"races": []})
    session_results = read_json(
        Path(getattr(args, "session_results", ROOT / "data/session-results.json")),
        {"result_available": False, "latest": None},
    )
    previous = read_json(Path(args.previous), {"events": []})
    overrides_payload = read_json(Path(args.overrides), {"changes": []})
    cutoff = now - timedelta(days=int(config.get("display_window_days") or 7))
    records = []
    for dataset, payload in (("items", items_payload), ("social", social_payload)):
        for item in payload.get("items") or []:
            published = parse_time(clean(item.get("published_at")))
            if not published or published < cutoff or published > now + timedelta(hours=2):
                continue
            records.append({
                "dataset": dataset,
                "item": item,
                "source_type": source_type(item, dataset),
                "item_heat": item_heat(item, dataset, now, config),
            })

    clusters = cluster_items(records, config)
    draft_events = []
    used_event_ids: set[str] = set()
    for cluster in clusters:
        ranked = sorted(cluster["records"], key=lambda record: record["item_heat"], reverse=True)
        heat_anchor = ranked[0]["item"]
        title_record = select_title_record(ranked, config)
        anchor = title_record["item"] if title_record else heat_anchor
        rule = cluster.get("rule")
        hot_word_zh, hot_word_en = objective_hot_word(anchor, config)
        if rule:
            hot_word_zh = clean(rule.get("hot_word_zh")) or hot_word_zh or "待补充事件标题"
            hot_word_en = clean(rule.get("hot_word_en")) or hot_word_en or "Event title needs review"
        else:
            hot_word_zh = hot_word_zh or "待补充事件标题"
            hot_word_en = hot_word_en or "Event title needs review"
        member_ids = {clean(record["item"].get("id")) for record in ranked if record["item"].get("id")}
        old_id = previous_event_id(member_ids, hot_word_zh, previous, used_event_ids)
        rule_id = clean(rule.get("id")) if rule else None
        event_id = allocate_unique_event_id(old_id, rule_id, anchor, member_ids, used_event_ids)
        used_event_ids.add(event_id)
        image_url = video_url = video_poster_url = None
        for record in ranked:
            image, video, poster = media_fields(record["item"])
            image_url = image_url or image
            video_url = video_url or video
            video_poster_url = video_poster_url or poster
        component = {
            source: component_raw(ranked, source, int(config.get("max_items_per_source") or 3))
            for source in SOURCE_LABELS
        }
        review_reason = cluster.get("review_reason")
        if not review_reason and not rule and title_record is None:
            review_reason = "insufficient_semantic_text"
        review_reason = review_reason or cluster_media_review_reason(ranked, config)
        draft_events.append({
            "event_id": event_id,
            "rule_id": rule_id,
            "hot_word_zh": hot_word_zh,
            "hot_word_en": hot_word_en,
            "first_seen_at": min(clean(record["item"].get("published_at")) for record in ranked),
            "last_seen_at": max(clean(record["item"].get("published_at")) for record in ranked),
            "anchor_item_id": clean(anchor.get("id")),
            "image_url": image_url,
            "video_url": video_url,
            "video_poster_url": video_poster_url,
            "review_needed": bool(review_reason),
            "review_needed_reason": review_reason,
            "component_raw": component,
            "items": [
                {
                    "item_id": clean(record["item"].get("id")),
                    "dataset": record["dataset"],
                    "source_type": record["source_type"],
                    "source": clean(record["item"].get("source")),
                    "title": clean(record["item"].get("title")),
                    "title_zh": clean(record["item"].get("title_zh")),
                    "summary": clean(record["item"].get("summary")),
                    "summary_zh": clean(record["item"].get("summary_zh")),
                    "url": clean(record["item"].get("url")),
                    "published_at": clean(record["item"].get("published_at")),
                    "image_url": media_fields(record["item"])[0],
                    "video_url": media_fields(record["item"])[1],
                    "video_poster_url": media_fields(record["item"])[2],
                    "heat_contribution": round(record["item_heat"], 4),
                    "metrics": record["item"].get("metrics") or {},
                }
                for record in ranked
            ],
        })

    component_scale = config.get("component_scale") or {"official": 10, "media": 15, "fan": 8}
    events = []
    review_needed_events = []
    active_overrides = {
        clean(change.get("event_id")): change
        for change in overrides_payload.get("changes") or []
        if change.get("status") == "active" and change.get("event_id")
    }
    for event in draft_events:
        component_heat = {
            source: min(100, round(event["component_raw"][source] * float(component_scale.get(source) or 1)))
            for source in SOURCE_LABELS
        }
        ranked_heats = sorted(component_heat.values(), reverse=True)
        total_heat = min(100, round(ranked_heats[0] + 0.25 * ranked_heats[1] + 0.1 * ranked_heats[2]))
        event.pop("component_raw", None)
        event.update({
            "official_heat": component_heat["official"],
            "media_heat": component_heat["media"],
            "fan_heat": component_heat["fan"],
            "heat": total_heat,
            "source_labels": [SOURCE_LABELS[source] for source in SOURCE_LABELS if component_heat[source] > 0],
            "source_counts": {
                source: len({row["source"] for row in event["items"] if row["source_type"] == source})
                for source in SOURCE_LABELS
            },
            "pinned_rank": None,
            "hidden": False,
        })
        if event["event_id"] in active_overrides:
            event = apply_override(event, active_overrides[event["event_id"]])
        if event.get("review_needed") and event["event_id"] not in active_overrides:
            review_needed_events.append(event)
            continue
        if not event.get("hidden") and event["heat"] >= int(config.get("minimum_heat") or 0):
            events.append(event)

    known_event_ids = {event["event_id"] for event in draft_events}
    for event_id, override in active_overrides.items():
        if event_id in known_event_ids or not override.get("manual_event"):
            continue
        manual_event = apply_override({
            "event_id": event_id,
            "rule_id": None,
            "hot_word_zh": clean(override.get("hot_word_zh")) or "人工热点事件",
            "hot_word_en": clean(override.get("hot_word_en")) or "Manual hot event",
            "first_seen_at": override.get("updated_at") or isoformat(now),
            "last_seen_at": override.get("updated_at") or isoformat(now),
            "anchor_item_id": None,
            "image_url": None,
            "video_url": None,
            "video_poster_url": None,
            "official_heat": 0,
            "media_heat": 0,
            "fan_heat": 0,
            "heat": 0,
            "source_labels": [],
            "source_counts": {"official": 0, "media": 0, "fan": 0},
            "pinned_rank": None,
            "hidden": False,
            "items": [],
            "review_needed": False,
            "review_needed_reason": None,
        }, override)
        if not manual_event.get("hidden") and manual_event["heat"] >= int(config.get("minimum_heat") or 0):
            events.append(manual_event)

    refresh_reason = clean(getattr(args, "refresh_reason", ""))
    structured_result = structured_session_result_event(
        session_results,
        calendar,
        refresh_reason,
        now,
        int(config.get("session_result_max_age_hours") or 24),
    )
    if structured_result:
        events = [event for event in events if event["event_id"] != structured_result["event_id"]]
        events.append(structured_result)
    else:
        apply_session_result_hard_rule(events, records, calendar, refresh_reason, now)
    events, source_suppressed = rank_public_events(
        events,
        int(config.get("maximum_events") or 15),
        int(config.get("max_public_fan_only_events_per_account") or 0),
    )
    review_needed_events.extend(source_suppressed)
    validate_unique_event_ids(events, review_needed_events)

    return {
        "schema_version": 1,
        "generated_at": isoformat(now),
        "window_days": int(config.get("display_window_days") or 7),
        "active_heat_hours": int(config.get("active_heat_hours") or 72),
        "max_public_fan_only_events_per_account": int(
            config.get("max_public_fan_only_events_per_account") or 0
        ),
        "formula": "max(source_heat) + 0.25*second + 0.10*third; capped at 100",
        "event_count": len(events),
        "events": events,
        "review_needed_count": len(review_needed_events),
        "review_needed_events": review_needed_events,
    }


def main() -> int:
    args = parse_args()
    payload = build(args)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Built {payload['event_count']} hot events into {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
