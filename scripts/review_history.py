#!/usr/bin/env python3
"""Apply an authenticated review decision to Piasnews history data."""

from __future__ import annotations

import argparse
import base64
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SCORE_FIELDS = (
    "historical_value",
    "peak_attention",
    "lasting_significance",
    "career_impact",
    "fan_recognition",
)
EDITABLE_TEXT_FIELDS = ("title", "date", "summary", "type", "source", "url")


def utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Approve or reject a Piasnews history candidate.")
    parser.add_argument("--candidate-id", required=True)
    parser.add_argument("--decision", choices=("approve", "reject"), required=True)
    parser.add_argument("--payload-b64", required=True)
    parser.add_argument("--reviewer", required=True)
    parser.add_argument("--history", default="data/history.json")
    parser.add_argument("--candidates", default="data/history-candidates.json")
    return parser.parse_args()


def decode_payload(value: str) -> dict[str, Any]:
    padding = "=" * (-len(value) % 4)
    raw = base64.urlsafe_b64decode(value + padding)
    payload = json.loads(raw.decode("utf-8"))
    if not isinstance(payload, dict):
        raise ValueError("review payload must be an object")
    return payload


def clean_text(value: Any, field: str, limit: int = 1200) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty string")
    return value.strip()[:limit]


def clean_list(value: Any, field: str, limit: int = 20) -> list[str]:
    if not isinstance(value, list):
        raise ValueError(f"{field} must be a list")
    cleaned = []
    for entry in value[:limit]:
        text = clean_text(entry, field, 120)
        if text not in cleaned:
            cleaned.append(text)
    return cleaned


def clean_score(value: Any, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= 100:
        raise ValueError(f"{field} must be an integer from 0 to 100")
    return value


def apply_edits(candidate: dict[str, Any], payload: dict[str, Any]) -> None:
    for field in EDITABLE_TEXT_FIELDS:
        candidate[field] = clean_text(payload.get(field, candidate.get(field)), field)

    event_date = datetime.fromisoformat(candidate["date"]).date()
    candidate["year"] = event_date.year
    candidate["month_day"] = event_date.strftime("%m-%d")

    scores = payload.get("scores", {})
    if not isinstance(scores, dict):
        raise ValueError("scores must be an object")
    for field in SCORE_FIELDS:
        candidate["selection"][field] = clean_score(scores.get(field), field)

    candidate["selection"]["inclusion_reason"] = clean_text(
        payload.get("inclusion_reason", candidate["selection"].get("inclusion_reason")),
        "inclusion_reason",
    )
    candidate["semantic"]["themes"] = clean_list(payload.get("themes", []), "themes")
    candidate["semantic"]["strong_keys"] = clean_list(payload.get("strong_keys", []), "strong_keys")
    if not candidate["semantic"]["strong_keys"]:
        raise ValueError("strong_keys must contain at least one precise key")
    candidate["semantic"]["embedding_text"] = clean_text(
        payload.get("embedding_text", candidate["semantic"].get("embedding_text")),
        "embedding_text",
    )
    candidate["tags"] = clean_list(payload.get("tags", candidate.get("tags", [])), "tags")


def approved_event(candidate: dict[str, Any], reviewer: str, reviewed_at: str) -> dict[str, Any]:
    event = {key: value for key, value in candidate.items() if key != "candidate"}
    event["verification"] = {
        **event.get("verification", {}),
        "status": "verified_by_reviewer",
        "reviewed_by": reviewer,
        "reviewed_at": reviewed_at,
    }
    event["selection"] = {
        **event["selection"],
        "review_status": "approved",
        "include": True,
        "reviewed_by": reviewer,
        "reviewed_at": reviewed_at,
    }
    return event


def main() -> int:
    args = parse_args()
    payload = decode_payload(args.payload_b64)
    history_path = Path(args.history)
    candidates_path = Path(args.candidates)
    history_payload = json.loads(history_path.read_text(encoding="utf-8"))
    candidates_payload = json.loads(candidates_path.read_text(encoding="utf-8"))

    candidate = next(
        (item for item in candidates_payload.get("candidates", []) if item.get("id") == args.candidate_id),
        None,
    )
    if candidate is None:
        raise ValueError(f"candidate not found: {args.candidate_id}")
    if candidate.get("candidate", {}).get("status") != "pending":
        raise ValueError(f"candidate is already reviewed: {args.candidate_id}")

    reviewed_at = utc_iso()
    decision_reason = payload.get("decision_reason")
    if decision_reason is not None:
        decision_reason = clean_text(decision_reason, "decision_reason")

    if args.decision == "approve":
        apply_edits(candidate, payload)
        event = approved_event(candidate, args.reviewer, reviewed_at)
        history_events = history_payload.setdefault("events", [])
        history_events[:] = [existing for existing in history_events if existing.get("id") != event["id"]]
        history_events.append(event)
        history_events.sort(key=lambda item: item["date"])
        candidate["selection"] = event["selection"]
        candidate["verification"] = event["verification"]
        candidate["candidate"]["status"] = "approved"
    else:
        candidate["selection"]["review_status"] = "rejected"
        candidate["selection"]["include"] = False
        candidate["candidate"]["status"] = "rejected"

    candidate["candidate"]["reviewed_at"] = reviewed_at
    candidate["candidate"]["reviewed_by"] = args.reviewer
    candidate["candidate"]["decision_reason"] = decision_reason
    history_payload["generated_at"] = reviewed_at
    candidates_payload["generated_at"] = reviewed_at

    history_path.write_text(json.dumps(history_payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    candidates_path.write_text(json.dumps(candidates_payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    past_tense = "approved" if args.decision == "approve" else "rejected"
    print(f"{past_tense} {args.candidate_id} as {args.reviewer}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
