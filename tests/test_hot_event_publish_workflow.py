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

    def test_workflow_serializes_writes_and_checks_event_version(self):
        workflow = (ROOT / ".github/workflows/review-hot-events.yml").read_text(encoding="utf-8")

        self.assertIn("group: piasnews-write", workflow)
        self.assertIn("cancel-in-progress: false", workflow)
        self.assertIn("expected_updated_at:", workflow)
        self.assertIn('--expected-updated-at "$EXPECTED_UPDATED_AT"', workflow)

    def test_workbench_keeps_hidden_events_manageable(self):
        app = (ROOT / "public/admin/app.js").read_text(encoding="utf-8")
        html = (ROOT / "public/admin/index.html").read_text(encoding="utf-8")

        self.assertIn("activeHotOverride", app)
        self.assertIn("前台隐藏", app)
        self.assertIn("formatAnalyticsTime(override.updated_at)", app)
        self.assertNotIn("formatDate(override.updated_at)", app)
        self.assertIn("从前台隐藏（后台仍保留）", html)
        self.assertIn("人工指定名次", html)

    def test_pages_artifact_includes_override_catalog_for_read_only_admin(self):
        for workflow_name in ("update-piasnews.yml", "review-history.yml"):
            workflow = (ROOT / ".github/workflows" / workflow_name).read_text(encoding="utf-8")
            self.assertIn("data/hot-event-overrides.json public/data/", workflow)

    def test_data_refresh_rejects_retained_media_regressions(self):
        workflow = (ROOT / ".github/workflows" / "update-piasnews.yml").read_text(encoding="utf-8")

        self.assertIn("Validate retained social media", workflow)
        self.assertIn("scripts/validate_social_media.py", workflow)
        self.assertLess(
            workflow.index("Validate retained social media"),
            workflow.index("Build merged hot-event ranking"),
        )


if __name__ == "__main__":
    unittest.main()
