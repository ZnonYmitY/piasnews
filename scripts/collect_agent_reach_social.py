#!/usr/bin/env python3
"""Collect X posts through Agent-Reach's active Twitter backend.

This script is intentionally local-first. It prefers Agent-Reach's OpenCLI
Twitter backend, falls back to the authenticated X Web endpoint when the
browser bridge is unavailable, and keeps twitter-cli as the final fallback.
It writes an import JSON file and leaves normalization and 3-day filtering to
`fetch_social_sources.py`.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import shutil
import subprocess
import sys
import tempfile
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any


DEFAULT_IMPORT_OUTPUT = "/tmp/piasnews-agent-reach-social.json"
DEFAULT_RETENTION_DAYS = 7
DEFAULT_TWITTER_CMD = "twitter"
DEFAULT_OPENCLI_CMD = "opencli"
DEFAULT_CURL_CMD = "curl"
AGENT_REACH_CONFIG = Path.home() / ".agent-reach" / "config.yaml"
X_BEARER_TOKEN = (
    "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs"
    "%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA"
)
X_QUERY_IDS = {
    "UserByScreenName": "qRednkZG-rn1P6b48NINmQ",
    "UserTweets": "E3opETHurmVJflFsUBVuUQ",
}
X_COMMON_FEATURES = {
    "responsive_web_graphql_exclude_directive_enabled": True,
    "verified_phone_label_enabled": False,
    "creator_subscriptions_tweet_preview_api_enabled": True,
    "responsive_web_graphql_timeline_navigation_enabled": True,
    "responsive_web_graphql_skip_user_profile_image_extensions_enabled": False,
    "c9s_tweet_anatomy_moderator_badge_enabled": True,
    "tweetypie_unmention_optimization_enabled": True,
    "responsive_web_edit_tweet_api_enabled": True,
    "graphql_is_translatable_rweb_tweet_is_translatable_enabled": True,
    "view_counts_everywhere_api_enabled": True,
    "longform_notetweets_consumption_enabled": True,
    "responsive_web_twitter_article_tweet_consumption_enabled": True,
    "tweet_awards_web_tipping_enabled": False,
    "longform_notetweets_rich_text_read_enabled": True,
    "longform_notetweets_inline_media_enabled": True,
    "rweb_video_timestamps_enabled": True,
    "responsive_web_media_download_video_enabled": True,
    "freedom_of_speech_not_reach_fetch_enabled": True,
    "standardized_nudges_misinfo": True,
    "responsive_web_enhance_cards_enabled": False,
}
X_USER_FEATURES = {
    "hidden_profile_subscriptions_enabled": True,
    "rweb_tipjar_consumption_enabled": True,
    "responsive_web_graphql_exclude_directive_enabled": True,
    "verified_phone_label_enabled": False,
    "subscriptions_verification_info_is_identity_verified_enabled": True,
    "subscriptions_verification_info_verified_since_enabled": True,
    "highlights_tweets_tab_ui_enabled": True,
    "responsive_web_twitter_article_notes_tab_enabled": True,
    "subscriptions_feature_can_gift_premium": True,
    "creator_subscriptions_tweet_preview_api_enabled": True,
    "responsive_web_graphql_skip_user_profile_image_extensions_enabled": False,
    "responsive_web_graphql_timeline_navigation_enabled": True,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Collect Piasnews X items through Agent-Reach.")
    parser.add_argument("--sources", default="piasnews/references/x-sources.json", help="Piasnews X/IG source config.")
    parser.add_argument("--output", default=DEFAULT_IMPORT_OUTPUT, help="Import JSON output path.")
    parser.add_argument("--days", type=int, default=3, help="Recency window in days.")
    parser.add_argument(
        "--retention-days",
        type=int,
        default=DEFAULT_RETENTION_DAYS,
        help="Days to retain when --update-social merges the existing output.",
    )
    parser.add_argument("--per-source", type=int, default=30, help="Max posts to request per source.")
    parser.add_argument("--group", action="append", help="Optional source group to include, repeatable.")
    parser.add_argument(
        "--backend",
        choices=("auto", "opencli", "x-web", "twitter-cli"),
        default="auto",
        help="X backend. auto tries OpenCLI, authenticated X Web, then twitter-cli.",
    )
    parser.add_argument("--opencli-cmd", default=os.environ.get("PIASNEWS_OPENCLI_CMD", DEFAULT_OPENCLI_CMD))
    parser.add_argument("--twitter-cmd", default=os.environ.get("PIASNEWS_TWITTER_CMD", DEFAULT_TWITTER_CMD))
    parser.add_argument("--curl-cmd", default=os.environ.get("PIASNEWS_CURL_CMD", DEFAULT_CURL_CMD))
    parser.add_argument(
        "--method",
        choices=("user-posts", "search"),
        default="user-posts",
        help="twitter-cli method. user-posts is more stable; search can fail when X changes endpoints.",
    )
    parser.add_argument("--now", help="Override current UTC time, ISO-8601 format.")
    parser.add_argument("--update-social", action="store_true", help="Also update data/social.json after collection.")
    parser.add_argument("--social-output", default="data/social.json", help="Target social JSON when --update-social is set.")
    return parser.parse_args()


def parse_now(value: str | None) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def isoformat(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_datetime(value: Any) -> str | None:
    if not value:
        return None
    text = str(value).strip()
    if not text:
        return None
    candidates = [
        "%a %b %d %H:%M:%S %z %Y",
        "%Y-%m-%d %H:%M:%S%z",
        "%Y-%m-%d %H:%M:%S",
    ]
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        parsed = None
    if parsed is None:
        for fmt in candidates:
            try:
                parsed = datetime.strptime(text, fmt)
                break
            except ValueError:
                continue
    if parsed is None:
        return text
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return isoformat(parsed)


def load_sources(path: Path, groups: set[str] | None) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text())
    sources = []
    for source in payload.get("sources", []):
        if source.get("platform") != "x" or source.get("enabled") is False:
            continue
        if groups and source.get("group") not in groups:
            continue
        sources.append(source)
    return sources


def load_agent_reach_twitter_values(config_path: Path = AGENT_REACH_CONFIG) -> dict[str, str]:
    if not config_path.exists():
        return {}

    values: dict[str, str] = {}
    for raw_line in config_path.read_text().splitlines():
        if ":" not in raw_line or raw_line.lstrip().startswith("#"):
            continue
        key, value = raw_line.split(":", 1)
        key = key.strip()
        value = value.strip().strip("'\"")
        if key in {"twitter_auth_token", "twitter_ct0"} and value:
            values[key] = value
    return values


def load_agent_reach_twitter_env(config_path: Path = AGENT_REACH_CONFIG) -> dict[str, str]:
    """Bridge Agent-Reach's saved X cookies into twitter-cli env vars."""
    if os.environ.get("TWITTER_AUTH_TOKEN") and os.environ.get("TWITTER_CT0"):
        return {}
    values = load_agent_reach_twitter_values(config_path)

    env: dict[str, str] = {}
    if values.get("twitter_auth_token"):
        env["TWITTER_AUTH_TOKEN"] = values["twitter_auth_token"]
    if values.get("twitter_ct0"):
        env["TWITTER_CT0"] = values["twitter_ct0"]
    return env


