import argparse
import json
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import build_hot_events as builder  # noqa: E402


NOW = "2026-08-25T12:00:00Z"


def social_item(item_id, text, *, official=False, source="@fan", likes=1000, image_url=None):
    item = {
        "id": item_id,
        "title": text,
        "summary": text,
        "summary_zh": text,
        "url": f"https://x.com/example/status/{item_id}",
        "source": source,
        "source_type": "x",
        "source_role": "official_driver" if official else "fan_account",
        "official": official,
        "published_at": "2026-08-25T10:00:00Z",
        "metrics": {"likes": likes, "retweets": 10, "quotes": 2, "replies": 4, "views": 5000},
    }
    if image_url:
        item["image_url"] = image_url
    return item


class HotEventBuildTest(unittest.TestCase):
    def build(self, items, social, overrides=None, previous=None, calendar=None, refresh_reason=""):
        with tempfile.TemporaryDirectory() as tmpdir:
            temp = Path(tmpdir)
            paths = {
                "items": temp / "items.json",
                "social": temp / "social.json",
                "overrides": temp / "overrides.json",
                "previous": temp / "previous.json",
                "calendar": temp / "calendar.json",
                "output": temp / "hot.json",
            }
            paths["items"].write_text(json.dumps({"items": items}))
            paths["social"].write_text(json.dumps({"items": social}))
            paths["overrides"].write_text(json.dumps(overrides or {"changes": []}))
            paths["previous"].write_text(json.dumps(previous or {"events": []}))
            paths["calendar"].write_text(json.dumps(calendar or {"races": []}))
            args = argparse.Namespace(
                items=str(paths["items"]),
                social=str(paths["social"]),
                calendar=str(paths["calendar"]),
                config=str(ROOT / "config" / "hot-ranking.json"),
                overrides=str(paths["overrides"]),
                previous=str(paths["previous"]),
                output=str(paths["output"]),
                now=NOW,
                refresh_reason=refresh_reason,
            )
            return builder.build(args)

    def test_turtle_shark_case_uses_objective_hot_word(self):
        payload = self.build([], [social_item(
            "turtle",
            "Oscar mimes a turtle and a shark in a behind-the-scenes video",
            likes=9000,
            image_url="https://example.com/turtle-shark.jpg",
        )])
        event = payload["events"][0]
        self.assertEqual(event["event_id"], "evt-oscar-turtle-shark-gesture")
        self.assertEqual(event["hot_word_zh"], "Oscar 在花絮视频中比划乌龟和鲨鱼")
        self.assertEqual(event["source_labels"], ["粉"])
        self.assertEqual(event["items"][0]["image_url"], "https://example.com/turtle-shark.jpg")

    def test_vague_short_post_without_media_is_held_for_review(self):
        payload = self.build([], [social_item("vague", "i'm never leaving this app", likes=9000)])
        self.assertEqual(payload["events"], [])
        self.assertEqual(payload["review_needed_count"], 1)
        event = payload["review_needed_events"][0]
        self.assertTrue(event["review_needed"])
        self.assertNotEqual(event["hot_word_zh"], "Oscar 在花絮视频中比划乌龟和鲨鱼")

    def test_active_editorial_content_can_release_media_review_event(self):
        source = social_item("vague", "i'm never leaving this app", likes=9000)
        initial = self.build([], [source])
        event_id = initial["review_needed_events"][0]["event_id"]
        content = {
            "item_id": "manual-turtle-video",
            "dataset": "manual",
            "source_type": "fan",
            "source": "@fan",
            "title_zh": "Oscar 在花絮视频中比划乌龟和鲨鱼",
            "title": "Oscar mimes a turtle and a shark",
            "url": "https://x.com/fan/status/vague",
            "video_url": "https://video.example.com/turtle-shark.mp4",
            "video_poster_url": "https://img.example.com/turtle-shark.jpg",
        }
        overrides = {"changes": [{
            "event_id": event_id,
            "status": "active",
            "hot_word_zh": "Oscar 在花絮视频中比划乌龟和鲨鱼",
            "source_labels": ["粉"],
            "content_items": [content],
            "hidden": False,
        }]}
        payload = self.build([], [source], overrides=overrides, previous=initial)
        self.assertEqual(payload["review_needed_count"], 0)
        self.assertEqual(payload["events"][0]["items"][0]["video_url"], content["video_url"])

    def test_official_media_and_fan_items_share_one_event_id(self):
        items = [{
            "id": "official-pace",
            "title": "Piastri has no answers over lack of pace",
            "title_zh": "Oscar 回应速度不足",
            "url": "https://formula1.com/example",
            "source": "Formula 1",
            "official": True,
            "published_at": "2026-08-25T09:00:00Z",
        }]
        social = [social_item("fan-pace", "Oscar says the issue was a lack of pace", likes=1200)]
        payload = self.build(items, social)
        event = next(row for row in payload["events"] if row["event_id"] == "evt-dutch-gp-pace-loss")
        self.assertEqual(set(event["source_labels"]), {"官", "粉"})
        self.assertEqual(len(event["items"]), 2)

    def test_active_override_changes_display_without_changing_event_id(self):
        event_id = "evt-oscar-turtle-shark-gesture"
        overrides = {"changes": [{
            "event_id": event_id,
            "status": "active",
            "hot_word_zh": "Oscar 在幕后游戏中比划乌龟和鲨鱼",
            "source_labels": ["官", "粉"],
            "heat": 88,
            "pinned_rank": 1,
            "hidden": False,
        }]}
        payload = self.build([], [social_item("turtle", "Oscar mimes a turtle and a shark")], overrides)
        event = payload["events"][0]
        self.assertEqual(event["event_id"], event_id)
        self.assertEqual(event["hot_word_zh"], "Oscar 在幕后游戏中比划乌龟和鲨鱼")
        self.assertEqual(event["heat"], 88)
        self.assertEqual(event["rank"], 1)

    def test_manual_rank_one_overrides_session_result_hard_rule(self):
        manual = {
            "event_id": "evt-manual-editorial",
            "heat": 20,
            "pinned_rank": 1,
            "override": {"updated_at": "2026-08-27T08:00:00Z"},
        }
        session = {
            "event_id": "evt-session-result",
            "heat": 100,
            "pinned_rank": None,
            "hard_rule": {"type": "session_result"},
        }
        ranked = builder.rank_events([session, manual], 15)
        self.assertEqual([row["event_id"] for row in ranked], ["evt-manual-editorial", "evt-session-result"])

    def test_manual_rank_uses_exact_available_position(self):
        events = [
            {"event_id": "evt-hot", "heat": 90, "pinned_rank": None},
            {"event_id": "evt-second", "heat": 10, "pinned_rank": 2, "override": {"updated_at": "2026-08-27T08:00:00Z"}},
            {"event_id": "evt-warm", "heat": 70, "pinned_rank": None},
        ]
        ranked = builder.rank_events(events, 15)
        self.assertEqual([row["event_id"] for row in ranked], ["evt-hot", "evt-second", "evt-warm"])

    def test_newest_override_wins_same_manual_rank(self):
        events = [
            {"event_id": "evt-old", "heat": 80, "pinned_rank": 1, "override": {"updated_at": "2026-08-27T07:00:00Z"}},
            {"event_id": "evt-new", "heat": 70, "pinned_rank": 1, "override": {"updated_at": "2026-08-27T08:00:00Z"}},
        ]
        ranked = builder.rank_events(events, 15)
        self.assertEqual([row["event_id"] for row in ranked], ["evt-new", "evt-old"])

    def test_draft_override_does_not_change_public_event(self):
        overrides = {"changes": [{
            "event_id": "evt-oscar-turtle-shark-gesture",
            "status": "draft",
            "hot_word_zh": "不应公开",
        }]}
        payload = self.build([], [social_item("turtle", "Oscar mimes a turtle and a shark")], overrides)
        self.assertEqual(payload["events"][0]["hot_word_zh"], "Oscar 在花絮视频中比划乌龟和鲨鱼")

    def test_completed_session_result_is_named_and_hard_pinned_first(self):
        items = [{
            "id": "race-result",
            "title": "Oscar Piastri finished sixth in the Dutch Grand Prix after a lack of pace",
            "title_zh": "Oscar 在荷兰大奖赛遭遇速度不足",
            "url": "https://example.com/race-result",
            "source": "Example Media",
            "official": False,
            "published_at": "2026-08-25T11:00:00Z",
        }]
        calendar = {"races": [{
            "id": "2026-round-12",
            "name": "Dutch Grand Prix",
            "name_zh": "荷兰大奖赛",
            "sessions": {"race": "2026-08-25T08:00:00Z"},
        }]}
        payload = self.build(
            items,
            [social_item("turtle", "i'm never leaving this app", likes=9000)],
            calendar=calendar,
            refresh_reason="session_completed:2026-round-12:race",
        )
        event = payload["events"][0]
        self.assertEqual(event["hot_word_zh"], "Oscar 在荷兰站正赛获得第6名")
        self.assertEqual(event["hard_rule"]["type"], "session_result")
        self.assertEqual(event["rank"], 1)


if __name__ == "__main__":
    unittest.main()
