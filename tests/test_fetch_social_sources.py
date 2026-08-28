import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import fetch_social_sources as collector  # noqa: E402


SOURCES_PATH = ROOT / "piasnews" / "references" / "x-sources.json"
NOW = "2026-06-27T08:00:00Z"


class SocialSourcesTest(unittest.TestCase):
    def test_main_writes_empty_payload_without_x_token(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "social.json"
            argv = [
                "fetch_social_sources.py",
                "--sources",
                str(SOURCES_PATH),
                "--output",
                str(output),
                "--now",
                NOW,
            ]
            with patch.object(sys, "argv", argv), patch.dict("os.environ", {}, clear=True):
                self.assertEqual(collector.main(), 0)

            payload = json.loads(output.read_text())
            self.assertEqual(payload["total_items"], 0)
            self.assertEqual(payload["items"], [])
            self.assertIn("source_status", payload)
            self.assertEqual(payload["source_status"][0]["stage"], "x_api")

    def test_import_keeps_recent_relevant_social_item(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            import_path = Path(tmpdir) / "import.json"
            import_path.write_text(json.dumps({
                "items": [
                    {
                        "platform": "x",
                        "handle": "PiastriNews",
                        "id": "123",
                        "text": "Oscar Piastri and McLaren updates from the paddock.",
                        "created_at": "2026-06-26T10:00:00Z",
                        "kind": "post",
                    },
                    {
                        "platform": "x",
                        "handle": "PiastriNews",
                        "id": "old",
                        "text": "Oscar Piastri older item.",
                        "created_at": "2026-06-20T10:00:00Z",
                    },
                    {
                        "platform": "x",
                        "handle": "F1",
                        "id": "noise",
                        "text": "Unrelated post without the target terms.",
                        "created_at": "2026-06-26T11:00:00Z",
                    },
                ]
            }))

            sources = collector.load_sources(SOURCES_PATH)
            now = collector.parse_now(NOW)
            cutoff = now - collector.timedelta(days=3)
            items, status = collector.normalize_import(import_path, sources, now, cutoff)

            self.assertEqual(status["items"], 1)
            self.assertEqual(status["skipped"], 2)
            self.assertEqual(items[0]["source"], "@PiastriNews")
            self.assertEqual(items[0]["url"], "https://x.com/PiastriNews/status/123")
            self.assertEqual(items[0]["category"], "fan")
            self.assertEqual(items[0]["attribution_zh"], "引用自 @PiastriNews")
            self.assertEqual(items[0]["summary_zh"], "Oscar Piastri and McLaren updates from the paddock.")
            self.assertIn("Piastri", items[0]["title_zh"])

    def test_import_preserves_per_post_media(self):
        sources = collector.load_sources(SOURCES_PATH)
        now = collector.parse_now(NOW)
        items, status = collector.normalize_import_payload({"items": [{
            "platform": "x",
            "handle": "PiastriNews",
            "id": "media",
            "text": "Oscar Piastri turtle and shark clip",
            "created_at": "2026-06-26T10:00:00Z",
            "video_url": "https://video.example.com/clip.mp4",
            "video_poster_url": "https://img.example.com/poster.jpg",
        }]}, "media-import", sources, now, now - collector.timedelta(days=3))

        self.assertEqual(status["items"], 1)
        self.assertEqual(items[0]["video_url"], "https://video.example.com/clip.mp4")
        self.assertEqual(items[0]["video_poster_url"], "https://img.example.com/poster.jpg")

    def test_import_can_normalize_instagram_item_with_url(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            import_path = Path(tmpdir) / "import.json"
            import_path.write_text(json.dumps({
                "items": [
                    {
                        "platform": "instagram",
                        "handle": "oscarpiastri",
                        "url": "https://www.instagram.com/p/example/",
                        "text": "Oscar Piastri posted a new McLaren race-week update.",
                        "published_at": "2026-06-26T12:00:00Z",
                        "kind": "reel",
                    }
                ]
            }))

            sources = collector.load_sources(SOURCES_PATH)
            now = collector.parse_now(NOW)
            cutoff = now - collector.timedelta(days=3)
            items, status = collector.normalize_import(import_path, sources, now, cutoff)

            self.assertEqual(status["items"], 1)
            self.assertEqual(items[0]["source_type"], "instagram")
            self.assertEqual(items[0]["url"], "https://www.instagram.com/p/example/")
            self.assertIn("Piastri", items[0]["title_zh"])

    def test_env_json_import_is_supported(self):
        payload = {
            "items": [
                {
                    "platform": "x",
                    "handle": "NicolePiastri",
                    "id": "456",
                    "text": "Oscar Piastri family-side McLaren race-week note.",
                    "created_at": "2026-06-26T09:00:00Z",
                }
            ]
        }
        sources = collector.load_sources(SOURCES_PATH)
        now = collector.parse_now(NOW)
        cutoff = now - collector.timedelta(days=3)
        items, status = collector.normalize_import_payload(payload, "env", sources, now, cutoff)

        self.assertEqual(status["items"], 1)
        self.assertEqual(items[0]["source"], "@NicolePiastri")
        self.assertEqual(items[0]["summary_zh"], "Oscar Piastri family-side McLaren race-week note.")
        self.assertEqual(items[0]["copyright_notice_zh"], "如有侵权请联系删除。")

    def test_legacy_agent_reach_compact_is_ignored(self):
        payload = {
            "source": "agent-reach/compact-social",
            "items": [{
                "platform": "x",
                "handle": "PiastriNews",
                "id": "legacy",
                "text": "Oscar Piastri legacy text-only snapshot.",
                "created_at": "2026-06-26T09:00:00Z",
            }],
        }
        sources = collector.load_sources(SOURCES_PATH)
        now = collector.parse_now(NOW)

        items, status = collector.normalize_import_payload(
            payload,
            "legacy-env",
            sources,
            now,
            now - collector.timedelta(days=3),
        )

        self.assertEqual(items, [])
        self.assertFalse(status["ok"])
        self.assertEqual(status["reason"], "unsupported_compact_schema")
        self.assertEqual(status["required_schema_version"], 2)

    def test_current_agent_reach_compact_is_accepted(self):
        payload = {
            "schema_version": 2,
            "collector_version": "media-preserving-v2",
            "source": "agent-reach/compact-social",
            "media_item_count": 1,
            "items": [{
                "platform": "x",
                "handle": "PiastriNews",
                "id": "current",
                "text": "Oscar Piastri current media snapshot.",
                "created_at": "2026-06-26T09:00:00Z",
                "image_url": "https://img.example.com/current.jpg",
            }],
        }
        sources = collector.load_sources(SOURCES_PATH)
        now = collector.parse_now(NOW)

        items, status = collector.normalize_import_payload(
            payload,
            "current-env",
            sources,
            now,
            now - collector.timedelta(days=3),
        )

        self.assertTrue(status["ok"])
        self.assertEqual(status["schema_version"], 2)
        self.assertEqual(status["declared_media_items"], 1)
        self.assertEqual(items[0]["image_url"], "https://img.example.com/current.jpg")

    def test_current_compact_with_false_media_count_is_ignored(self):
        payload = {
            "schema_version": 2,
            "collector_version": "media-preserving-v2",
            "source": "agent-reach/compact-social",
            "media_item_count": 1,
            "items": [{
                "platform": "x",
                "handle": "PiastriNews",
                "id": "text-only",
                "text": "Oscar Piastri text-only item.",
                "created_at": "2026-06-26T09:00:00Z",
            }],
        }
        sources = collector.load_sources(SOURCES_PATH)
        now = collector.parse_now(NOW)

        items, status = collector.normalize_import_payload(
            payload,
            "invalid-v2",
            sources,
            now,
            now - collector.timedelta(days=3),
        )

        self.assertEqual(items, [])
        self.assertFalse(status["ok"])
        self.assertEqual(status["reason"], "invalid_compact_metadata")
        self.assertEqual(status["declared_media_items"], 1)
        self.assertEqual(status["actual_media_items"], 0)

    def test_supabase_payload_envelope_is_unwrapped(self):
        payload = collector.unwrap_import_payload([
            {
                "payload": {
                    "items": [
                        {
                            "platform": "x",
                            "handle": "PiastriNews",
                            "id": "789",
                            "text": "Oscar Piastri remote Supabase import.",
                            "created_at": "2026-06-26T09:30:00Z",
                        }
                    ]
                }
            }
        ])
        sources = collector.load_sources(SOURCES_PATH)
        now = collector.parse_now(NOW)
        cutoff = now - collector.timedelta(days=3)
        items, status = collector.normalize_import_payload(payload, "supabase", sources, now, cutoff)

        self.assertEqual(status["items"], 1)
        self.assertEqual(items[0]["source"], "@PiastriNews")
        self.assertEqual(items[0]["url"], "https://x.com/PiastriNews/status/789")

    def test_social_summary_keeps_full_original_text(self):
        text = "Oscar finishes FP2 in P2 and looks fastest in high speed corners. Extra detail kept."
        sources = collector.load_sources(SOURCES_PATH)
        source = next(item for item in sources["sources"] if item["handle"] == "PiastriNews")
        now = collector.parse_now(NOW)
        item = collector.normalize_social_item(
            {
                "platform": "x",
                "handle": "PiastriNews",
                "id": "full",
                "text": text,
                "created_at": "2026-06-26T10:00:00Z",
            },
            source,
            now,
            now - collector.timedelta(days=3),
        )

        self.assertEqual(item["summary"], text)
        self.assertEqual(item["summary_zh"], text)
        self.assertIn("练习赛", item["title_zh"])

    def test_generic_f1_post_without_direct_piastri_reference_is_skipped(self):
        sources = collector.load_sources(SOURCES_PATH)
        source = next(item for item in sources["sources"] if item["handle"] == "F1")
        now = collector.parse_now(NOW)
        item = collector.normalize_social_item(
            {
                "platform": "x",
                "handle": "F1",
                "id": "generic",
                "text": "T-minus 15 minutes until FP2 lights up the Red Bull Ring #F1 #AustrianGP",
                "created_at": "2026-06-26T10:00:00Z",
            },
            source,
            now,
            now - collector.timedelta(days=3),
        )

        self.assertIsNone(item)

    def test_fan_watch_source_does_not_require_direct_keyword(self):
        sources = collector.load_sources(SOURCES_PATH)
        source = next(item for item in sources["sources"] if item["handle"] == "PiastriNews")
        now = collector.parse_now(NOW)
        item = collector.normalize_social_item(
            {
                "platform": "x",
                "handle": "PiastriNews",
                "id": "fan",
                "text": "Locked in and ready to send it in the MCL40.",
                "created_at": "2026-06-26T10:00:00Z",
            },
            source,
            now,
            now - collector.timedelta(days=3),
        )

        self.assertIsNotNone(item)
        self.assertEqual(item["source_group"], "fan_watch")

    def test_dedupe_items_sorts_by_published_at_desc(self):
        items = [
            {"url": "https://x.com/a/status/1", "published_at": "2026-06-26T09:00:00Z"},
            {"url": "https://x.com/a/status/2", "published_at": "2026-06-27T09:00:00Z"},
            {"url": "https://x.com/a/status/3", "published_at": "2026-06-25T09:00:00Z"},
        ]

        result = collector.dedupe_items(items, 10)

        self.assertEqual([item["url"] for item in result], [
            "https://x.com/a/status/2",
            "https://x.com/a/status/1",
            "https://x.com/a/status/3",
        ])

    def test_dedupe_items_preserves_media_from_previous_duplicate(self):
        url = "https://x.com/a/status/media"
        incoming = {
            "url": url,
            "published_at": "2026-06-27T09:00:00Z",
            "summary": "new metrics and text",
            "metrics": {"likes": 100},
        }
        previous = {
            "url": url,
            "published_at": "2026-06-27T09:00:00Z",
            "summary": "old text",
            "metrics": {"likes": 50},
            "video_url": "https://video.example.com/oscar.mp4",
            "video_poster_url": "https://img.example.com/poster.jpg",
        }
        stats = {}

        result = collector.dedupe_items([incoming, previous], 10, stats)

        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["summary"], "new metrics and text")
        self.assertEqual(result[0]["metrics"]["likes"], 100)
        self.assertEqual(result[0]["video_url"], previous["video_url"])
        self.assertEqual(result[0]["video_poster_url"], previous["video_poster_url"])
        self.assertEqual(stats["media_fields_preserved"], 2)


if __name__ == "__main__":
    unittest.main()