def load_x_auth(config_path: Path = AGENT_REACH_CONFIG) -> tuple[str | None, str | None, str | None]:
    values = load_agent_reach_twitter_values(config_path)
    cookie_string = os.environ.get("TWITTER_COOKIE_STRING") or os.environ.get("TWITTER_COOKIES")
    auth_token = os.environ.get("TWITTER_AUTH_TOKEN") or values.get("twitter_auth_token")
    ct0 = os.environ.get("TWITTER_CT0") or values.get("twitter_ct0")
    if cookie_string:
        cookie_parts = {}
        for part in cookie_string.split(";"):
            if "=" not in part:
                continue
            key, value = part.strip().split("=", 1)
            cookie_parts[key] = value
        auth_token = auth_token or cookie_parts.get("auth_token")
        ct0 = ct0 or cookie_parts.get("ct0")
    return auth_token, ct0, cookie_string


def tweet_items(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if not isinstance(payload, dict):
        return []
    for key in ("tweets", "items", "data", "results"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]
    return []


def text_from_tweet(tweet: dict[str, Any]) -> str:
    for key in ("text", "full_text", "content", "body"):
        value = tweet.get(key)
        if value:
            return str(value)
    return ""


def id_from_tweet(tweet: dict[str, Any]) -> str:
    for key in ("id", "tweet_id", "id_str", "rest_id"):
        value = tweet.get(key)
        if value:
            return str(value)
    url = str(tweet.get("url") or tweet.get("link") or "")
    return url.rstrip("/").split("/")[-1] if url else ""


def kind_from_tweet(tweet: dict[str, Any]) -> str:
    markers = ("retweeted", "is_retweet", "isRetweet", "is_repost", "repost")
    if any(bool(tweet.get(key)) for key in markers):
        return "repost"
    text = text_from_tweet(tweet).lstrip()
    if text.upper().startswith("RT @"):
        return "repost"
    return "post"


def string_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(row).strip() for row in value if str(row).strip()]
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return []
        if text.startswith("["):
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                parsed = None
            if isinstance(parsed, list):
                return [str(row).strip() for row in parsed if str(row).strip()]
        return [part.strip() for part in text.split(",") if part.strip()]
    return []


