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

    def test_hot_workbench_reuses_authenticated_admin_session(self):
        app = (ROOT / "public/admin/app.js").read_text(encoding="utf-8")
        html = (ROOT / "public/admin/index.html").read_text(encoding="utf-8")

        self.assertIn("if (!force && state.session)", app)
        self.assertIn("if (state.sessionValidation) return state.sessionValidation", app)
        self.assertIn("state.session = null;\n  elements.settingsDialog.close()", app)
        self.assertIn("await loadSession({ force: true })", app)
        self.assertRegex(html, r'app\.js\?v=\d{8}-')

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
        self.assertIn("置顶只改变排序，不绕过热度门槛", html)
        self.assertIn("赛后成绩硬规则优先", html)

    def test_pages_artifact_includes_override_catalog_for_read_only_admin(self):
        for workflow_name in ("update-piasnews.yml", "review-history.yml"):
            workflow = (ROOT / ".github/workflows" / workflow_name).read_text(encoding="utf-8")
            self.assertIn("data/hot-event-overrides.json public/data/", workflow)

    def test_refresh_fetches_and_publishes_structured_session_results(self):
        workflow = (ROOT / ".github/workflows" / "update-piasnews.yml").read_text(encoding="utf-8")
        review_workflow = (ROOT / ".github/workflows" / "review-history.yml").read_text(encoding="utf-8")

        self.assertIn("Fetch latest Oscar session result", workflow)
        self.assertIn("scripts/fetch_f1_session_results.py", workflow)
        self.assertIn("data/session-results.json", workflow)
        self.assertIn("data/session-results.json", review_workflow)

    def test_data_refresh_rejects_retained_media_regressions(self):
        workflow = (ROOT / ".github/workflows" / "update-piasnews.yml").read_text(encoding="utf-8")

        self.assertIn("Validate retained social media", workflow)
        self.assertIn("scripts/validate_social_media.py", workflow)
        self.assertLess(
            workflow.index("Validate retained social media"),
            workflow.index("Build merged hot-event ranking"),
        )

    def test_hot_ranking_renders_poster_only_media_as_image(self):
        app = (ROOT / "public" / "app.js").read_text(encoding="utf-8")
        html = (ROOT / "public" / "index.html").read_text(encoding="utf-8")

        self.assertIn(": imageUrl || posterUrl", app)
        self.assertIn("escapeHtml(imageUrl || posterUrl)", app)
        self.assertIn("app.js?v=20260828-media-v2", html)

    def test_admin_exposes_manual_translation_fallback_without_automatic_trigger(self):
        app = (ROOT / "public" / "admin" / "app.js").read_text(encoding="utf-8")
        html = (ROOT / "public" / "admin" / "index.html").read_text(encoding="utf-8")
        workflow = (ROOT / ".github" / "workflows" / "update-piasnews.yml").read_text(encoding="utf-8")
        plist = (ROOT / "scripts" / "com.znonymity.piasnews.immersive.plist").read_text(encoding="utf-8")

        self.assertIn('data-view="translation"', html)
        self.assertIn("人工打开 Workbench", html)
        self.assertIn("loadTranslationFallback", app)
        self.assertIn('can("publish")', app)
        self.assertIn("build_translation_fallback_status.py", workflow)
        self.assertIn("PIASNEWS_IMMERSIVE_TARGETS=missing", workflow)
        self.assertNotIn("<key>StartInterval</key>", plist)
        self.assertNotIn("<key>RunAtLoad</key>", plist)


if __name__ == "__main__":
    unittest.main()
