#!/usr/bin/env python3
"""Validate the static assets in the Piastri fan-companion package."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REFS = ROOT / "references"


def load(relative: str):
    path = ROOT / relative
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def index(items, label: str):
    ids = [item["id"] for item in items]
    assert len(ids) == len(set(ids)), f"duplicate {label} id"
    return {item["id"]: item for item in items}


def main() -> None:
    manifest = load("manifest.json")
    evidence = load("references/evidence.json")["items"]
    rules = load("references/judgment-rules.json")["rules"]
    cards = load("references/style-cards.json")["cards"]
    fallback_doc = load("references/fallbacks.json")
    fallbacks = fallback_doc["items"]
    corrections = load("references/correction-log.json")["entries"]
    evals = load("evals/evals.json")["evals"]

    evidence_by_id = index(evidence, "evidence")
    rules_by_id = index(rules, "judgment rule")
    cards_by_id = index(cards, "style card")
    fallbacks_by_id = index(fallbacks, "fallback")
    index(corrections, "correction log")
    index(evals, "eval")
    evals_by_case_id = {item["case_id"]: item for item in evals}
    assert len(evals_by_case_id) == len(evals), "duplicate eval case_id"

    actual_counts = {
        "evidence": len(evidence),
        "judgment_rules": len(rules),
        "style_cards": len(cards),
        "fallbacks": len(fallbacks),
        "evals": len(evals),
        "correction_log_entries": len(corrections),
    }
    assert manifest["asset_counts"] == actual_counts, (
        f"manifest counts {manifest['asset_counts']} != {actual_counts}"
    )

    for item in evidence:
        assert item["url"].startswith("https://"), f"non-HTTPS source: {item['id']}"
        assert item["review_status"], f"missing review status: {item['id']}"
        assert 0 <= item["confidence"] <= 1, f"bad confidence: {item['id']}"
        for rule_id in item["supports"] + item["counterevidence_for"]:
            if rule_id.startswith("JR-"):
                assert rule_id in rules_by_id, f"unknown rule {rule_id} in {item['id']}"
            elif rule_id.startswith("SC-"):
                assert rule_id in cards_by_id, f"unknown style card {rule_id} in {item['id']}"
            else:
                raise AssertionError(f"unknown support target {rule_id} in {item['id']}")

    for rule in rules:
        assert rule["status"] in {"candidate", "approved", "retired"}
        assert rule["evidence_ids"], f"rule has no evidence: {rule['id']}"
        assert rule["failure_mode"], f"rule has no failure mode: {rule['id']}"
        assert rule["reroute_when"] and rule["stop_when"], f"incomplete control flow: {rule['id']}"
        for evidence_id in rule["evidence_ids"] + rule["counterevidence_ids"]:
            assert evidence_id in evidence_by_id, f"unknown evidence {evidence_id} in {rule['id']}"

    for card in cards:
        for evidence_id in card["evidence_ids"]:
            assert evidence_id in evidence_by_id, f"unknown evidence {evidence_id} in {card['id']}"

    forbidden = [hook.casefold() for hook in fallback_doc["forbidden_hooks"]]
    for fallback in fallbacks:
        assert fallback["style_card_id"] in cards_by_id, f"unknown style card in {fallback['id']}"
        combined = f"{fallback['en']} {fallback['zh']}".casefold()
        assert "?" not in combined and "？" not in combined, f"fallback asks a question: {fallback['id']}"
        assert not any(hook in combined for hook in forbidden), f"hook leaked into {fallback['id']}"

    allowed_routes = {
        "f1_grounded",
        "fan_light",
        "public_adjacent",
        "unrelated_general",
        "private_or_inner_state_unverified",
        "team_secret_or_live_engineering",
        "medical_legal_financial",
        "gambling",
        "illegal_hate_harm",
        "identity_or_impersonation",
        "insufficient_current_fact",
        "internal_feedback_governance",
    }
    for evaluation in evals:
        assert evaluation["expected_route"] in allowed_routes, (
            f"bad eval route: {evaluation['id']}"
        )
        assert evaluation["expectations"], f"eval has no expectations: {evaluation['id']}"

    for correction in corrections:
        for eval_id in correction["required_regression_ids"]:
            assert eval_id in evals_by_case_id, f"unknown regression {eval_id} in {correction['id']}"

    assert all(rule["status"] == "candidate" for rule in rules), (
        "v0.1 release gate expects every judgment rule to remain a candidate"
    )
    assert manifest["release_gate"]["public_runtime_enabled"] is False

    print(
        "validated piastri-fan-companion v0.1.0: "
        f"{len(evidence)} evidence, {len(rules)} rules, {len(cards)} cards, "
        f"{len(fallbacks)} fallbacks, {len(evals)} evals"
    )


if __name__ == "__main__":
    main()
