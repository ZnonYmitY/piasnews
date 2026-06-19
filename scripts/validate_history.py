#!/usr/bin/env python3
"""Validate approved history events and the human-review candidate queue."""

from __future__ import annotations

import argparse
import json
import re
from datetime import date
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


SCORE_FIELDS = (
    "historical_value",
    "peak_attention",
    "lasting_significance",
    "career_impact",
    "fan_recognition",
)
REVIEW_STATES = {"pending", "approved", "rejected"}
VERIFICATION_STATES = {"needs_review", "verified", "verified_by_reviewer"}
EVENT_ID_RE = re.compile(r"^piastri-[a-z0-9-]{8,150}$")


def fail(message: str) -> None:
    raise ValueError(message)


def validate_score(event_id: str, field: str, value: Any, required: bool) -> None:
    if value is None and not required:
        return
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 100:
        fail(f"{event_id}: selection.{field} must be an integer from 0 to 100")


def validate_event(event: dict[str, Any], seen_ids: set[str], *, approved_library: bool) -> None:
    event_id = event.get("id")
    if not isinstance(event_id, str) or not EVENT_ID_RE.fullmatch(event_id) or event_id in seen_ids:
        fail(f"missing or duplicate event id: {event_id!r}")
    seen_ids.add(event_id)

    parsed_date = date.fromisoformat(event["date"])
    if event.get("year") != parsed_date.year:
        fail(f"{event_id}: year does not match date")
    if event.get("month_day") != parsed_date.strftime("%m-%d"):
        fail(f"{event_id}: month_day does not match date")

    source_url = event.get("url", "")
    if urlparse(source_url).scheme not in {"http", "https"}:
        fail(f"{event_id}: url must be HTTP(S)")

    verification_status = event.get("verification", {}).get("status")
    if verification_status not in VERIFICATION_STATES:
        fail(f"{event_id}: invalid verification status {verification_status!r}")
    if approved_library and verification_status == "needs_review":
        fail(f"{event_id}: approved history cannot use needs_review verification")

    selection = event.get("selection", {})
    review_status = selection.get("review_status")
    if review_status not in REVIEW_STATES:
        fail(f"{event_id}: invalid review_status {review_status!r}")
    if approved_library and review_status != "approved":
        fail(f"{event_id}: history.json may contain approved events only")

    scores_required = review_status == "approved"
    for field in SCORE_FIELDS:
        validate_score(event_id, field, selection.get(field), scores_required)

    if review_status == "approved" and selection.get("include") is not True:
        fail(f"{event_id}: approved events require selection.include=true")
    if review_status == "rejected" and selection.get("include") is not False:
        fail(f"{event_id}: rejected events require selection.include=false")
    if review_status == "pending" and selection.get("include") is not None:
        fail(f"{event_id}: pending events require selection.include=null")

    semantic = event.get("semantic", {})
    if not semantic.get("embedding_text"):
        fail(f"{event_id}: semantic.embedding_text is required")
    if not semantic.get("strong_keys"):
        fail(f"{event_id}: semantic.strong_keys must not be empty")


def validate_history(payload: dict[str, Any]) -> set[str]:
    if payload.get("schema_version") != 2:
        fail("history schema_version must be 2")
    events = payload.get("events")
    if not isinstance(events, list):
        fail("history events must be a list")

    seen_ids: set[str] = set()
    for event in events:
        validate_event(event, seen_ids, approved_library=True)
    return seen_ids


def validate_candidates(payload: dict[str, Any], history_ids: set[str]) -> dict[str, int]:
    if payload.get("schema_version") != 1:
        fail("history candidates schema_version must be 1")
    candidates = payload.get("candidates")
    if not isinstance(candidates, list):
        fail("history candidates must be a list")

    seen_ids: set[str] = set()
    counts = {state: 0 for state in REVIEW_STATES}
    for candidate in candidates:
        validate_event(candidate, seen_ids, approved_library=False)
        candidate_id = candidate["id"]
        candidate_meta = candidate.get("candidate", {})
        status = candidate_meta.get("status")
        if status not in REVIEW_STATES:
            fail(f"{candidate_id}: invalid candidate.status {status!r}")
        if candidate["selection"]["review_status"] != status:
            fail(f"{candidate_id}: candidate and selection review states differ")
        if status == "approved" and candidate_id not in history_ids:
            fail(f"{candidate_id}: approved candidate is missing from history.json")
        if status != "approved" and candidate_id in history_ids:
            fail(f"{candidate_id}: non-approved candidate exists in history.json")
        counts[status] += 1
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate the Piasnews history workflow data.")
    parser.add_argument("--history", default="data/history.json")
    parser.add_argument("--candidates", default="data/history-candidates.json")
    args = parser.parse_args()

    history_payload = json.loads(Path(args.history).read_text(encoding="utf-8"))
    candidates_payload = json.loads(Path(args.candidates).read_text(encoding="utf-8"))
    history_ids = validate_history(history_payload)
    counts = validate_candidates(candidates_payload, history_ids)
    print(
        f"Validated {len(history_ids)} approved history events and "
        f"{sum(counts.values())} candidates: {counts['pending']} pending, "
        f"{counts['approved']} approved, {counts['rejected']} rejected."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
