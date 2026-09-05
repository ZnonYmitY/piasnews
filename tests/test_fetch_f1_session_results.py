import io
import json
import unittest
import urllib.error
from datetime import datetime, timezone

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


if __name__ == "__main__":
    unittest.main()
