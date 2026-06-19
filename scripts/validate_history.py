#!/usr/bin/env python3

import argparse
import json
from datetime import date
from pathlib import Path
from urllib.parse import urlparse


SCORE_FIELDS = (
    "historical_value",
    "peak_attention",
    "lasting_significance",
    "career_impact",
    "fan_recognition",
)
REVIEW_STATES = {"pending", "approved", "rejected"}


def fail(message):
    raise ValueError(message)


def validate_score(event_id, field, value):
    if value is not None and (not isinstance(value, int) or not 0 <= value <= 100):
        fail(f"{event_id}: selection.{field} must be null or an integer from 0 to 100")


def validate_event(event, seen_ids):
    event_id = event.get("id")
    if not event_id or event_id in seen_ids:
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

    verification = event.get("verification", {})
    if verification.get("status") != "verified":
        fail(f"{event_id}: only verified factual candidates may enter the knowledge base")

    selection = event.get("selection", {})
    review_status = selection.get("review_status")
    if review_status not in REVIEW_STATES:
        fail(f"{event_id}: invalid review_status {review_status!r}")
    for field in SCORE_FIELDS:
        validate_score(event_id, field, selection.get(field))
    if review_status == "approved":
        if not isinstance(selection.get("include"), bool):
            fail(f"{event_id}: approved events require a boolean selection.include")
        if selection.get("historical_value") is None:
            fail(f"{event_id}: approved events require selection.historical_value")

    semantic = event.get("semantic", {})
    if not semantic.get("embedding_text"):
        fail(f"{event_id}: semantic.embedding_text is required")
    if not semantic.get("strong_keys"):
        fail(f"{event_id}: semantic.strong_keys must not be empty")


def main():
    parser = argparse.ArgumentParser(description="Validate the Piasnews history knowledge base.")
    parser.add_argument("path", nargs="?", default="data/history.json")
    args = parser.parse_args()

    path = Path(args.path)
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("schema_version") != 2:
        fail("history schema_version must be 2")

    events = payload.get("events")
    if not isinstance(events, list) or not events:
        fail("history events must be a non-empty list")

    seen_ids = set()
    for event in events:
        validate_event(event, seen_ids)

    pending = sum(event["selection"]["review_status"] == "pending" for event in events)
    approved = sum(event["selection"]["review_status"] == "approved" for event in events)
    print(f"Validated {len(events)} history events: {approved} approved, {pending} pending.")


if __name__ == "__main__":
    main()
