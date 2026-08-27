import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import collect_agent_reach_social as collector  # noqa: E402


SOURCES_PATH = ROOT / "piasnews" / "references" / "x-sources.json"


class AgentReachCollectTest(unittest.TestCase):
    def test_normalizes_common_twitter_payload(self):
        item = collector.normalize_raw_tweet(
            {
                "id": "123",
                "text": "Oscar Piastri McLaren update",
                "created_at": "Sat Jun 27 08:00:00 +0000 2026",
                "public_metrics": {"like_count": 81},
            },
            "PiastriNews",
        )

        self.assertEqual(item["platform"], "x")
        self.assertEqual(item["handle"], "PiastriNews")
        self.assertEqual(item["url"], "https://x.com/PiastriNews/status/123")
        self.assertEqual(item["created_at"], "2026-06-27T08:00:00Z")
        self.assertEqual(item["kind"], "post")

    def test_normalizes_twitter_video_and_poster(self):
        item = collector.normalize_raw_tweet(
            {
                "id": "media-123",
                "text": "Oscar Piastri turtle and shark clip",
                "created_at": "Sat Jun 27 08:00:00 +0000 2026",
                "extended_entities": {
                    "media": [{
                        "type": "video",
                        "media_url_https": "https://img.example.com/poster.jpg",
                        "video_info": {"variants": [
                            {"content_type": "video/mp4", "bitrate": 256000, "url": "https://video.example.com/low.mp4"},
                            {"content_type": "video/mp4", "bitrate": 832000, "url": "https://video.example.com/high.mp4"},
                        ]},
                    }]
                },
            },
            "PiastriNews",
        )

        self.assertEqual(item["video_url"], "https://video.example.com/high.mp4")
        self.assertEqual(item["video_poster_url"], "https://img.example.com/poster.jpg")

    def test_normalizes_twitter_cli_photo_url(self):
        item = collector.normalize_raw_tweet(
            {
                "id": "photo-123",
                "text": "Oscar Piastri photo",
                "created_at": "Sat Jun 27 08:00:00 +0000 2026",
                "media": [{"type": "photo", "url": "https://pbs.twimg.com/media/oscar.jpg"}],
            },
            "PiastriNews",
        )

        self.assertEqual(item["image_url"], "https://pbs.twimg.com/media/oscar.jpg")

    def test_normalizes_opencli_media_arrays_and_metrics(self):
        item = collector.normalize_raw_tweet(
            {
                "id": "opencli-123",
                "author": "OscarPiastri",
                "text": "Hard work continues ahead of Monza",
                "created_at": "Wed Aug 26 08:00:00 +0000 2026",
                "likes": 81,
                "retweets": 12,
                "replies": 4,
                "views": 8100,
                "media_urls": [
                    "https://video.twimg.com/ext_tw_video/123/pu/vid/avc1/1280x720/clip.mp4",
                    "https://pbs.twimg.com/media/oscar.jpg",
                ],
                "media_posters": [
                    "https://pbs.twimg.com/ext_tw_video_thumb/123/pu/img/poster.jpg",
                    "https://pbs.twimg.com/media/oscar.jpg",
                ],
            },
            "OscarPiastri",
        )

        self.assertEqual(item["author_handle"], "OscarPiastri")
        self.assertEqual(item["video_url"], "https://video.twimg.com/ext_tw_video/123/pu/vid/avc1/1280x720/clip.mp4")
        self.assertEqual(item["video_poster_url"], "https://pbs.twimg.com/ext_tw_video_thumb/123/pu/img/poster.jpg")
        self.assertEqual(item["image_url"], "https://pbs.twimg.com/media/oscar.jpg")
        self.assertEqual(item["metrics"]["likes"], 81)

    def test_enriches_recent_video_poster_from_x_page(self):
        items = [{
            "url": "https://x.com/PiastriNews/status/123",
            "created_at": "2026-06-27T10:00:00Z",
            "video_url": "https://video.twimg.com/video.mp4",
            "video_poster_url": None,
        }]

        with patch.object(collector, "fetch_x_page_preview", return_value="https://pbs.twimg.com/video-poster.jpg"):
            count = collector.enrich_recent_video_posters(
                items,
                collector.parse_now("2026-06-27T12:00:00Z"),
                3,
            )

        self.assertEqual(count, 1)
        self.assertEqual(items[0]["video_poster_url"], "https://pbs.twimg.com/video-poster.jpg")

    def test_detects_reposts_from_text(self):
        item = collector.normalize_raw_tweet(
            {
                "id": "456",
                "text": "RT @F1: Oscar Piastri podium quote",
                "created_at": "2026-06-27T09:00:00Z",
            },
            "PiastriNews",
        )

        self.assertEqual(item["kind"], "repost")

    def test_normalizes_user_posts_payload_shape(self):
        item = collector.normalize_raw_tweet(
            {
                "id": "789",
                "text": "Fresh Oscar Piastri fan update",
                "createdAtISO": "2026-06-27T10:00:00+00:00",
                "author": {"screenName": "PiastriNews"},
                "isRetweet": True,
            },
            "PiastriNews",
        )

        self.assertEqual(item["created_at"], "2026-06-27T10:00:00Z")
        self.assertEqual(item["author_handle"], "PiastriNews")
        self.assertEqual(item["url"], "https://x.com/PiastriNews/status/789")
        self.assertEqual(item["kind"], "repost")

    def test_parses_x_web_timeline_payload(self):
        payload = {
            "data": {
                "user": {
                    "result": {
                        "timeline_v2": {
                            "timeline": {
                                "instructions": [
                                    {
                                        "entries": [
                                            {
                                                "content": {
                                                    "itemContent": {
                                                        "tweet_results": {
                                                            "result": {
                                                                "rest_id": "111",
                                                                "legacy": {
                                                                    "full_text": "Oscar Piastri fan source",
                                                                    "created_at": "Sat Jun 27 08:00:00 +0000 2026",
                                                                    "favorite_count": 81,
                                                                    "lang": "en",
                                                                    "extended_entities": {"media": [{
                                                                        "type": "photo",
                                                                        "media_url_https": "https://img.example.com/oscar.jpg",
                                                                    }]},
                                                                },
                                                                "core": {
                                                                    "user_results": {
                                                                        "result": {
                                                                            "core": {"screen_name": "PiastriNews"},
                                                                            "legacy": {"screen_name": "PiastriNews"},
                                                                        }
                                                                    }
                                                                },
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        ]
                                    }
                                ]
                            }
                        }
                    }
                }
            }
        }

        raw_items = collector.x_web_tweet_items(payload, "PiastriNews")
        item = collector.normalize_raw_tweet(raw_items[0], "PiastriNews")

        self.assertEqual(item["id"], "111")
        self.assertEqual(item["author_handle"], "PiastriNews")
        self.assertEqual(item["created_at"], "2026-06-27T08:00:00Z")
        self.assertEqual(item["kind"], "post")
        self.assertEqual(item["image_url"], "https://img.example.com/oscar.jpg")

    def test_builds_user_posts_command_by_default(self):
        command = collector.twitter_command("user-posts", "PiastriNews", "2026-06-24", 5, Path("/tmp/out.json"))

        self.assertEqual(command[:2], ["user-posts", "PiastriNews"])
        self.assertIn("--output", command)

    def test_main_writes_import_payload_from_source_config(self):
        def fake_search(
            _twitter_cmd,
            handle,
            _since_date,
            _per_source,
            _method="user-posts",
            _curl_cmd="curl",
            _backend="auto",
            _opencli_cmd="opencli",
        ):
            if handle != "PiastriNews":
                return [], {"platform": "x", "handle": handle, "ok": True, "items": 0}
            return [
                {
                    "platform": "x",
                    "handle": handle,
                    "id": "789",
                    "text": "Oscar Piastri fan update",
                    "created_at": "2026-06-27T10:00:00Z",
                    "kind": "post",
                }
            ], {"platform": "x", "handle": handle, "ok": True, "items": 1}

        with tempfile.TemporaryDirectory() as tmpdir:
            output = Path(tmpdir) / "import.json"
            argv = [
                "collect_agent_reach_social.py",
                "--sources",
                str(SOURCES_PATH),
                "--output",
                str(output),
                "--group",
                "fan_watch",
                "--now",
                "2026-06-27T12:00:00Z",
            ]
            with patch.object(sys, "argv", argv), patch.object(collector, "run_twitter_search", fake_search):
                self.assertEqual(collector.main(), 0)

            payload = json.loads(output.read_text())
            self.assertEqual(payload["source"], "agent-reach/x")
            self.assertEqual(payload["total_items"], 1)
            self.assertEqual(payload["items"][0]["handle"], "PiastriNews")

    def test_run_twitter_search_falls_back_to_x_web(self):
        def fake_opencli(_opencli_cmd, handle, _per_source):
            return [], {"platform": "x", "handle": handle, "ok": False, "method": "opencli", "error": "bridge unavailable"}

        def fake_cli(_twitter_cmd, handle, _since_date, _per_source, _method="user-posts"):
            return [], {"platform": "x", "handle": handle, "ok": False, "error": "curl: (6) Could not resolve host: x.com"}

        def fake_x_web(handle, _per_source, _curl_cmd="curl"):
            return [
                {
                    "platform": "x",
                    "handle": handle,
                    "id": "222",
                    "text": "Fallback Oscar Piastri update",
                    "created_at": "2026-06-27T10:00:00Z",
                    "kind": "post",
                }
            ], {"platform": "x", "handle": handle, "ok": True, "method": "x-web", "items": 1}

        with patch.object(collector, "run_opencli_tweets", fake_opencli), patch.object(collector, "run_twitter_cli_search", fake_cli), patch.object(collector, "run_x_web_search", fake_x_web):
            items, status = collector.run_twitter_search("twitter", "PiastriNews", "2026-06-24", 5)

        self.assertEqual(items[0]["id"], "222")
        self.assertTrue(status["ok"])
        self.assertEqual(status["method"], "x-web")
        self.assertIn("fallback_from", status)

    def test_run_twitter_search_prefers_opencli(self):
        opencli_item = {
            "platform": "x",
            "handle": "PiastriNews",
            "id": "333",
            "text": "OpenCLI Oscar Piastri update",
            "created_at": "2026-06-27T10:00:00Z",
            "kind": "post",
            "image_url": "https://pbs.twimg.com/media/oscar.jpg",
        }

        with patch.object(
            collector,
            "run_opencli_tweets",
            return_value=([opencli_item], {"platform": "x", "handle": "PiastriNews", "ok": True, "method": "opencli", "items": 1}),
        ), patch.object(collector, "run_x_web_search") as x_web, patch.object(collector, "run_twitter_cli_search") as twitter_cli:
            items, status = collector.run_twitter_search("twitter", "PiastriNews", "2026-06-24", 5)

        self.assertEqual(items[0]["image_url"], "https://pbs.twimg.com/media/oscar.jpg")
        self.assertEqual(status["method"], "opencli")
        x_web.assert_not_called()
        twitter_cli.assert_not_called()

    def test_loads_agent_reach_twitter_env(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            config = Path(tmpdir) / "config.yaml"
            config.write_text("twitter_auth_token: token-value\ntwitter_ct0: ct0-value\n")

            env = collector.load_agent_reach_twitter_env(config)

            self.assertEqual(env["TWITTER_AUTH_TOKEN"], "token-value")
            self.assertEqual(env["TWITTER_CT0"], "ct0-value")

    def test_load_x_auth_reads_agent_reach_config(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            config = Path(tmpdir) / "config.yaml"
            config.write_text("twitter_auth_token: token-value\ntwitter_ct0: ct0-value\n")

            auth_token, ct0, cookie_string = collector.load_x_auth(config)

            self.assertEqual(auth_token, "token-value")
            self.assertEqual(ct0, "ct0-value")
            self.assertIsNone(cookie_string)


if __name__ == "__main__":
    unittest.main()