def looks_like_video_url(value: str) -> bool:
    lowered = value.lower().split("?", 1)[0]
    return (
        lowered.endswith((".mp4", ".m3u8", ".mov", ".webm"))
        or "video.twimg.com" in lowered
        or "/ext_tw_video/" in lowered
        or "/amplify_video/" in lowered
    )


def media_from_tweet(tweet: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    containers: list[Any] = [
        tweet.get("media"),
        deep_get(tweet, "attachments", "media"),
        deep_get(tweet, "extended_entities", "media"),
        deep_get(tweet, "entities", "media"),
    ]
    media_rows: list[dict[str, Any]] = []
    for value in containers:
        if isinstance(value, dict):
            media_rows.append(value)
        elif isinstance(value, list):
            media_rows.extend(row for row in value if isinstance(row, dict))
    image_url = video_url = video_poster_url = None

    # OpenCLI exposes media as index-aligned URL/poster arrays instead of the
    # original X entities. Preserve the first useful image and video preview.
    media_urls = string_list(tweet.get("media_urls"))
    media_posters = string_list(tweet.get("media_posters"))
    for index, media_url in enumerate(media_urls):
        poster = media_posters[index] if index < len(media_posters) else None
        if looks_like_video_url(media_url):
            video_url = video_url or media_url
            video_poster_url = video_poster_url or poster
        else:
            image_url = image_url or media_url or poster
    for media in media_rows:
        media_type = str(media.get("type") or media.get("media_type") or "").lower()
        preview = str(
            media.get("media_url_https")
            or media.get("preview_image_url")
            or media.get("image_url")
            or ""
        ).strip() or None
        media_url = str(media.get("url") or "").strip() or None
        variants = deep_get(media, "video_info", "variants") or media.get("variants") or []
        mp4_variants = [
            row for row in variants
            if isinstance(row, dict)
            and str(row.get("content_type") or row.get("type") or "").lower() == "video/mp4"
            and row.get("url")
        ]
        if mp4_variants:
            mp4_variants.sort(key=lambda row: parse_int(row.get("bitrate") or row.get("bit_rate")), reverse=True)
            video_url = video_url or str(mp4_variants[0]["url"])
            video_poster_url = video_poster_url or preview
        elif media_type in {"video", "animated_gif"} and media_url:
            video_url = video_url or media_url
            video_poster_url = video_poster_url or preview
        elif media_type in {"photo", "image"} and (preview or media_url):
            image_url = image_url or preview or media_url
        elif preview:
            image_url = image_url or preview
    return image_url, video_url, video_poster_url


class XPageMediaParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.image_url: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "meta" or self.image_url:
            return
        values = {key.lower(): value for key, value in attrs if value is not None}
        field = (values.get("property") or values.get("name") or "").lower()
        if field in {"og:image", "og:image:secure_url", "twitter:image"} and values.get("content"):
            self.image_url = html.unescape(values["content"])


def fetch_x_page_preview(url: str, curl_cmd: str = DEFAULT_CURL_CMD) -> str | None:
    if not url.startswith("https://x.com/"):
        return None
    result = subprocess.run(
        [curl_cmd, "-L", "--fail", "--silent", "--show-error", "--max-time", "20", "-A", "Mozilla/5.0", url],
        text=True,
        capture_output=True,
        check=False,
        timeout=25,
    )
    if result.returncode != 0 or not result.stdout:
        return None
    parser = XPageMediaParser()
    parser.feed(result.stdout)
    return parser.image_url if parser.image_url and parser.image_url.startswith("https://") else None


def enrich_recent_video_posters(
    items: list[dict[str, Any]],
    now: datetime,
    days: int,
    curl_cmd: str = DEFAULT_CURL_CMD,
) -> int:
    cutoff = now - timedelta(days=days)
    targets = []
    for item in items:
        if not item.get("video_url") or item.get("video_poster_url"):
            continue
        created_at = parse_datetime(item.get("created_at"))
        if not created_at:
            continue
        created = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        if created >= cutoff:
            targets.append(item)
    if not targets:
        return 0

    enriched = 0
    with ThreadPoolExecutor(max_workers=min(6, len(targets))) as executor:
        futures = {executor.submit(fetch_x_page_preview, item["url"], curl_cmd): item for item in targets}
        for future in as_completed(futures):
            try:
                poster = future.result()
            except (OSError, subprocess.SubprocessError):
                poster = None
            if poster:
                futures[future]["video_poster_url"] = poster
                enriched += 1
    return enriched


def normalize_raw_tweet(tweet: dict[str, Any], handle: str) -> dict[str, Any] | None:
    tweet_id = id_from_tweet(tweet)
    text = text_from_tweet(tweet)
    created_at = parse_datetime(
        tweet.get("created_at")
        or tweet.get("createdAtISO")
        or tweet.get("createdAt")
        or tweet.get("date")
        or tweet.get("time")
    )
    if not tweet_id or not text or not created_at:
        return None
    author_value = tweet.get("author")
    author = author_value if isinstance(author_value, dict) else {}
    author_handle = str(
        author.get("screenName")
        or author.get("username")
        or (author_value if isinstance(author_value, str) else "")
        or handle
    ).lstrip("@")
    url = str(tweet.get("url") or tweet.get("link") or f"https://x.com/{author_handle}/status/{tweet_id}")
    raw_metrics = tweet.get("metrics") or tweet.get("public_metrics") or {}
    metrics = {
        "likes": parse_int(raw_metrics.get("likes") or raw_metrics.get("like_count") or tweet.get("likes")),
        "retweets": parse_int(raw_metrics.get("retweets") or raw_metrics.get("retweet_count") or tweet.get("retweets")),
        "replies": parse_int(raw_metrics.get("replies") or raw_metrics.get("reply_count") or tweet.get("replies")),
        "quotes": parse_int(raw_metrics.get("quotes") or raw_metrics.get("quote_count") or tweet.get("quotes")),
        "views": parse_int(raw_metrics.get("views") or raw_metrics.get("view_count") or tweet.get("views")),
        "bookmarks": parse_int(raw_metrics.get("bookmarks") or raw_metrics.get("bookmark_count") or tweet.get("bookmarks")),
    }
    extracted_image, extracted_video, extracted_poster = media_from_tweet(tweet)
    image_url = str(tweet.get("image_url") or extracted_image or "").strip() or None
    video_url = str(tweet.get("video_url") or extracted_video or "").strip() or None
    video_poster_url = str(tweet.get("video_poster_url") or extracted_poster or "").strip() or None
    return {
        "platform": "x",
        "handle": handle,
        "author_handle": author_handle,
        "id": tweet_id,
        "url": url,
        "text": text,
        "created_at": created_at,
        "kind": kind_from_tweet(tweet),
        "metrics": metrics,
        "image_url": image_url,
        "video_url": video_url,
        "video_poster_url": video_poster_url,
        "language": tweet.get("lang") or tweet.get("language") or "unknown",
    }


def twitter_command(method: str, handle: str, since_date: str, per_source: int, output_path: Path) -> list[str]:
    if method == "search":
        return [
            "search",
            "--from",
            handle,
            "--since",
            since_date,
            "--type",
            "latest",
            "--max",
            str(per_source),
            "--json",
            "--output",
            str(output_path),
        ]
    return [
        "user-posts",
        handle,
        "--max",
        str(per_source),
        "--json",
        "--output",
        str(output_path),
    ]


def run_twitter_cli_search(twitter_cmd: str, handle: str, since_date: str, per_source: int, method: str = "user-posts") -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if not shutil.which(twitter_cmd):
        return [], {"platform": "x", "handle": handle, "ok": False, "error": f"{twitter_cmd} not found on PATH"}

    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as tmp:
        tmp_path = Path(tmp.name)
    cmd = [twitter_cmd, *twitter_command(method, handle, since_date, per_source, tmp_path)]
    try:
        command_env = os.environ.copy()
        command_env.update(load_agent_reach_twitter_env())
        result = subprocess.run(cmd, text=True, capture_output=True, check=False, timeout=90, env=command_env)
        if result.returncode != 0:
            error_parts = [part.strip() for part in (result.stderr, result.stdout) if part.strip()]
            return [], {
                "platform": "x",
                "handle": handle,
                "ok": False,
                "error": "\n".join(error_parts) or f"exit_{result.returncode}",
            }
        payload_text = tmp_path.read_text() if tmp_path.exists() else result.stdout
        payload = json.loads(payload_text)
        items = [item for tweet in tweet_items(payload) if (item := normalize_raw_tweet(tweet, handle))]
        return items, {"platform": "x", "handle": handle, "ok": True, "method": method, "items": len(items)}
    except json.JSONDecodeError as exc:
        return [], {"platform": "x", "handle": handle, "ok": False, "error": f"invalid_json: {exc}"}
    except subprocess.TimeoutExpired:
        return [], {"platform": "x", "handle": handle, "ok": False, "error": "twitter command timed out"}
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except OSError:
            pass


def run_opencli_tweets(opencli_cmd: str, handle: str, per_source: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    if not shutil.which(opencli_cmd):
        return [], {"platform": "x", "handle": handle, "ok": False, "method": "opencli", "error": f"{opencli_cmd} not found on PATH"}
    cmd = [
        opencli_cmd,
        "twitter",
        "tweets",
        handle,
        "--limit",
        str(per_source),
        "--page-delay",
        "0",
        "-f",
        "json",
        "--window",
        "background",
    ]
    try:
        result = subprocess.run(cmd, text=True, capture_output=True, check=False, timeout=75)
        if result.returncode != 0:
            error_parts = [part.strip() for part in (result.stderr, result.stdout) if part.strip()]
            return [], {
                "platform": "x",
                "handle": handle,
                "ok": False,
                "method": "opencli",
                "error": "\n".join(error_parts) or f"exit_{result.returncode}",
            }
        payload = json.loads(result.stdout)
        items = [item for tweet in tweet_items(payload) if (item := normalize_raw_tweet(tweet, handle))]
        return items, {"platform": "x", "handle": handle, "ok": True, "method": "opencli", "items": len(items)}
    except json.JSONDecodeError as exc:
        return [], {"platform": "x", "handle": handle, "ok": False, "method": "opencli", "error": f"invalid_json: {exc}"}
    except subprocess.TimeoutExpired:
        return [], {"platform": "x", "handle": handle, "ok": False, "method": "opencli", "error": "opencli command timed out"}


def compact_json(value: dict[str, Any]) -> str:
    return json.dumps(value, separators=(",", ":"))


def x_graphql_url(operation_name: str, variables: dict[str, Any], features: dict[str, Any]) -> str:
    compact_features = {key: value for key, value in features.items() if value is not False}
    return "https://x.com/i/api/graphql/%s/%s?variables=%s&features=%s" % (
        X_QUERY_IDS[operation_name],
        operation_name,
        urllib.parse.quote(compact_json(variables)),
        urllib.parse.quote(compact_json(compact_features)),
    )


def x_web_headers(auth_token: str, ct0: str, cookie_string: str | None = None) -> list[str]:
    return [
        f"Authorization: Bearer {X_BEARER_TOKEN}",
        f"Cookie: {cookie_string or f'auth_token={auth_token}; ct0={ct0}'}",
        f"X-Csrf-Token: {ct0}",
        "X-Twitter-Active-User: yes",
        "X-Twitter-Auth-Type: OAuth2Session",
        "X-Twitter-Client-Language: en",
        "User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
        "Origin: https://x.com",
        "Referer: https://x.com/",
        "Accept: */*",
        "Accept-Language: en-US,en;q=0.9",
        'sec-ch-ua: "Chromium";v="133", "Not(A:Brand";v="99", "Google Chrome";v="133"',
        "sec-ch-ua-mobile: ?0",
        'sec-ch-ua-platform: "macOS"',
        "Sec-Fetch-Dest: empty",
        "Sec-Fetch-Mode: cors",
        "Sec-Fetch-Site: same-origin",
    ]


def curl_config_value(value: str) -> str:
    return value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "")


def curl_json_get(url: str, headers: list[str], curl_cmd: str, timeout: int = 30) -> dict[str, Any]:
    if not shutil.which(curl_cmd):
        raise RuntimeError(f"{curl_cmd} not found on PATH")

    config_path: Path | None = None
    body_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as config_file:
            config_path = Path(config_file.name)
            with tempfile.NamedTemporaryFile("w", encoding="utf-8", delete=False) as body_file:
                body_path = Path(body_file.name)
            config_file.write("silent\n")
            config_file.write("show-error\n")
            config_file.write("location\n")
            config_file.write("compressed\n")
            config_file.write(f"max-time = {timeout}\n")
            config_file.write(f'url = "{curl_config_value(url)}"\n')
            config_file.write(f'output = "{curl_config_value(str(body_path))}"\n')
            config_file.write('write-out = "%{http_code}"\n')
            for header in headers:
                config_file.write(f'header = "{curl_config_value(header)}"\n')

        result = subprocess.run(
            [curl_cmd, "--config", str(config_path)],
            text=True,
            capture_output=True,
            check=False,
            timeout=timeout + 15,
        )
        status_code = int((result.stdout or "0").strip()[-3:] or "0")
        body = body_path.read_text(encoding="utf-8", errors="replace") if body_path.exists() else ""
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or f"curl exit {result.returncode}")
        if status_code >= 400:
            raise RuntimeError(f"HTTP {status_code}: {body[:300]}")
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"invalid_json: {exc}") from exc
    finally:
        if config_path:
            config_path.unlink(missing_ok=True)
        if body_path:
            body_path.unlink(missing_ok=True)


