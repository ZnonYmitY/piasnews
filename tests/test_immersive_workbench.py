import json
import os
import re
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
URL_ONLY_RE = re.compile(r"^https?://\S+$", re.IGNORECASE)


class ImmersiveWorkbenchTest(unittest.TestCase):
    def test_builds_items_and_social_targets(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            output_dir = Path(tmpdir) / "workbench"
            env = {
                "PIASNEWS_IMMERSIVE_WORKBENCH_DIR": str(output_dir),
            }
            result = subprocess.run(
                ["node", str(ROOT / "scripts" / "build_immersive_workbench.mjs")],
                cwd=ROOT,
                env={**os.environ, **env},
                text=True,
                capture_output=True,
                check=True,
            )

            payload = json.loads(result.stdout)
            self.assertGreaterEqual(payload["item_targets_count"], 0)
            self.assertGreaterEqual(payload["social_targets_count"], 0)
            self.assertTrue(Path(payload["workbench_path"]).exists())
            manifest = json.loads(Path(payload["manifest_path"]).read_text())
            datasets = {target["dataset"] for target in manifest["targets"]}
            self.assertTrue(datasets <= {"items", "social"})
            self.assertFalse(any(URL_ONLY_RE.match(target["source_text"]) for target in manifest["targets"]))

    def test_splits_targets_across_workbench_tabs(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            output_dir = Path(tmpdir) / "workbench"
            result = subprocess.run(
                ["node", str(ROOT / "scripts" / "build_immersive_workbench.mjs")],
                cwd=ROOT,
                env={
                    **os.environ,
                    "PIASNEWS_IMMERSIVE_WORKBENCH_DIR": str(output_dir),
                    "PIASNEWS_IMMERSIVE_TABS": "3",
                },
                text=True,
                capture_output=True,
                check=True,
            )

            payload = json.loads(result.stdout)
            pages = payload["workbench_pages"]
            self.assertGreaterEqual(payload["tabs_count"], 1)
            self.assertLessEqual(payload["tabs_count"], 3)
            self.assertEqual(sum(page["targets_count"] for page in pages), payload["targets_count"])
            for page in pages:
                page_path = Path(page["path"])
                self.assertTrue(page_path.exists())
                html = page_path.read_text()
                self.assertIn('script id="targets"', html)
                self.assertNotIn("&quot;", html.split('script id="targets"', 1)[1].split("</script>", 1)[0])

    def test_all_target_mode_includes_existing_mappings(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            default_dir = Path(tmpdir) / "default"
            all_dir = Path(tmpdir) / "all"
            base_env = {**os.environ, "PIASNEWS_IMMERSIVE_WORKBENCH_DIR": str(default_dir)}
            default_result = subprocess.run(
                ["node", str(ROOT / "scripts" / "build_immersive_workbench.mjs")],
                cwd=ROOT,
                env=base_env,
                text=True,
                capture_output=True,
                check=True,
            )
            all_result = subprocess.run(
                ["node", str(ROOT / "scripts" / "build_immersive_workbench.mjs")],
                cwd=ROOT,
                env={
                    **os.environ,
                    "PIASNEWS_IMMERSIVE_WORKBENCH_DIR": str(all_dir),
                    "PIASNEWS_IMMERSIVE_TARGETS": "all",
                },
                text=True,
                capture_output=True,
                check=True,
            )

            default_payload = json.loads(default_result.stdout)
            all_payload = json.loads(all_result.stdout)
            self.assertEqual(default_payload["target_mode"], "missing")
            self.assertEqual(all_payload["target_mode"], "all")
            self.assertGreaterEqual(all_payload["targets_count"], default_payload["targets_count"])

    def test_shortcut_timeout_records_cooldown(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp = Path(tmpdir)
            fake_bin = tmp / "bin"
            fake_bin.mkdir()
            fake_osascript = fake_bin / "osascript"
            fake_osascript.write_text(
                "#!/bin/sh\n"
                "echo '438:486: execution error: System Events timed out. (-1712)' >&2\n"
                "exit 1\n"
            )
            fake_osascript.chmod(0o755)
            mapping = tmp / "immersive_translations.zh.json"
            mapping.write_text(json.dumps({"schema_version": 1, "translations": {}}) + "\n")
            state = tmp / "state.json"

            result = subprocess.run(
                [
                    "node",
                    str(ROOT / "scripts" / "run_immersive_workbench.mjs"),
                    "--out",
                    str(tmp / "workbench"),
                    "--mapping",
                    str(mapping),
                    "--state",
                    str(state),
                    "--public-base-url",
                    "https://znonymity.github.io/piasnews/immersive",
                    "--targets",
                    "missing",
                    "--trigger-shortcut",
                    "Option+A",
                    "--no-open",
                    "--no-close",
                    "--no-apply",
                    "--wait-ms",
                    "1",
                    "--poll-ms",
                    "1",
                ],
                cwd=ROOT,
                env={**os.environ, "PATH": f"{fake_bin}{os.pathsep}{os.environ.get('PATH', '')}"},
                text=True,
                capture_output=True,
                check=False,
            )

            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("Recorded Apple Events cooldown", result.stdout)
            payload = json.loads(state.read_text())
            self.assertEqual(payload["reason"], "chrome_apple_events_control_failed")
            self.assertGreater(payload["targets_count"], 0)


if __name__ == "__main__":
    unittest.main()
