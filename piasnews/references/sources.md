# Piasnews Published Data and Search Ladder

Use this map to turn the public Piasnews snapshot into a current answer. The JSON files are the preferred starting evidence because they match the webpage, but they are not a reason to stop when a requested fact is absent or the material is too thin.

## Public endpoints

| Data | Pages URL | Use |
| --- | --- | --- |
| 热榜 | https://znonymity.github.io/piasnews/data/hot-events.json | Current published ranking |
| 新闻 / 官方 / 全量 | https://znonymity.github.io/piasnews/data/items.json | News rows, article links, and internal article text |
| 日报统计 | https://znonymity.github.io/piasnews/data/daily.json | Counts only, when explicitly requested |
| 粉丝消息 | https://znonymity.github.io/piasnews/data/social.json | X / Instagram feed |
| 赛程 | https://znonymity.github.io/piasnews/data/calendar.json | Race and session times |
| 最近场次成绩 | https://znonymity.github.io/piasnews/data/session-results.json | Latest attempted and available Oscar session result |
| RSS | https://znonymity.github.io/piasnews/data/rss.xml | Feed subscription |

For “今日”, “最近”, “最新”, or “现在”, append a harmless cache-busting query such as `?v=<current timestamp>`. The webpage itself uses a cache-busted, `no-store` read.

## Retrieval ladder

1. Read the primary JSON for the user's intent.
2. Read an adjacent Piasnews JSON when it can close a real gap. Examples: pair `calendar.json` with `session-results.json`; use `hot-events.json` as a topic signal for an open brief; use `social.json` only when fan reaction is relevant.
3. Use the article URL and `article_search_text` from `items.json` to understand what is behind a generic summary. Paraphrase the evidence and open the original page when the text is insufficient.
4. Run a targeted current-web search when the snapshot is missing, stale, contradictory, or too sparse. Search only enough to answer the gap and identify web material as a supplement rather than part of the published Piasnews list.

The exact published hot ranking is the exception: return `hot-events.json` faithfully and do not add unranked stories. If the user asks about something the ranking omitted, treat that as a separate factual question and use the rest of the ladder.

## Fields to use

### `hot-events.json`

- Snapshot: `generated_at`, `window_days`, `active_heat_hours`.
- Rows: `events[]`.
- Visible fields: `rank`, `hot_word_zh`, `hot_word_en`, `source_labels`, `heat`, `items`, `anchor_item_id`, `hidden`.
- Link: find the nested `items[]` row whose `item_id` equals `anchor_item_id`; otherwise use the first nested item with a `url`.
- Ignore internal review and override fields.

### `items.json`

- Snapshot: `generated_at`; rows: `items[]`.
- Use as visible facts: `title_zh` or `title`, rewritten `summary_zh` or `summary`, `url`, `source`, `source_type`, `published_at`, `daily_key`, `category`, `official`, and `verified`.
- Use `article_search_text` internally to understand, cluster, and rewrite an item. It may contain a useful excerpt even when `summary_zh` is only a generic metadata label. Do not expose the field name, collector text, or long verbatim passages.
- Do not display discovery queries, feed diagnostics, or collector metadata.

### `daily.json`

- This file contains counts, not news copy.
- Use only when the user asks for totals or statistics: `generated_at`, `window_days`, `latest_date`, `total_items`, and `days[]`.
- Do not expose `feed_status`; it is collection diagnostics.

### `social.json`

- Snapshot: `generated_at`, `window_days`, `total_items`; rows: `items[]`.
- For “粉丝消息”, prefer `source_group: fan_watch` and exclude known official-driver rows.
- Use `source`, `source_handle`, `platform`, `post_kind`, `published_at`, `title_zh` or `title`, `summary_zh` or `summary`, `url`, and optional media fields.
- Do not expose `source_status` or compare cross-platform engagement as one ranking. Treat fan claims as potentially unverified.

### `calendar.json`

- Use `generated_at`, `season`, `races[]`, and each race's `name_zh`, `round`, `circuit`, `locality`, `sessions`, and `official_url`.
- Compare session timestamps with the current time. The calendar tells whether a practice, qualifying, sprint, or race has already ended and therefore whether a missing result is a data gap.
- Select the next future session rather than trusting a stale `next_race` blindly.

### `session-results.json`

- Read `generated_at`, `attempted_session_ref`, `result_available`, `latest`, and `last_error` together.
- `result_available: false` means the latest attempted session was not captured; it does not prove that the session has no result.
- Confirm that `latest.session_ref` matches the requested session before using `latest.position`, `gap_to_leader`, `duration`, `number_of_laps`, `status`, or `source_url`.
- If the calendar says the requested session has ended but `latest` points to any different session—earlier or later—search the current web immediately.

## Sufficiency checks

- **Today:** convert `published_at` into the output timezone and scan all rows from local midnight through now. A useful brief normally has at least five distinct verified points. Search when fewer remain after deduplication or when a completed race-week event is missing.
- **Recent:** start with the last 72 hours. If fewer than five strong points remain, widen to the current seven-day published window and label the actual range; search if it is still thin or clearly stale.
- **Open discovery:** use enough published sources to compare topics, then select by novelty, sporting consequence, fan relevance, contrast, or connection. Search only when the snapshot cannot support a useful current selection.
- **Exact facts:** one fresh direct/primary source is ideal. If only secondary reporting is available for a result or penalty, corroborate with two reputable sources when practical.

Never invent filler to meet a count. If targeted search still yields fewer than five credible news points, show the real number and explain the limitation.

## Web source ladder

Prefer sources in this order:

1. Formula 1 and FIA official results, documents, news, and live coverage.
2. McLaren Formula 1 and Oscar Piastri's official channels.
3. Direct structured timing/result sources.
4. Reputable specialist outlets such as Autosport, Motorsport, The Race, Sky Sports F1, BBC Sport, RacingNews365, or equivalent reporting with a clear date and named evidence.
5. Fan or social sources only for fan-reaction questions, never as sole proof of a race result or official decision.

For session results, build the query from the current calendar instead of a vague “latest” search, for example: `Oscar Piastri <season> <Grand Prix> FP3 results <date> site:formula1.com`. If that misses, remove the driver name and search the full-session classification before broadening beyond F1/FIA. For an official-only request, restrict supplementation to official Oscar, McLaren, Formula 1, or FIA pages.

Open the selected page and verify the season, event, session, date, driver, and result; the same Grand Prix name recurs every year. Do not rely on an isolated search snippet, an undated page, or an old result with the same race name. If a session ended only minutes ago, retry an official or structured result once and mark it pending confirmation; if an official page is blocked, use a structured result plus two reputable specialist sources when practical.

## Freshness and fallback

Treat `generated_at` as snapshot time and `published_at` as item time. Different files can refresh at different moments; say so when that affects the answer.

Use local `data/<name>` only when the user asks about unpublished/local state or the public endpoint is unavailable, and label it as local. If search tooling itself is unavailable, give the best snapshot-backed partial answer and state that the current web gap could not be checked; do not imply the event did not happen.

Useful official entry points:

- Oscar Piastri: https://www.oscarpiastri.com/
- Formula 1 driver profile: https://www.formula1.com/en/drivers/oscar-piastri
- Formula 1 latest: https://www.formula1.com/en/latest
- McLaren Formula 1: https://www.mclaren.com/racing/formula-1/
- FIA Formula One documents: https://www.fia.com/events/fia-formula-one-world-championship/season-2026/fia-formula-one-world-championship