def deep_get(data: Any, *keys: Any) -> Any:
    current = data
    for key in keys:
        if isinstance(key, int):
            if isinstance(current, list) and 0 <= key < len(current):
                current = current[key]
            else:
                return None
        elif isinstance(current, dict):
            current = current.get(key)
        else:
            return None
    return current


def parse_int(value: Any, default: int = 0) -> int:
    try:
        text = str(value).replace(",", "").strip()
        return int(float(text)) if text else default
    except (TypeError, ValueError):
        return default


def unwrap_x_tweet_result(result: dict[str, Any]) -> dict[str, Any]:
    if result.get("__typename") == "TweetWithVisibilityResults" and isinstance(result.get("tweet"), dict):
        return result["tweet"]
    return result


def x_author_handle(user: dict[str, Any], fallback: str) -> str:
    return (
        str(deep_get(user, "core", "screen_name") or deep_get(user, "legacy", "screen_name") or fallback)
        .lstrip("@")
    )


def raw_tweet_from_x_result(result: dict[str, Any], handle: str) -> dict[str, Any] | None:
    tweet_data = unwrap_x_tweet_result(result)
    if tweet_data.get("__typename") == "TweetTombstone":
        return None
    legacy = tweet_data.get("legacy")
    core = tweet_data.get("core")
    if not isinstance(legacy, dict) or not isinstance(core, dict):
        return None

    is_retweet = bool(deep_get(legacy, "retweeted_status_result", "result"))
    actual_data = tweet_data
    actual_legacy = legacy
    actual_user = deep_get(core, "user_results", "result") or {}
    if is_retweet:
        retweet_result = deep_get(legacy, "retweeted_status_result", "result") or {}
        retweet_data = unwrap_x_tweet_result(retweet_result) if isinstance(retweet_result, dict) else {}
        if isinstance(retweet_data.get("legacy"), dict) and isinstance(retweet_data.get("core"), dict):
            actual_data = retweet_data
            actual_legacy = retweet_data["legacy"]
            actual_user = deep_get(retweet_data, "core", "user_results", "result") or {}

    tweet_id = str(actual_data.get("rest_id") or actual_legacy.get("id_str") or "")
    text = str(deep_get(actual_data, "note_tweet", "note_tweet_results", "result", "text") or actual_legacy.get("full_text") or "")
    created_at = actual_legacy.get("created_at")
    if not tweet_id or not text or not created_at:
        return None
    author_handle = x_author_handle(actual_user, handle)
    image_url, video_url, video_poster_url = media_from_tweet(actual_legacy)
    return {
        "id": tweet_id,
        "text": text,
        "created_at": created_at,
        "author": {"screenName": author_handle},
        "isRetweet": is_retweet,
        "lang": actual_legacy.get("lang") or "unknown",
        "url": f"https://x.com/{author_handle}/status/{tweet_id}",
        "metrics": {
            "like_count": parse_int(actual_legacy.get("favorite_count")),
            "retweet_count": parse_int(actual_legacy.get("retweet_count")),
            "reply_count": parse_int(actual_legacy.get("reply_count")),
            "quote_count": parse_int(actual_legacy.get("quote_count")),
            "view_count": parse_int(deep_get(actual_data, "views", "count")),
            "bookmark_count": parse_int(actual_legacy.get("bookmark_count")),
        },
        "image_url": image_url,
        "video_url": video_url,
        "video_poster_url": video_poster_url,
    }


