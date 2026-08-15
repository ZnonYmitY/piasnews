import json
import os
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import apply_immersive_translations as immersive  # noqa: E402
import translate_zh_llm_mapping as llm_mapping  # noqa: E402


class TranslateZhLlmMappingTest(unittest.TestCase):
    def test_collects_only_missing_non_url_targets(self):
        title = "Piastri takes pole in Austrian GP"
        summary = "https://t.co/example"
        key = llm_mapping.target_key("items", "one", "title", title)
        mapping = {
            "translations": {
                key: {
                    "dataset": "items",
                    "target_field": "title_zh",
                    "source_text": title,
                    "zh": "Piastri 在奥地利大奖赛拿下杆位",
                }
            }
        }

        with tempfile.TemporaryDirectory() as tmpdir:
            items_path = Path(tmpdir) / "items.json"
            social_path = Path(tmpdir) / "social.json"
            items_path.write_text(json.dumps({
                "items": [{
                    "id": "one",
                    "title": title,
                    "summary": summary,
                }]
            }), encoding="utf-8")
            social_path.write_text(json.dumps({"items": []}), encoding="utf-8")

            targets = llm_mapping.collect_targets(items_path, social_path, mapping)

        self.assertEqual(targets, [])

    def test_writes_llm_mapping_and_existing_apply_script_can_use_it(self):
        source = "Oscar Piastri says McLaren exceeded expectations in Austria."
        key = llm_mapping.target_key("items", "one", "summary", source)
        target = {
            "key": key,
            "dataset": "items",
            "item_id": "one",
            "field": "summary",
            "target_field": "summary_zh",
            "source_text": source,
            "source_url": "https://example.com",
            "source_name": "Example",
        }
        mapping = {"schema_version": 1, "translations": {}}

        added = llm_mapping.update_mapping(
            mapping,
            [target],
            {key: "Oscar Piastri 表示 McLaren 在奥地利的表现超过预期。"},
            model="test-model",
            base_url="https://api.example.test/v1",
        )

        self.assertEqual(added, 1)
        self.assertEqual(mapping["translations"][key]["engine"], llm_mapping.ENGINE)

        with tempfile.TemporaryDirectory() as tmpdir:
            mapping_path = Path(tmpdir) / "mapping.json"
            items_path = Path(tmpdir) / "items.json"
            mapping_path.write_text(json.dumps(mapping), encoding="utf-8")
            items_path.write_text(json.dumps({
                "items": [{
                    "summary": source,
                    "summary_zh": "旧摘要",
                }]
            }), encoding="utf-8")

            grouped = immersive.load_translations(mapping_path, {llm_mapping.ENGINE})
            self.assertEqual(immersive.apply_item_translations(items_path, grouped), 1)
            item = json.loads(items_path.read_text(encoding="utf-8"))["items"][0]

        self.assertEqual(item["summary_zh"], "Oscar Piastri 表示 McLaren 在奥地利的表现超过预期。")

    def test_translate_batch_ignores_unknown_keys_and_non_chinese_output(self):
        target = {
            "key": "known",
            "dataset": "social",
            "item_id": "one",
            "field": "summary",
            "target_field": "summary_zh",
            "source_text": "Oscar talks about qualifying.",
            "source_url": "",
            "source_name": "@source",
        }

        def fake_client(_messages):
            return json.dumps({
                "translations": [
                    {"key": "known", "zh": "Oscar 谈到了排位赛。"},
                    {"key": "unknown", "zh": "不应写入"},
                    {"key": "known", "zh": "Oscar talks about qualifying."},
                ]
            })

        translated = llm_mapping.translate_batch([target], fake_client)

        self.assertEqual(translated, {"known": "Oscar 谈到了排位赛。"})

    def test_prompt_preserves_zak_brown_as_proper_name(self):
        messages = llm_mapping.build_prompt([{
            "key": "one",
            "dataset": "social",
            "item_id": "one",
            "field": "summary",
            "target_field": "summary_zh",
            "source_text": "read the zak brown book for work",
            "source_url": "",
            "source_name": "@source",
        }])

        self.assertIn("Zak Brown", messages[0]["content"])

    def test_valid_translation_allows_zak_brown_proper_name(self):
        result = llm_mapping.valid_translation(
            "read the zak brown book for work",
            "为了工作阅读 Zak Brown 的书是一种心理折磨",
        )

        self.assertEqual(result, "为了工作阅读 Zak Brown 的书是一种心理折磨")

    def test_valid_translation_allows_domain_english_in_chinese_output(self):
        result = llm_mapping.valid_translation(
            "Oscar and Lando talk about a Drive to Survive clip with McLaren",
            "Oscar 和 Lando 在 McLaren 的 Drive to Survive 片段里聊天",
        )

        self.assertEqual(result, "Oscar 和 Lando 在 McLaren 的 Drive to Survive 片段里聊天")

    def test_cli_skips_without_api_key(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            items_path = tmp / "items.json"
            social_path = tmp / "social.json"
            mapping_path = tmp / "mapping.json"
            items_path.write_text(json.dumps({
                "items": [{
                    "id": "one",
                    "title": "Oscar Piastri claims pole",
                }]
            }), encoding="utf-8")
            social_path.write_text(json.dumps({"items": []}), encoding="utf-8")
            mapping_path.write_text(json.dumps({"schema_version": 1, "translations": {}}), encoding="utf-8")

            env = {
                key: value
                for key, value in os.environ.items()
                if key not in {"PIASNEWS_LLM_TRANSLATION_API_KEY", "OPENAI_API_KEY"}
            }
            result = subprocess.run(
                [
                    sys.executable,
                    str(ROOT / "scripts" / "translate_zh_llm_mapping.py"),
                    "--items",
                    str(items_path),
                    "--social",
                    str(social_path),
                    "--mapping",
                    str(mapping_path),
                ],
                cwd=ROOT,
                env=env,
                text=True,
                capture_output=True,
                check=False,
            )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("missing PIASNEWS_LLM_TRANSLATION_API_KEY", result.stdout)

    def test_deepseek_client_disables_thinking_for_translation(self):
        captured = {}

        class FakeResponse:
            def __enter__(self):
                return self

            def __exit__(self, *_args):
                return False

            def read(self):
                return json.dumps({
                    "choices": [{"message": {"content": "{\"translations\": []}"}}],
                }).encode("utf-8")

        def fake_urlopen(request, timeout):
            captured["timeout"] = timeout
            captured["payload"] = json.loads(request.data.decode("utf-8"))
            return FakeResponse()

        client = llm_mapping.openai_chat_completion_client(
            base_url="https://api.deepseek.com",
            api_key="test",
            model="deepseek-v4-flash",
            timeout=7,
        )
        with mock.patch("urllib.request.urlopen", fake_urlopen):
            content = client([{"role": "user", "content": "Return JSON."}])

        self.assertEqual(json.loads(content), {"translations": []})
        self.assertEqual(captured["timeout"], 7)
        self.assertEqual(captured["payload"]["thinking"], {"type": "disabled"})


if __name__ == "__main__":
    unittest.main()
