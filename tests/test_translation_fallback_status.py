import json
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

import sys

sys.path.insert(0, str(ROOT / "scripts"))

from build_translation_fallback_status import fallback_status  # noqa: E402
from translate_zh_llm_mapping import collect_targets, read_json  # noqa: E402


class TranslationFallbackStatusTests(unittest.TestCase):
    def write_payloads(self, directory: Path, source_text: str, mapping: dict) -> tuple[Path, Path, Path]:
        items_path = directory / "items.json"
        social_path = directory / "social.json"
        mapping_path = directory / "mapping.json"
        items_path.write_text(json.dumps({"items": []}), encoding="utf-8")
        social_path.write_text(json.dumps({
            "items": [{
                "id": "social-test",
                "summary": source_text,
                "url": "https://example.com/post",
                "source": "Test source",
            }],
        }), encoding="utf-8")
        mapping_path.write_text(json.dumps(mapping), encoding="utf-8")
        return items_path, social_path, mapping_path

    def test_html_entity_normalization_does_not_create_false_alert(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            directory = Path(tmpdir)
            empty_mapping = {"schema_version": 1, "translations": {}}
            items_path, social_path, mapping_path = self.write_payloads(
                directory,
                "Oscar &amp; Lando prepare for the race",
                empty_mapping,
            )
            target = collect_targets(items_path, social_path, read_json(mapping_path, empty_mapping))[0]
            mapping = {
                "schema_version": 1,
                "translations": {
                    target["key"]: {
                        **target,
                        "zh": "Oscar 和 Lando 为比赛做准备",
                        "engine": "piasnews_llm_translation",
                    },
                },
            }
            mapping_path.write_text(json.dumps(mapping), encoding="utf-8")

            payload = fallback_status(items_path, social_path, mapping_path, generated_at="2026-08-29T00:00:00Z")

            self.assertEqual(payload["status"], "healthy")
            self.assertEqual(payload["pending_count"], 0)

    def test_emoji_only_source_is_ignored(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            paths = self.write_payloads(
                Path(tmpdir),
                "😭🦈🐝 https://example.com/post",
                {"schema_version": 1, "translations": {}},
            )
            payload = fallback_status(*paths, generated_at="2026-08-29T00:00:00Z")

            self.assertEqual(payload["status"], "healthy")
            self.assertEqual(payload["pending_count"], 0)
            self.assertEqual(payload["ignored_non_text_count"], 1)

    def test_missing_english_source_requires_manual_fallback(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            paths = self.write_payloads(
                Path(tmpdir),
                "Oscar explains the difficult race",
                {"schema_version": 1, "translations": {}},
            )
            payload = fallback_status(*paths, generated_at="2026-08-29T00:00:00Z")

            self.assertEqual(payload["status"], "action_required")
            self.assertEqual(payload["pending_count"], 1)
            self.assertEqual(payload["items"][0]["reason"], "llm_mapping_missing")

    def test_cli_preserves_timestamp_when_status_is_unchanged(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            directory = Path(tmpdir)
            items_path, social_path, mapping_path = self.write_payloads(
                directory,
                "😭🦈🐝 https://example.com/post",
                {"schema_version": 1, "translations": {}},
            )
            output_path = directory / "status.json"
            output_path.write_text(json.dumps({
                "schema_version": 1,
                "generated_at": "2026-08-29T00:00:00Z",
                "status": "healthy",
                "pending_count": 0,
                "ignored_non_text_count": 1,
                "workbench_path": "../immersive/translation-workbench.html",
                "items": [],
            }), encoding="utf-8")

            subprocess.run(
                [
                    "python3",
                    str(ROOT / "scripts" / "build_translation_fallback_status.py"),
                    "--items",
                    str(items_path),
                    "--social",
                    str(social_path),
                    "--mapping",
                    str(mapping_path),
                    "--output",
                    str(output_path),
                ],
                check=True,
                text=True,
                capture_output=True,
            )

            self.assertEqual(json.loads(output_path.read_text())["generated_at"], "2026-08-29T00:00:00Z")


if __name__ == "__main__":
    unittest.main()