def x_timeline_instructions(payload: dict[str, Any]) -> list[dict[str, Any]]:
    instructions = (
        deep_get(payload, "data", "user", "result", "timeline_v2", "timeline", "instructions")
        or deep_get(payload, "data", "user", "result", "timeline", "timeline", "instructions")
    )
    return instructions if isinstance(instructions, list) else []


def x_web_tweet_items(payload: dict[str, Any], handle: str) -> list[dict[str, Any]]:
    raw_items: list[dict[str, Any]] = []
    for instruction in x_timeline_instructions(payload):
        entries = instruction.get("entries") or instruction.get("moduleItems") or []
        for entry in entries:
            content = entry.get("content") or {}
            result = deep_get(content, "itemContent", "tweet_results", "result")
            if isinstance(result, dict):
                raw_item = raw_tweet_from_x_result(result, handle)
                if raw_item:
                    raw_items.append(raw_item)
            for nested_item in content.get("items") or []:
                nested_result = (
                    deep_get(nested_item, "item", "itemContent", "tweet_results", "result")
                    or deep_get(nested_item, "itemContent", "tweet_results", "result")
                )
                if isinstance(nested_result, dict):
                    raw_item = raw_tweet_from_x_result(nested_result, handle)
                    if raw_item:
                        raw_items.append(raw_item)
    return raw_items


