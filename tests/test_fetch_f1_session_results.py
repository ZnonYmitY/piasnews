import io
import json
import unittest
import urllib.error
from datetime import datetime, timedelta, timezone

from scripts import fetch_f1_session_results as fetcher


NOW = datetime(2026, 9, 4, 12, 0, tzinfo=timezone.utc)
CALENDAR = {"races": [{
    "id": "2026-round-13",
    "season": 2026,
    "name": "Italian Grand Prix",
    "name_zh": "意大利大奖赛",
    "country": "Italy",
    "sessions": {
        "practice_1": "2026-09-04T10:30:00Z",
        "practice_2": "2026-09-04T14:00:00Z",
    },
}]}


def collected_result(**overrides):
    """A synthetic, previously collected provider record, not a new fetch."""
    result = {
        "session_ref": "2026-round-12:race", "race_id": "2026-round-12",
        "race_name": "Previous Grand Prix", "race_name_zh": "上一站大奖赛",
        "session": "race", "session_name": "Race", "session_key": 11299,
        "session_start": "2026-08-30T13:00:00Z", "session_end": "2026-08-30T15:00:00Z",
        "driver_number": 81, "position": 6, "status": "classified", "dnf": False, "dns": False, "dsq": False,
        "number_of_laps": 70, "gap_to_leader": 8.25, "duration": 7200,
        "source": "OpenF1", "source_url": "https://api.openf1.org/v1/session_result?session_key=11299&driver_number=81",
        "fetched_at": "2026-08-30T15:30:00Z", "first_ranked_at": "2026-08-30T15:30:00Z",
    }
    result.update(overrides)
    if "session_key" in overrides and "source_url" not in overrides:
        result["source_url"] = fetcher.openf1_url("session_result", session_key=result["session_key"], driver_number=81)
    return result


def successful_practice_fetch(url):
    if "/sessions?" in url:
        return [{"session_key": 11354, "date_start": "2026-09-04T10:30:00Z", "date_end": "2026-09-04T11:30:00Z"}]
    return [{"position": 11, "driver_number": 81, "number_of_laps": 26}]


STATIC_SESSION_PATH = "2026/2026-09-06_Italian_Grand_Prix/2026-09-04_Practice_1/"


def json_stream(*messages):
    return "\n".join(f"00:00:{index:02d}.000{json.dumps(message)}" for index, message in enumerate(messages))


def static_timing_fetch(url, *, finished=True, positions=None):
    positions = positions or {"4": "1", "81": "2", "1": "3"}
    if url.endswith("/Index.json"):
        return {"Year": 2026, "Meetings": [{"Sessions": [{
            "Key": 11354,
            "Name": "Practice 1",
            "StartDate": "2026-09-04T12:30:00",
            "EndDate": "2026-09-04T13:30:00",
            "GmtOffset": "02:00:00",
            "Path": STATIC_SESSION_PATH,
        }]}]}
    if url.endswith("/SessionStatus.jsonStream"):
        return json_stream(
            {"Status": "Started", "Started": "Started"},
            {"Status": "Finished", "Started": "Finished" if finished else "Started"},
        )
    if url.endswith("/DriverList.jsonStream"):
        return json_stream({
            "1": {"RacingNumber": "1", "Tla": "NOR"},
            "4": {"RacingNumber": "4", "Tla": "VER"},
            "81": {"RacingNumber": "81", "Tla": "PIA"},
        })
    if url.endswith("/TimingData.jsonStream"):
        return json_stream({"Lines": {
            number: {
                "RacingNumber": number,
                "Position": position,
                "NumberOfLaps": "24" if number == "81" else "25",
            }
            for number, position in positions.items()
        }})
    raise AssertionError(f"Unexpected URL: {url}")


class FakeResponse:
    def __init__(self, payload):
        self.body = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self):
        return self.body


