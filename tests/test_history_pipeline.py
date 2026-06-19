import base64
import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import build_history_candidates as candidate_builder  # noqa: E402


SCORE_FIELDS = (
    "historical_value",
    "peak_attention",
    "lasting_significance",
    "career_impact",
    "fan_recognition",
)


def encode_payload(payload):
    raw = json.dumps(payload).encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


class CandidateRulesTest(unittest.TestCase):
    def test_official_win_is_nominated(self):
        cluster = [
            {
                "title": "Oscar Piastri wins the Example Grand Prix",
                "official": True,
                "verified": True,
                "category": "race",
                "source": "Formula 1",
            }
        ]
        score, signals, event_kind = candidate_builder.score_cluster(cluster)
        self.assertGreaterEqual(score, candidate_builder.MIN_CANDIDATE_SCORE)
        self.assertIn("official_source", signals)
        self.assertIn("race_win", signals)
        self.assertEqual(event_kind, "race_win")

    def test_prediction_is_not_nominated(self):
        cluster = [
            {
                "title": "Why Oscar Piastri could win the Example Grand Prix",
                "official": False,
                "verified": True,
                "category": "race",
                "source": "Example Media",
            }
        ]
        score, signals, event_kind = candidate_builder.score_cluster(cluster)
        self.assertEqual(score, 0)
        self.assertIn("excluded_speculative_or_interview", signals)
        self.assertEqual(event_kind, "other")


class ReviewWorkflowTest(unittest.TestCase):
    def setUp(self):
        candidate_payload = json.loads((ROOT / "data/history-candidates.json").read_text())
        self.candidate = copy.deepcopy(candidate_payload["candidates"][0])
        self.candidate["id"] = "piastri-2022-08-02-test-event"
        self.candidate["candidate"]["status"] = "pending"
        self.candidate["selection"]["review_status"] = "pending"
        self.candidate["selection"]["include"] = None
        for field in SCORE_FIELDS:
            self.candidate["selection"][field] = None

    def run_review(self, decision, review):
        with tempfile.TemporaryDirectory() as temp_dir:
            temp = Path(temp_dir)
            history_path = temp / "history.json"
            candidates_path = temp / "history-candidates.json"
            history = {
                "generated_at": "2026-06-19T00:00:00Z",
                "schema_version": 2,
                "description": "test",
                "curation": {},
                "events": [],
            }
            candidates = {
                "generated_at": "2026-06-19T00:00:00Z",
                "schema_version": 1,
                "description": "test",
                "candidates": [self.candidate],
            }
            history_path.write_text(json.dumps(history))
            candidates_path.write_text(json.dumps(candidates))

            subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "scripts/review_history.py"),
                    "--candidate-id",
                    self.candidate["id"],
                    "--decision",
                    decision,
                    "--payload-b64",
                    encode_payload(review),
                    "--reviewer",
                    "test-reviewer",
                    "--history",
                    str(history_path),
                    "--candidates",
                    str(candidates_path),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "scripts/validate_history.py"),
                    "--history",
                    str(history_path),
                    "--candidates",
                    str(candidates_path),
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            return json.loads(history_path.read_text()), json.loads(candidates_path.read_text())

    def test_approval_moves_event_into_history(self):
        review = {
            "title": self.candidate["title"],
            "date": self.candidate["date"],
            "summary": self.candidate["summary"],
            "type": self.candidate["type"],
            "source": self.candidate["source"],
            "url": self.candidate["url"],
            "scores": {
                "historical_value": 95,
                "peak_attention": 95,
                "lasting_significance": 98,
                "career_impact": 92,
                "fan_recognition": 98,
            },
            "inclusion_reason": "A defining career moment.",
            "themes": ["contract dispute"],
            "strong_keys": ["alpine_contract_dispute"],
            "embedding_text": self.candidate["semantic"]["embedding_text"],
            "tags": self.candidate["tags"],
            "decision_reason": "Approved in pipeline test.",
        }
        history, candidates = self.run_review("approve", review)
        self.assertEqual(len(history["events"]), 1)
        self.assertEqual(history["events"][0]["selection"]["review_status"], "approved")
        self.assertEqual(candidates["candidates"][0]["candidate"]["status"], "approved")

    def test_rejection_stays_out_of_history(self):
        history, candidates = self.run_review("reject", {"decision_reason": "Not historically significant."})
        self.assertEqual(history["events"], [])
        self.assertEqual(candidates["candidates"][0]["candidate"]["status"], "rejected")


if __name__ == "__main__":
    unittest.main()