def run_x_web_search(handle: str, per_source: int, curl_cmd: str = DEFAULT_CURL_CMD) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    auth_token, ct0, cookie_string = load_x_auth()
    if not auth_token or not ct0:
        return [], {"platform": "x", "handle": handle, "ok": False, "method": "x-web", "error": "missing X auth cookies"}
    headers = x_web_headers(auth_token, ct0, cookie_string)
    try:
        user_url = x_graphql_url(
            "UserByScreenName",
            {"screen_name": handle, "withSafetyModeUserFields": True},
            X_USER_FEATURES,
        )
        user_payload = curl_json_get(user_url, headers, curl_cmd)
        if user_payload.get("errors"):
            message = user_payload["errors"][0].get("message", "unknown")
            raise RuntimeError(f"UserByScreenName error: {message}")
        user_id = deep_get(user_payload, "data", "user", "result", "rest_id")
        if not user_id:
            raise RuntimeError(f"@{handle} user id not found")

        tweets_url = x_graphql_url(
            "UserTweets",
            {
                "count": min(per_source + 5, 40),
                "includePromotedContent": False,
                "latestControlAvailable": True,
                "requestContext": "launch",
                "userId": str(user_id),
                "withQuickPromoteEligibilityTweetFields": True,
                "withVoice": True,
                "withV2Timeline": True,
            },
            X_COMMON_FEATURES,
        )
        tweets_payload = curl_json_get(tweets_url, headers, curl_cmd)
        if tweets_payload.get("errors"):
            message = tweets_payload["errors"][0].get("message", "unknown")
            raise RuntimeError(f"UserTweets error: {message}")
        items = [item for raw in x_web_tweet_items(tweets_payload, handle) if (item := normalize_raw_tweet(raw, handle))]
        return items[:per_source], {"platform": "x", "handle": handle, "ok": True, "method": "x-web", "items": len(items[:per_source])}
    except Exception as exc:
        return [], {"platform": "x", "handle": handle, "ok": False, "method": "x-web", "error": str(exc)}


