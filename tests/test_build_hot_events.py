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
    def build(
        self,
        items,
        social,
        overrides=None,
        previous=None,
        calendar=None,
        session_results=None,
        refresh_reason="",
    ):
        with tempfile.TemporaryDirectory() as tmpdir:
            temp = Path(tmpdir)
            paths = {
                "items": temp / "items.json",
                "social": temp / "social.json",
                "overrides": temp / "overrides.json",
                "previous": temp / "previous.json",
                "calendar": temp / "calendar.json",
                "session_results": temp / "session-results.json",
                "output": temp / "hot.json",
            }
            paths["items"].write_text(json.dumps({"items": items}))
            paths["social"].write_text(json.dumps({"items": social}))
            paths["overrides"].write_text(json.dumps(overrides or {"changes": []}))
            paths["previous"].write_text(json.dumps(previous or {"events": []}))
            paths["calendar"].write_text(json.dumps(calendar or {"races": []}))
            paths["session_results"].write_text(json.dumps(session_results or {"result_available": False, "latest": None}))
            args = argparse.Namespace(
                items=str(paths["items"]),
                social=str(paths["social"]),
                calendar=str(paths["calendar"]),
                session_results=str(paths["session_results"]),
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

    def test_session_result_hard_rule_overrides_manual_rank_one(self):
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
        self.assertEqual([row["event_id"] for row in ranked], ["evt-session-result", "evt-manual-editorial"])

    def test_zero_heat_manual_pin_drops_below_the_normal_threshold(self):
        old = social_item("old-pin", "An old manually pinned Oscar post", likes=9000)
        old["published_at"] = "2026-08-22T10:00:00Z"
        initial = self.build([], [old])
        event_id = initial["events"][0]["event_id"] if initial["events"] else builder.event_id_for(None, old)
        overrides = {"changes": [{
            "event_id": event_id,
            "status": "active",
            "pinned_rank": 1,
            "hidden": False,
        }]}

        payload = self.build([], [old], overrides=overrides)

        self.assertEqual(payload["events"], [])

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

    def test_structured_session_result_is_independent_of_news_and_beats_manual_pin(self):
        calendar = {"races": [{
            "id": "2026-round-13",
            "season": 2026,
            "name": "Italian Grand Prix",
            "name_zh": "意大利大奖赛",
            "sessions": {"practice_1": "2026-08-25T10:30:00Z"},
        }]}
        session_results = {
            "result_available": True,
            "latest": {
                "session_ref": "2026-round-13:practice_1",
                "race_id": "2026-round-13",
                "race_name": "Italian Grand Prix",
                "race_name_zh": "意大利大奖赛",
                "session": "practice_1",
                "position": 11,
                "status": "classified",
                "session_end": "2026-08-25T11:30:00Z",
                "source": "OpenF1",
                "source_url": "https://api.openf1.org/v1/session_result?session_key=11354&driver_number=81",
            },
        }
        manual_source = social_item("manual-pin", "Oscar arrives at Monza", likes=2000)
        initial = self.build([], [manual_source])
        manual_event_id = initial["events"][0]["event_id"]
        overrides = {"changes": [{
            "event_id": manual_event_id,
            "status": "active",
            "pinned_rank": 1,
            "hidden": False,
        }]}

        payload = self.build(
            [],
            [manual_source],
            overrides=overrides,
            calendar=calendar,
            session_results=session_results,
            refresh_reason="manual_dispatch",
        )

        self.assertEqual(payload["events"][0]["hot_word_zh"], "Oscar 在意大利站一练获得第11名")
        self.assertEqual(payload["events"][0]["hard_rule"]["source"], "OpenF1")
        self.assertEqual(payload["events"][0]["rank"], 1)
        self.assertEqual(payload["events"][1]["event_id"], manual_event_id)

    def test_structured_session_result_expires_after_24_hours(self):
        event = builder.structured_session_result_event(
            {
                "result_available": True,
                "latest": {
                    "session_ref": "race-1:practice_2",
                    "race_id": "race-1",
                    "race_name": "Italian Grand Prix",
                    "race_name_zh": "意大利大奖赛",
                    "session": "practice_2",
                    "status": "classified",
                    "position": 6,
                    "session_end": "2026-08-24T12:00:00Z",
                    "first_ranked_at": "2026-08-24T12:00:00Z",
                    "source": "OpenF1",
                },
            },
            {"races": []},
            "manual_dispatch",
            builder.now_time(NOW),
            24,
        )

        self.assertIsNone(event)

    def test_previous_valid_result_stays_visible_while_new_result_is_pending(self):
        event = builder.structured_session_result_event(
            {
                "result_available": False,
                "attempted_session_ref": "race-1:practice_3",
                "latest": {
                    "session_ref": "race-1:practice_2",
                    "race_id": "race-1",
                    "race_name": "Italian Grand Prix",
                    "race_name_zh": "意大利大奖赛",
                    "session": "practice_2",
                    "status": "classified",
                    "position": 6,
                    "session_end": "2026-08-25T11:30:00Z",
                    "first_ranked_at": "2026-08-25T11:45:00Z",
                    "source": "OpenF1",
                },
            },
            {"races": []},
            "session_completed:race-1:practice_3",
            builder.now_time(NOW),
            24,
        )

        self.assertEqual(event["hot_word_zh"], "Oscar 在意大利站二练获得第6名")

    def test_structured_session_result_supports_dnf(self):
        event = builder.structured_session_result_event(
            {
                "result_available": True,
                "latest": {
                    "session_ref": "race-1:race",
                    "race_id": "race-1",
                    "race_name": "Italian Grand Prix",
                    "race_name_zh": "意大利大奖赛",
                    "session": "race",
                    "status": "DNF",
                    "position": None,
                    "session_end": "2026-08-25T11:30:00Z",
                    "source": "OpenF1",
                    "source_url": "https://api.openf1.org/v1/session_result?session_key=1&driver_number=81",
                },
            },
            {"races": []},
            "session_completed:race-1:race",
            builder.now_time(NOW),
        )

        self.assertEqual(event["hot_word_zh"], "Oscar 在意大利站正赛未能完赛（DNF）")


if __name__ == "__main__":
    unittest.main()
