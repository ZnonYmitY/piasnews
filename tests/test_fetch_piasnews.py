import json
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import fetch_piasnews as collector  # noqa: E402


ARTICLE_ID = "test-google-news-id"
GOOGLE_URL = f"{collector.GOOGLE_NEWS_ARTICLE_PREFIX}{ARTICLE_ID}?oc=5"
SOURCE_URL = "https://www.formula1.com/en/latest/article/example.test"
GOOGLE_PAGE = (
    f'<div data-n-a-id="{ARTICLE_ID}" data-n-a-ts="123456" '
    'data-n-a-sg="test-signature"></div>'
)


def decoded_response(url=SOURCE_URL):
    payload = json.dumps([None, url])
    return ")]}'\n" + json.dumps([[None, None, payload]])


def sample_item():
    return {
        "id": "provisional",
        "title": "Example Oscar Piastri article",
        "url": GOOGLE_URL,
        "source": "Formula 1",
        "source_url": "https://www.formula1.com",
        "source_type": "official",
        "category": "race",
        "published_at": "2026-06-20T08:53:49Z",
        "rss_published_at": "2026-06-20T08:53:49Z",
        "published_at_source": "google_news_rss_unverified",
        "date_verified": False,
        "daily_key": "2026-06-20",
        "official": True,
        "verified": True,
    }


class PublisherDateTest(unittest.TestCase):
    def test_extracts_json_ld_date_published(self):
        html = '<script type="application/ld+json">{"datePublished":"2026-05-25T01:05:12.006Z"}</script>'
        self.assertEqual(
            collector.extract_publisher_date(html),
            datetime(2026, 5, 25, 1, 5, 12, 6000, tzinfo=timezone.utc),
        )

    def test_extracts_open_graph_published_time(self):
        html = '<meta content="2026-06-20T08:00:00Z" property="article:published_time">'
        self.assertEqual(
            collector.extract_publisher_date(html),
            datetime(2026, 6, 20, 8, 0, tzinfo=timezone.utc),
        )


class ArticleSearchTextTest(unittest.TestCase):
    def test_prefers_json_ld_article_body_and_keeps_description(self):
        html = """
        <meta property="og:description" content="Piastri discussed the updated floor.">
        <script type="application/ld+json">
          {"@type":"NewsArticle","articleBody":"The team changed the suspension setup before qualifying."}
        </script>
        """
        text = collector.extract_article_search_text(html)
        self.assertIn("updated floor", text)
        self.assertIn("suspension setup", text)

    def test_falls_back_to_visible_paragraphs(self):
        html = "<p>Oscar explained how tyre preparation changed the balance over the long run.</p>"
        self.assertIn("tyre preparation", collector.extract_article_search_text(html))

    def test_extracts_open_graph_image_and_video(self):
        html = """
        <meta property="og:image" content="/images/piastri.jpg">
        <meta property="og:video:secure_url" content="https://video.example.com/clip.mp4">
        """
        image, video = collector.extract_article_media(html, "https://example.com/news/story")
        self.assertEqual(image, "https://example.com/images/piastri.jpg")
        self.assertEqual(video, "https://video.example.com/clip.mp4")


class ChineseLocalizationTest(unittest.TestCase):
    def test_known_title_translation(self):
        title = "Australian stars rally behind Piastri after Sky Sports backlash"
        self.assertEqual(
            collector.translate_title_zh(title),
            "Sky Sports 评论引发反弹后，澳大利亚体育明星声援 Piastri",
        )

    def test_summary_zh_is_chinese_and_category_aware(self):
        summary = collector.infer_summary_zh("Example Oscar Piastri article", "race", official=True)
        self.assertIn("官方来源", summary)
        self.assertIn("比赛周", summary)


class GoogleNewsDecodeTest(unittest.TestCase):
    def test_decodes_original_publisher_url(self):
        posted = {}

        def poster(url, fields):
            posted["url"] = url
            posted["fields"] = fields
            return decoded_response()

        result = collector.decode_google_news_url(
            GOOGLE_URL,
            fetcher=lambda _url: GOOGLE_PAGE,
            poster=poster,
        )
        self.assertEqual(result, SOURCE_URL)
        self.assertEqual(posted["url"], collector.GOOGLE_NEWS_DECODE_URL)
        self.assertIn(ARTICLE_ID, posted["fields"]["f.req"])


class SourceDateVerificationTest(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 6, 21, 0, 0, tzinfo=timezone.utc)
        self.cutoff = datetime(2026, 6, 18, 0, 0, tzinfo=timezone.utc)

    def verify(self, publisher_date, article_body=""):
        def fetcher(url):
            if url.startswith(collector.GOOGLE_NEWS_ARTICLE_PREFIX):
                return GOOGLE_PAGE
            return (
                '<script type="application/ld+json">'
                f'{{"datePublished":"{publisher_date}","articleBody":"{article_body}"}}'
                "</script>"
            )

        return collector.verify_source_date(
            sample_item(),
            self.now,
            self.cutoff,
            fetcher=fetcher,
            poster=lambda _url, _fields: decoded_response(),
        )

    def test_rejects_old_article_resurfaced_by_rss(self):
        item, status = self.verify("2026-05-25T01:05:12.006Z")
        self.assertIsNone(item)
        self.assertEqual(status, "outside_window")

    def test_uses_publisher_date_for_recent_article(self):
        item, status = self.verify(
            "2026-06-20T07:00:00Z",
            "Piastri described a revised suspension setup before qualifying.",
        )
        self.assertEqual(status, "verified")
        self.assertEqual(item["url"], SOURCE_URL)
        self.assertEqual(item["published_at"], "2026-06-20T07:00:00Z")
        self.assertEqual(item["rss_published_at"], "2026-06-20T08:53:49Z")
        self.assertTrue(item["date_verified"])
        self.assertEqual(item["published_at_source"], "publisher_metadata")
        self.assertEqual(item["id"], collector.stable_id(item["title"], SOURCE_URL))
        self.assertIn("title_zh", item)
        self.assertIn("summary_zh", item)
        self.assertIn("revised suspension setup", item["article_search_text"])


class FeedHealthTest(unittest.TestCase):
    def test_refuses_to_treat_total_feed_outage_as_empty_news(self):
        original_fetch_text = collector.fetch_text

        def failing_fetch(_url):
            raise RuntimeError("rss unavailable")

        collector.fetch_text = failing_fetch
        try:
            with self.assertRaisesRegex(RuntimeError, "All Google News RSS queries failed"):
                collector.fetch_items(
                    days=3,
                    limit=10,
                    now=datetime(2026, 7, 25, 12, 0, tzinfo=timezone.utc),
                )
        finally:
            collector.fetch_text = original_fetch_text


if __name__ == "__main__":
    unittest.main()
