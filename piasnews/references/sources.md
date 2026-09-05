# Piasnews Published Data

Use this map to answer normal fan requests from the same data shown on the public webpage. Read only the endpoint selected by `SKILL.md`.

## Public endpoints

| Data | Pages URL | Use |
| --- | --- | --- |
| 热榜 | https://znonymity.github.io/piasnews/data/hot-events.json | Current published ranking |
| 日报 / 官方 / 全量新闻 | https://znonymity.github.io/piasnews/data/items.json | News rows and article links |
| 日报统计 | https://znonymity.github.io/piasnews/data/daily.json | Counts only, when explicitly requested |
| 粉丝消息 | https://znonymity.github.io/piasnews/data/social.json | X / Instagram feed |
| 赛程 | https://znonymity.github.io/piasnews/data/calendar.json | Race and session times |
| RSS | https://znonymity.github.io/piasnews/data/rss.xml | Feed subscription |

For “今日” or “现在”, append a harmless cache-busting query such as `?v=<current timestamp>`. The webpage itself uses a cache-busted, `no-store` read.

## Fields to use

### `hot-events.json`

- Snapshot: `generated_at`, `window_days`, `active_heat_hours`.
- Rows: `events[]`.
- Visible fields: `rank`, `hot_word_zh`, `hot_word_en`, `source_labels`, `heat`, `items`, `anchor_item_id`, `hidden`.
- Link: find the nested `items[]` row whose `item_id` equals `anchor_item_id`; otherwise use the first nested item with a `url`.
- Ignore internal review and override fields.

### `items.json`

- Snapshot: `generated_at`.
- Rows: `items[]`.
- Use: `title_zh` or `title`, `summary_zh` or `summary`, `url`, `source`, `source_type`, `published_at`, `daily_key`, `category`, `official`, and `verified`.
- Do not display `article_search_text`, discovery queries, or collector metadata.

### `daily.json`

- This file contains counts, not news copy.
- Use only when the user asks for totals or statistics: `generated_at`, `window_days`, `latest_date`, `total_items`, and `days[]`.
- Do not expose `feed_status`; it is collection diagnostics.

### `social.json`

- Snapshot: `generated_at`, `window_days`, `total_items`.
- Rows: `items[]`; for “粉丝消息”, prefer `source_group: fan_watch` and exclude known official-driver rows.
- Use: `source`, `source_handle`, `platform`, `post_kind`, `published_at`, `title_zh` or `title`, `summary_zh` or `summary`, `url`, and optional media fields.
- Do not expose `source_status` or compare cross-platform engagement as one ranking.

### `calendar.json`

- Use `generated_at`, `season`, `races[]`, and each race's `name_zh`, `round`, `circuit`, `locality`, `sessions`, and `official_url`.
- Compare session timestamps with the current time and select the next future session. `next_race` can be used only when it is still upcoming.

## Freshness and fallback

Treat each `generated_at` as the snapshot time; a file refresh time is not the same as the newest item's `published_at`. Do not silently combine different snapshots when that could alter ranks or totals.

If Pages is unavailable, try the equivalent local `data/<name>` file and label it as local/unpublished. For profile facts or a stale/missing schedule only, verify against:

- Oscar Piastri: https://www.oscarpiastri.com/
- Formula 1 driver profile: https://www.formula1.com/en/drivers/oscar-piastri
- McLaren Formula 1: https://www.mclaren.com/racing/formula-1/
- Official 2026 calendar: https://www.formula1.com/en/racing/2026

Do not broaden a normal heat, daily, official, fan, or all-news request into general web research merely to add material.
