import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class HotEventPublishWorkflowTests(unittest.TestCase):
    def test_active_override_dispatches_production_publish(self):
        workflow = (ROOT / ".github/workflows/review-hot-events.yml").read_text(encoding="utf-8")

        self.assertIn("actions: write", workflow)
        self.assertIn("if: ${{ inputs.override_status == 'active' }}", workflow)
        self.assertIn(
            "gh workflow run update-piasnews.yml --ref main --field apply_only=true",
            workflow,
        )

    def test_workbench_explains_active_and_draft_publish_behavior(self):
        app = (ROOT / "public/admin/app.js").read_text(encoding="utf-8")

        self.assertIn("正在自动发布线上", app)
        self.assertIn("热榜草稿，不发布线上", app)
        self.assertNotIn("已提交启用覆盖，未直接部署线上", app)


if __name__ == "__main__":
    unittest.main()
