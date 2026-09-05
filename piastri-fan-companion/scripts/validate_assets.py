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
    source_inventory = load("references/source-inventory.json")
    x_style_analysis = load("references/x-style-analysis.json")
    knowledge_doc = load("references/person-knowledge.json")
    knowledge_facts = knowledge_doc["facts"]
    knowledge_sources = knowledge_doc["sources"]
    rumor_doc = load("references/rumor-ledger.json")
    rumor_items = rumor_doc["items"]

    evidence_by_id = index(evidence, "evidence")
    rules_by_id = index(rules, "judgment rule")
    cards_by_id = index(cards, "style card")
    fallbacks_by_id = index(fallbacks, "fallback")
    knowledge_facts_by_id = index(knowledge_facts, "knowledge fact")
    knowledge_sources_by_id = index(knowledge_sources, "knowledge source")
    index(rumor_items, "rumor item")
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
        "source_inventory": 1,
        "person_knowledge_facts": len(knowledge_facts),
        "rumor_ledger_items": len(rumor_items),
        "knowledge_policy": 1,
        "x_style_analysis": 1,
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

        corpus_role = item.get("corpus_role", "training_candidate")
        assert corpus_role in {"training_candidate", "temporal_holdout", "cross_check_only"}, (
            f"bad corpus role: {item['id']}"
        )
        if corpus_role == "temporal_holdout":
            assert item.get("source_family") == "x_official", f"holdout is not official X: {item['id']}"
            assert item.get("holdout_targets"), f"holdout has no test targets: {item['id']}"
            assert not item["supports"], f"holdout leaked into training supports: {item['id']}"

    holdout_ids = {
        item["id"] for item in evidence if item.get("corpus_role") == "temporal_holdout"
    }

    for rule in rules:
        assert rule["status"] in {"candidate", "approved", "retired"}
        assert rule["evidence_ids"], f"rule has no evidence: {rule['id']}"
        assert rule["failure_mode"], f"rule has no failure mode: {rule['id']}"
        assert rule["reroute_when"] and rule["stop_when"], f"incomplete control flow: {rule['id']}"
        for evidence_id in rule["evidence_ids"] + rule["counterevidence_ids"]:
            assert evidence_id in evidence_by_id, f"unknown evidence {evidence_id} in {rule['id']}"
            assert evidence_id not in holdout_ids, f"holdout leaked into rule {rule['id']}: {evidence_id}"

    for card in cards:
        for evidence_id in card["evidence_ids"]:
            assert evidence_id in evidence_by_id, f"unknown evidence {evidence_id} in {card['id']}"
            assert evidence_id not in holdout_ids, f"holdout leaked into card {card['id']}: {evidence_id}"

    allowed_fact_statuses = {"verified", "verified_superseded"}
    allowed_volatility = {"stable", "seasonal", "live"}
    allowed_source_classes = {
        "primary_regulator",
        "first_party_person",
        "first_party_team",
        "official_series",
    }
    for source in knowledge_sources:
        assert source["url"].startswith("https://"), f"non-HTTPS knowledge source: {source['id']}"
        assert source["source_class"] in allowed_source_classes, (
            f"bad knowledge source class: {source['id']}"
        )
        assert source["checked_at"], f"missing knowledge source check date: {source['id']}"

    for fact in knowledge_facts:
        assert fact["status"] in allowed_fact_statuses, f"bad fact status: {fact['id']}"
        assert fact["volatility"] in allowed_volatility, f"bad fact volatility: {fact['id']}"
        assert fact["source_ids"], f"knowledge fact has no source: {fact['id']}"
        assert fact["answer_en"] and fact["answer_zh"], f"knowledge fact has no bilingual answer: {fact['id']}"
        assert fact["limitations"], f"knowledge fact has no limitations: {fact['id']}"
        for source_id in fact["source_ids"]:
            assert source_id in knowledge_sources_by_id, f"unknown source {source_id} in {fact['id']}"
        if fact["volatility"] in {"seasonal", "live"}:
            assert fact.get("as_of"), f"dynamic fact has no as_of: {fact['id']}"
            assert fact.get("recheck_after"), f"dynamic fact has no recheck_after: {fact['id']}"

    allowed_verdicts = set(rumor_doc["verdict_taxonomy"])
    expected_verdicts = {
        "false_as_stated",
        "misleading",
        "currently_unsupported",
        "unverified",
        "disputed",
        "outdated",
        "privacy_boundary",
    }
    assert allowed_verdicts == expected_verdicts, "rumor verdict taxonomy drift"
    for rumor in rumor_items:
        assert rumor["verdict"] in allowed_verdicts, f"bad rumor verdict: {rumor['id']}"
        assert rumor["volatility"] in allowed_volatility, f"bad rumor volatility: {rumor['id']}"
        assert 0 <= rumor["confidence"] <= 1, f"bad rumor confidence: {rumor['id']}"
        assert rumor["normalized_claim"] and rumor["aliases"], f"unmatchable rumor: {rumor['id']}"
        assert rumor["summary_en"] and rumor["summary_zh"], f"missing rumor summary: {rumor['id']}"
        assert rumor["safe_response_en"] and rumor["safe_response_zh"], (
            f"missing rumor safe response: {rumor['id']}"
        )
        assert rumor["recheck_triggers"], f"rumor has no recheck trigger: {rumor['id']}"
        for fact_id in rumor["fact_ids"]:
            assert fact_id in knowledge_facts_by_id, f"unknown fact {fact_id} in {rumor['id']}"
        for source_id in rumor["source_ids"]:
            assert source_id in knowledge_sources_by_id, f"unknown source {source_id} in {rumor['id']}"
        rumor_evidence_ids = rumor.get("evidence_ids", [])
        for evidence_id in rumor_evidence_ids:
            assert evidence_id in evidence_by_id, f"unknown evidence {evidence_id} in {rumor['id']}"
        if not rumor["source_ids"] and not rumor_evidence_ids:
            assert rumor["verdict"] in {"unverified", "privacy_boundary"}, (
                f"source-less rumor has overconfident verdict: {rumor['id']}"
            )
            assert rumor.get("evidence_needed"), f"source-less rumor lacks evidence policy: {rumor['id']}"
        if rumor["volatility"] in {"seasonal", "live"} and rumor["verdict"] not in {
            "privacy_boundary",
            "unverified",
        }:
            assert rumor.get("recheck_after"), f"dynamic rumor has no recheck date: {rumor['id']}"
        if rumor["verdict"] == "privacy_boundary":
            assert rumor["do_not_repeat"] is True, f"privacy rumor may be amplified: {rumor['id']}"

    forbidden = [hook.casefold() for hook in fallback_doc["forbidden_hooks"]]
    for fallback in fallbacks:
        assert fallback["style_card_id"] in cards_by_id, f"unknown style card in {fallback['id']}"
        combined = f"{fallback['en']} {fallback['zh']}".casefold()
        assert "?" not in combined and "？" not in combined, f"fallback asks a question: {fallback['id']}"
        assert not any(hook in combined for hook in forbidden), f"hook leaked into {fallback['id']}"

    allowed_routes = {
        "f1_grounded",
        "fan_light",
        "public_fact",
        "rumor_check",
        "public_adjacent",
        "unrelated_general",
        "private_or_inner_state_unverified",
        "team_secret_or_live_engineering",
        "medical_legal_financial",
        "gambling",
        "illegal_hate_harm",
        "identity_or_impersonation",
        "insufficient_current_fact",
        "unverified_rumor_source",
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
        "research release gate expects every judgment rule to remain a candidate"
    )
    assert manifest["release_gate"]["public_runtime_enabled"] is False
    assert source_inventory["summary"]["curated_evidence_total"] == len(evidence)
    assert source_inventory["summary"]["official_x_holdout_evidence"] == len(holdout_ids)
    assert source_inventory["summary"]["official_x_posts_observed_during_retrieval"] == (
        manifest["corpus_summary"]["official_x_posts_observed_during_retrieval"]
    )
    selected_x_ids = x_style_analysis["sampling_policy"]["selected_training_evidence_ids"]
    assert len(selected_x_ids) == manifest["corpus_summary"]["official_x_training_candidates"]
    for evidence_id in selected_x_ids:
        item = evidence_by_id[evidence_id]
        assert item.get("source_family") == "x_official", f"non-X style sample: {evidence_id}"
        assert item.get("corpus_role") == "training_candidate", (
            f"non-training X style sample: {evidence_id}"
        )
        assert item["supports"], f"X style sample has no style target: {evidence_id}"
        assert all(target.startswith("SC-") for target in item["supports"]), (
            f"X evidence supports judgment rule: {evidence_id}"
        )
    yearly_metrics = x_style_analysis["yearly_metrics"]
    assert sum(item["items"] for item in yearly_metrics) == x_style_analysis["corpus"]["unique_items"]
    assert max(item["year"] for item in yearly_metrics) == 2025
    assert x_style_analysis["corpus"]["unique_items"] == 1630
    assert source_inventory["x_official_history"]["retrieval_status"] == (
        "complete_for_visible_search_index"
    )
    dated_windows = [
        item
        for item in source_inventory["x_official_history"]["verified_windows"]
        if item.get("method") == "yearly SearchTimeline"
    ]
    expected_years = set(range(2016, 2027))
    actual_years = {int(item["window"][:4]) for item in dated_windows}
    assert actual_years == expected_years, f"X yearly coverage drift: {actual_years}"
    assert sum(item["observed_count"] for item in dated_windows) == (
        manifest["corpus_summary"]["official_x_posts_observed_during_retrieval"]
    )

    print(
        f"validated piastri-fan-companion v{manifest['version']}: "
        f"{len(evidence)} evidence, {len(rules)} rules, {len(cards)} cards, "
        f"{len(fallbacks)} fallbacks, {len(evals)} evals, {len(holdout_ids)} X holdouts, "
        f"{len(knowledge_facts)} facts, {len(rumor_items)} rumor items"
    )


if __name__ == "__main__":
    main()
