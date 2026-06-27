import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
X_SOURCES_PATH = ROOT / "piasnews" / "references" / "x-sources.json"


class XSourcesTest(unittest.TestCase):
    def setUp(self):
        self.payload = json.loads(X_SOURCES_PATH.read_text())

    def test_required_groups_are_present(self):
        group_ids = {group["id"] for group in self.payload["groups"]}
        self.assertIn("daily_core", group_ids)
        self.assertIn("fan_watch", group_ids)

    def test_sources_have_required_fields(self):
        sources = self.payload["sources"]
        self.assertGreaterEqual(len(sources), 9)
        for source in sources:
            with self.subTest(source=source.get("id")):
                self.assertIn(source["platform"], {"x", "instagram"})
                self.assertTrue(source["handle"])
                self.assertTrue(source["url"].startswith("https://"))
                self.assertIn(source["group"], {"daily_core", "fan_watch"})
                self.assertTrue(source["content_types"])
                self.assertTrue(source["attribution_template_zh"])
                self.assertTrue(source["attribution_template_en"])

    def test_user_provided_accounts_are_registered(self):
        handles = {source["handle"] for source in self.payload["sources"]}
        expected = {
            "OscarPiastri",
            "oscarpiastri",
            "NFFormula",
            "F1",
            "PiastriNews",
            "NicolePiastri",
            "oscarpiastri81",
            "laurogeitabat",
            "oscarsspiastree",
        }
        self.assertTrue(expected.issubset(handles))


if __name__ == "__main__":
    unittest.main()
