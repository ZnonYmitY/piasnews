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


if __name__ == "__main__":
    unittest.main()
