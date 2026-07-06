import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


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


if __name__ == "__main__":
    unittest.main()