def run_twitter_search(
    twitter_cmd: str,
    handle: str,
    since_date: str,
    per_source: int,
    method: str = "user-posts",
    curl_cmd: str = DEFAULT_CURL_CMD,
    backend: str = "auto",
    opencli_cmd: str = DEFAULT_OPENCLI_CMD,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    attempts: list[dict[str, Any]] = []
    if backend in {"auto", "opencli"}:
        items, status = run_opencli_tweets(opencli_cmd, handle, per_source)
        if status.get("ok"):
            return items, status
        attempts.append(status)
        if backend == "opencli":
            return items, status

    if backend in {"auto", "x-web"}:
        items, status = run_x_web_search(handle, per_source, curl_cmd)
        if status.get("ok"):
            if attempts:
                status["fallback_from"] = [
                    {"method": row.get("method"), "error": str(row.get("error") or "")[:500]}
                    for row in attempts
                ]
            return items, status
        attempts.append(status)
        if backend == "x-web":
            return items, status

    items, status = run_twitter_cli_search(twitter_cmd, handle, since_date, per_source, method)
    if status.get("ok"):
        if attempts:
            status["fallback_from"] = [
                {"method": row.get("method"), "error": str(row.get("error") or "")[:500]}
                for row in attempts
            ]
        return items, status
    attempts.append(status)
    status["fallback_status"] = attempts[:-1]
    return items, status


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


def update_social(import_path: Path, social_output: Path, days: int, retention_days: int, now: datetime) -> int:
    import fetch_social_sources

    return fetch_social_sources.main_with_args([
        "--input-json",
        str(import_path),
        "--days",
        str(days),
        "--retention-days",
        str(max(days, retention_days)),
        "--output",
        str(social_output),
        "--now",
        isoformat(now),
    ])


def main() -> int:
    args = parse_args()
    now = parse_now(args.now)
    since_date = (now - timedelta(days=args.days)).date().isoformat()
    groups = set(args.group) if args.group else None
    sources = load_sources(Path(args.sources), groups)
    statuses: list[dict[str, Any]] = []
    items: list[dict[str, Any]] = []
    selected_backend = args.backend

    for source in sources:
        source_items, status = run_twitter_search(
            args.twitter_cmd,
            source["handle"],
            since_date,
            args.per_source,
            args.method,
            args.curl_cmd,
            selected_backend,
            args.opencli_cmd,
        )
        if args.backend == "auto" and status.get("ok") and status.get("method") in {"opencli", "x-web", "user-posts", "search"}:
            selected_backend = "twitter-cli" if status.get("method") in {"user-posts", "search"} else status["method"]
        items.extend(source_items)
        statuses.append(status)

    enriched_video_posters = enrich_recent_video_posters(items, now, args.days, args.curl_cmd)

    payload = {
        "generated_at": isoformat(now),
        "source": "agent-reach/x",
        "window_days": args.days,
        "total_items": len(items),
        "enriched_video_posters": enriched_video_posters,
        "items": items,
        "source_status": statuses,
    }
    output_path = Path(args.output)
    write_json(output_path, payload)
    print(f"Wrote {len(items)} Agent-Reach social items to {output_path}")
    if args.update_social:
        return update_social(output_path, Path(args.social_output), args.days, args.retention_days, now)
    return 0


if __name__ == "__main__":
    sys.exit(main())