class SessionResultFetchTests(unittest.TestCase):
    def test_client_keeps_anonymous_mode_when_public_request_succeeds(self):
        requests = []

        def fake_open(request, timeout):
            self.assertEqual(timeout, 20)
            requests.append(request)
            return FakeResponse([{"session_key": 11356}])

        client = fetcher.OpenF1Client("user@example.com", "secret", opener=fake_open)

        payload = client.fetch_json("https://api.openf1.org/v1/sessions?year=2026")

        self.assertEqual(payload, [{"session_key": 11356}])
        self.assertEqual(client.authentication, "anonymous")
        self.assertEqual(len(requests), 1)
        self.assertIsNone(requests[0].get_header("Authorization"))

    def test_client_upgrades_to_oauth_after_live_access_401(self):
        requests = []

        def fake_open(request, timeout):
            self.assertEqual(timeout, 20)
            requests.append(request)
            if request.full_url == fetcher.OPENF1_TOKEN_URL:
                self.assertEqual(request.get_header("Content-type"), "application/x-www-form-urlencoded")
                self.assertEqual(request.data.decode("utf-8"), "username=user%40example.com&password=s%26e%2Bcret")
                return FakeResponse({"access_token": "temporary-token", "expires_in": "3600"})
            if len(requests) == 1:
                raise urllib.error.HTTPError(
                    request.full_url,
                    401,
                    "Unauthorized",
                    None,
                    io.BytesIO(json.dumps({
                        "detail": "Live F1 session in progress. Global API access is restricted."
                    }).encode("utf-8")),
                )
            self.assertEqual(request.get_header("Authorization"), "Bearer temporary-token")
            return FakeResponse([{"session_key": 11356}])

        client = fetcher.OpenF1Client("user@example.com", "s&e+cret", opener=fake_open)

        payload = client.fetch_json("https://api.openf1.org/v1/sessions?year=2026")

        self.assertEqual(payload, [{"session_key": 11356}])
        self.assertEqual(client.authentication, "oauth")
        self.assertEqual([request.full_url for request in requests], [
            "https://api.openf1.org/v1/sessions?year=2026",
            fetcher.OPENF1_TOKEN_URL,
            "https://api.openf1.org/v1/sessions?year=2026",
        ])

    def test_anonymous_live_401_has_safe_actionable_error(self):
        def fake_open(request, timeout):
            self.assertEqual(timeout, 20)
            raise urllib.error.HTTPError(
                request.full_url,
                401,
                "Unauthorized",
                None,
                io.BytesIO(json.dumps({
                    "detail": "Live F1 session in progress. Global API access is restricted."
                }).encode("utf-8")),
            )

        client = fetcher.OpenF1Client(opener=fake_open)

        with self.assertRaises(fetcher.OpenF1RequestError) as raised:
            client.fetch_json("https://api.openf1.org/v1/sessions?year=2026")

        self.assertEqual(raised.exception.code, "openf1_http_401_live_access_requires_auth")
        self.assertEqual(client.authentication, "anonymous")

    def test_partial_credentials_do_not_send_token_request(self):
        requests = []

        def fake_open(request, timeout):
            self.assertEqual(timeout, 20)
            requests.append(request)
            raise urllib.error.HTTPError(
                request.full_url,
                401,
                "Unauthorized",
                None,
                io.BytesIO(json.dumps({"detail": "Live F1 session in progress"}).encode("utf-8")),
            )

        client = fetcher.OpenF1Client("user@example.com", "", opener=fake_open)

        with self.assertRaises(fetcher.OpenF1RequestError) as raised:
            client.fetch_json("https://api.openf1.org/v1/sessions?year=2026")

        self.assertEqual(raised.exception.code, "openf1_auth_config_incomplete")
        self.assertEqual(len(requests), 1)

    def test_bearer_token_is_rejected_for_non_openf1_target(self):
        client = fetcher.OpenF1Client(opener=lambda *_args, **_kwargs: self.fail("network should not be called"))
        client.access_token = "temporary-token"

        with self.assertRaises(fetcher.OpenF1RequestError) as raised:
            client.fetch_json("https://example.com/data")

        self.assertEqual(raised.exception.code, "openf1_auth_target_rejected")

    def test_token_failure_does_not_leak_credentials(self):
        def fake_open(request, timeout):
            self.assertEqual(timeout, 20)
            detail = "Live F1 session in progress" if request.full_url != fetcher.OPENF1_TOKEN_URL else "bad password"
            raise urllib.error.HTTPError(
                request.full_url,
                401,
                "Unauthorized",
                None,
                io.BytesIO(json.dumps({"detail": detail}).encode("utf-8")),
            )

        client = fetcher.OpenF1Client("user@example.com", "top-secret", opener=fake_open)

        with self.assertRaises(fetcher.OpenF1RequestError) as raised:
            client.fetch_json("https://api.openf1.org/v1/sessions?year=2026")

        self.assertEqual(raised.exception.code, "openf1_auth_http_401")
        self.assertNotIn("user@example.com", str(raised.exception))
        self.assertNotIn("top-secret", str(raised.exception))

    def test_authenticated_401_stops_after_one_bearer_retry(self):
        requests = []

        def fake_open(request, timeout):
            self.assertEqual(timeout, 20)
            requests.append(request)
            if request.full_url == fetcher.OPENF1_TOKEN_URL:
                return FakeResponse({"access_token": "temporary-token", "expires_in": "3600"})
            raise urllib.error.HTTPError(
                request.full_url,
                401,
                "Unauthorized",
                None,
                io.BytesIO(json.dumps({"detail": "Live F1 session in progress"}).encode("utf-8")),
            )

        client = fetcher.OpenF1Client("user@example.com", "secret", opener=fake_open)

        with self.assertRaises(fetcher.OpenF1RequestError) as raised:
            client.fetch_json("https://api.openf1.org/v1/sessions?year=2026")

        self.assertEqual(raised.exception.code, "openf1_auth_rejected")
        self.assertEqual(len(requests), 3)

    def test_fetches_latest_completed_session_result(self):
        seen = []

        def fake_fetch(url):
            seen.append(url)
            if "/sessions?" in url:
                return [{
                    "session_key": 11354,
                    "session_name": "Practice 1",
                    "date_start": "2026-09-04T10:30:00+00:00",
                    "date_end": "2026-09-04T11:30:00+00:00",
                }]
            return [{
                "position": 11,
                "driver_number": 81,
                "number_of_laps": 26,
                "dnf": False,
                "dns": False,
                "dsq": False,
                "gap_to_leader": 1.176,
            }]

        payload = fetcher.build_payload(CALENDAR, {}, now=NOW, fetcher=fake_fetch)

        self.assertTrue(payload["result_available"])
        self.assertEqual(payload["latest"]["session_ref"], "2026-round-13:practice_1")
        self.assertEqual(payload["latest"]["position"], 11)
        self.assertEqual(payload["latest"]["first_ranked_at"], "2026-09-04T12:00:00Z")
        self.assertIn("session_name=Practice+1", seen[0])
        self.assertIn("driver_number=81", seen[1])

    def test_falls_back_to_finished_f1_static_timing_after_openf1_401(self):
        seen = []

        def fake_fetch(url):
            seen.append(url)
            if url.startswith(fetcher.OPENF1_BASE_URL):
                raise fetcher.OpenF1RequestError("openf1_http_401_live_access_requires_auth", status=401)
            return static_timing_fetch(url)

        payload = fetcher.build_payload(CALENDAR, {}, now=NOW, fetcher=fake_fetch)

        self.assertTrue(payload["result_available"])
        self.assertEqual(payload["latest"]["source"], "Formula 1 Live Timing")
        self.assertTrue(payload["latest"]["provisional"])
        self.assertEqual(payload["latest"]["position"], 2)
        self.assertEqual(payload["latest"]["number_of_laps"], 24)
        self.assertEqual(payload["latest"]["session_key"], 11354)
        self.assertEqual(payload["latest"]["session_end"], "2026-09-04T11:30:00Z")
        self.assertEqual(payload["results"], [payload["latest"]], "The fallback URL must pass history validation.")
        self.assertIn(f"{fetcher.F1_STATIC_BASE_URL}/2026/Index.json", seen)
        self.assertTrue(payload["latest"]["source_url"].endswith("/TimingData.jsonStream"))

    def test_falls_back_when_openf1_result_is_still_missing(self):
        def fake_fetch(url):
            if "/sessions?" in url:
                return [{"session_key": 11354, "date_start": "2026-09-04T10:30:00Z"}]
            if "/session_result?" in url:
                return []
            return static_timing_fetch(url)

        payload = fetcher.build_payload(CALENDAR, {}, now=NOW, fetcher=fake_fetch)

        self.assertTrue(payload["result_available"])
        self.assertEqual(payload["latest"]["source"], "Formula 1 Live Timing")
        self.assertTrue(payload["latest"]["provisional"])

    def test_f1_static_rejects_unfinished_or_inconsistent_timing(self):
        race = CALENDAR["races"][0]
        expected_start = fetcher.parse_time(race["sessions"]["practice_1"])
        cases = {
            "unfinished": lambda url: static_timing_fetch(url, finished=False),
            "duplicate_positions": lambda url: static_timing_fetch(
                url, positions={"4": "1", "81": "1", "1": "3"}
            ),
            "gapped_positions": lambda url: static_timing_fetch(
                url, positions={"4": "1", "81": "2", "1": "4"}
            ),
        }
        expected_errors = {
            "unfinished": "f1_static_session_not_finished",
            "duplicate_positions": "f1_static_result_invalid",
            "gapped_positions": "f1_static_result_invalid",
        }
        for name, static_fetch in cases.items():
            with self.subTest(name=name):
                result, error = fetcher.fetch_f1_static_result(
                    race,
                    "practice_1",
                    ref="2026-round-13:practice_1",
                    expected_start=expected_start,
                    now=NOW,
                    fetcher=static_fetch,
                )
                self.assertIsNone(result)
                self.assertEqual(error, expected_errors[name])

    def test_openf1_result_wins_without_requesting_static_fallback(self):
        seen = []

        def fake_fetch(url):
            seen.append(url)
            if url.startswith(fetcher.F1_STATIC_BASE_URL):
                self.fail("Formula 1 fallback must not be queried after an OpenF1 success.")
            return successful_practice_fetch(url)

        payload = fetcher.build_payload(CALENDAR, {}, now=NOW, fetcher=fake_fetch)

        self.assertTrue(payload["result_available"])
        self.assertEqual(payload["latest"]["source"], "OpenF1")
        self.assertFalse(payload["latest"]["provisional"])
        self.assertEqual(len(seen), 2)

    def test_pending_result_keeps_previous_and_can_be_retried(self):
        previous = {"latest": {"session_ref": "2026-round-12:race", "position": 6}}

        payload = fetcher.build_payload(CALENDAR, previous, now=NOW, fetcher=lambda _url: [])

        self.assertFalse(payload["result_available"])
        self.assertEqual(payload["attempted_session_ref"], "2026-round-13:practice_1")
        self.assertEqual(payload["latest"], previous["latest"])
        self.assertEqual(payload["last_error"], "openf1_session_missing")

    def test_actionable_openf1_error_is_preserved_in_payload(self):
        previous = {"latest": {"session_ref": "2026-round-12:race", "position": 6}}

        def blocked(_url):
            raise fetcher.OpenF1RequestError("openf1_http_401_live_access_requires_auth", status=401)

        payload = fetcher.build_payload(CALENDAR, previous, now=NOW, fetcher=blocked)

        self.assertFalse(payload["result_available"])
        self.assertEqual(payload["last_error"], "openf1_http_401_live_access_requires_auth")
        self.assertEqual(payload["latest"], previous["latest"])

    def test_status_flags_take_precedence_over_position(self):
        self.assertEqual(fetcher.result_status({"position": 20, "dnf": True}), "DNF")
        self.assertEqual(fetcher.result_status({"position": None, "dns": True}), "DNS")
        self.assertEqual(fetcher.result_status({"position": None, "dsq": True}), "DSQ")

    def test_numeric_string_position_is_normalized(self):
        self.assertEqual(fetcher.result_position({"position": "11"}), 11)
        self.assertIsNone(fetcher.result_position({"position": "P11"}))

    def test_refetching_the_same_result_does_not_reset_ranked_time(self):
        previous = {
            "latest": {
                "session_ref": "2026-round-13:practice_1",
                "fetched_at": "2026-09-04T11:45:00Z",
            },
        }

        def fake_fetch(url):
            if "/sessions?" in url:
                return [{"session_key": 11354, "date_start": "2026-09-04T10:30:00Z"}]
            return [{"position": 11, "driver_number": 81}]

        payload = fetcher.build_payload(CALENDAR, previous, now=NOW, fetcher=fake_fetch)

        self.assertEqual(payload["latest"]["first_ranked_at"], "2026-09-04T11:45:00Z")

    def test_legacy_latest_migrates_without_using_failed_fetch_time(self):
        old = collected_result()
        old.pop("first_ranked_at")
        previous = {"schema_version": 1, "latest": old}
        before = json.dumps(previous, sort_keys=True)

        payload = fetcher.build_payload(CALENDAR, previous, now=NOW, fetcher=lambda _url: [])

        self.assertEqual(payload["schema_version"], 1)
        self.assertFalse(payload["result_available"])
        self.assertEqual(payload["latest"], old)
        self.assertEqual(len(payload["results"]), 1)
        self.assertEqual(payload["results"][0]["fetched_at"], "2026-08-30T15:30:00Z")
        self.assertEqual(payload["results"][0]["first_ranked_at"], "2026-08-30T15:30:00Z")
        self.assertNotEqual(payload["results"][0]["fetched_at"], payload["generated_at"])
        self.assertEqual(json.dumps(previous, sort_keys=True), before)

    def test_new_practice_preserves_previous_race_and_other_collected_sessions(self):
        previous_race = collected_result()
        previous_qualifying = collected_result(
            session_ref="2026-round-12:qualifying", session="qualifying", session_name="Qualifying",
            session_key=11298,
            session_start="2026-08-29T13:00:00Z", session_end="2026-08-29T14:00:00Z",
            fetched_at="2026-08-29T14:30:00Z", first_ranked_at="2026-08-29T14:30:00Z",
        )
        previous = {"latest": previous_race, "results": [previous_qualifying, previous_race]}
        seen = []

        def fake_fetch(url):
            seen.append(url)
            return successful_practice_fetch(url)

        payload = fetcher.build_payload(CALENDAR, previous, now=NOW, fetcher=fake_fetch)

        self.assertEqual(len(seen), 2, "Archiving adds no provider calls.")
        self.assertTrue(payload["result_available"])
        self.assertEqual(payload["latest"]["session_ref"], "2026-round-13:practice_1")
        self.assertEqual([record["session_ref"] for record in payload["results"]], [
            "2026-round-13:practice_1", "2026-round-12:race", "2026-round-12:qualifying",
        ])
        self.assertEqual(payload["results"][1], previous_race)
        self.assertEqual(payload["results"][0], payload["latest"])

    def test_same_session_provider_revision_replaces_position_and_keeps_first_appearance(self):
        previous = fetcher.build_payload(CALENDAR, {}, now=NOW, fetcher=successful_practice_fetch)
        first_seen = previous["latest"]["first_ranked_at"]

        def corrected_fetch(url):
            if "/sessions?" in url:
                return successful_practice_fetch(url)
            return [{"position": 10, "driver_number": 81, "number_of_laps": 27}]

        for later in (NOW, NOW + timedelta(minutes=10)):
            with self.subTest(observed_at=later):
                revised = fetcher.build_payload(CALENDAR, previous, now=later, fetcher=corrected_fetch)

                self.assertEqual(len(revised["results"]), 1)
                self.assertEqual(revised["results"][0]["position"], 10)
                self.assertEqual(revised["results"][0]["number_of_laps"], 27)
                self.assertEqual(revised["results"][0]["first_ranked_at"], first_seen)
                self.assertEqual(revised["latest"]["first_ranked_at"], first_seen)
                self.assertEqual(revised["results"][0]["fetched_at"], fetcher.isoformat(later))
                self.assertEqual(previous["results"][0]["position"], 11, "Do not mutate the older snapshot.")

    def test_refetching_archived_session_keeps_first_ranked_time_after_latest_changed(self):
        first = fetcher.build_payload(CALENDAR, {}, now=NOW, fetcher=successful_practice_fetch)
        previous = {"latest": collected_result(), "results": first["results"]}

        payload = fetcher.build_payload(CALENDAR, previous, now=NOW + timedelta(minutes=10), fetcher=successful_practice_fetch)

        self.assertEqual(payload["latest"]["first_ranked_at"], fetcher.isoformat(NOW))
        self.assertEqual(payload["results"][0]["first_ranked_at"], fetcher.isoformat(NOW))
        self.assertEqual(len(payload["results"]), 2)

    def test_failed_refresh_preserves_archive_without_inventing_missing_sessions(self):
        old = collected_result()
        previous = {"latest": old, "results": [old]}

        def failed(_url):
            raise fetcher.OpenF1RequestError("openf1_network_unavailable")

        payload = fetcher.build_payload(CALENDAR, previous, now=NOW, fetcher=failed)

        self.assertFalse(payload["result_available"])
        self.assertEqual(payload["results"], [old])
        self.assertEqual(payload["latest"], old)
        self.assertEqual(payload["last_error"], "openf1_network_unavailable")
        self.assertNotIn(payload["attempted_session_ref"], [record["session_ref"] for record in payload["results"]])
        empty = fetcher.build_payload(CALENDAR, {}, now=NOW, fetcher=failed)
        self.assertEqual(empty["results"], [])

    def test_dedup_does_not_roll_back_newer_archive_to_stale_legacy_latest(self):
        old = collected_result()
        for fetched_at in (old["fetched_at"], "2026-08-31T09:00:00Z"):
            with self.subTest(archive_observed_at=fetched_at):
                revised = collected_result(position=5, fetched_at=fetched_at)
                previous = {"results": [revised, old], "latest": old}

                payload = fetcher.build_payload(CALENDAR, previous, now=NOW, fetcher=lambda _url: [])

                self.assertEqual(payload["latest"], old, "Keep the established failed-latest fallback contract.")
                self.assertEqual(payload["results"], [revised])

    def test_invalid_or_non_oscar_records_are_not_archived(self):
        bad = [None, "not a record", {"session_ref": "missing-metadata:race", "position": 1}]
        for changes in [
            {"driver_number": 4}, {"driver_number": "81"}, {"session": []}, {"session": "race_live"},
            {"session_ref": "wrong-session:qualifying"}, {"session_start": "not-a-date"},
            {"session_start": "2026-09-05T10:00:00Z"}, {"session_end": "2026-09-05T12:00:00Z"},
            {"fetched_at": "2026-09-05T13:00:00Z"}, {"fetched_at": None},
            {"position": True}, {"position": 99}, {"position": None}, {"number_of_laps": -1},
            {"source_url": "https://api.openf1.org.attacker.example/v1/session_result?driver_number=81"},
            {"source_url": "https://api.openf1.org/v1/session_result?session_key=11299&driver_number=4"},
            {"source_url": "https://api.openf1.org/v1/session_result?session_key=11111&driver_number=81"},
            {"source_url": "https://secret:password@api.openf1.org/v1/session_result?session_key=11299&driver_number=81"},
        ]:
            bad.append(collected_result(**changes))
        good = collected_result(position=None, dnf=True, status="DNF")

        payload = fetcher.build_payload(CALENDAR, {"results": bad + [good]}, now=NOW, fetcher=lambda _url: [])

        self.assertEqual(payload["results"], [good])
        malformed = fetcher.build_payload(CALENDAR, {"results": "invalid", "latest": None}, now=NOW, fetcher=lambda _url: [])
        self.assertEqual(malformed["results"], [])

    def test_archive_is_capped_at_160_newest_session_starts(self):
        records = []
        for index in range(170):
            start = NOW - timedelta(days=index + 2)
            records.append(collected_result(
                session_ref=f"synthetic-{index}:race", session_key=10000 + index, session_start=fetcher.isoformat(start),
                session_end=fetcher.isoformat(start + timedelta(hours=2)),
                fetched_at=fetcher.isoformat(start + timedelta(hours=3)),
                first_ranked_at=fetcher.isoformat(start + timedelta(hours=3)),
            ))
        previous = {"results": list(reversed(records)), "latest": records[-1]}

        payload = fetcher.build_payload({"races": []}, previous, now=NOW, fetcher=lambda _url: self.fail("No provider request is needed."))

        self.assertFalse(payload["result_available"])
        self.assertEqual(len(payload["results"]), 160)
        self.assertEqual(payload["results"], records[:160])
        self.assertEqual(len(previous["results"]), 170)


if __name__ == "__main__":
    unittest.main()
