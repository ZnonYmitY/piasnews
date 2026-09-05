---
name: piasnews
description: Read published Piasnews data for Oscar Piastri fan requests, including 今日热榜, 日报, 最近官方动态, 粉丝消息/X/Instagram, 下场比赛, 七天全量新闻, and driver basics. Use whenever the user asks about Piasnews, Oscar Piastri, Piastri, OP81, or a Piastri fan update. Routine feed answers should be concise text from the matching published JSON; do not create charts or visualizations unless the user explicitly asks for one.
---

# Piasnews

Answer from the live Piasnews webpage data with the shortest path that matches the request. This is a readback skill, not a report-generation pipeline.

Default to concise Chinese for Chinese requests and Beijing time unless the user chooses another language or timezone.

## Route one request to one source

| Request | Source | Response |
| --- | --- | --- |
| 今日热榜、热点、大家在讨论什么 | `hot-events.json` | Current ranked list |
| 日报、今日新闻、Piastri 最新 | `items.json` | Concise daily news digest |
| 最近官方动态、只看官方 | `items.json`, filtered to `official: true` | Official items only |
| 粉丝消息、粉丝源、X、Instagram | `social.json` | Recent fan/social posts |
| 全量新闻、最近全部报道 | `items.json` | Every matching published row |
| 下场比赛、周末赛程、几点比赛 | `calendar.json` | Next future session and weekend schedule |
| 基础信息、81 号是谁 | Current official Oscar/F1/McLaren pages | Short verified profile |

Read [references/sources.md](references/sources.md) for the endpoint and field map. Do not load unrelated datasets “for completeness.” Only combine modes when the user explicitly asks for a combined answer.

## Fast path for published feeds

1. Fetch the matching public Pages JSON, adding a cache-busting query for requests such as “今日” or “现在”.
2. Read its `generated_at` and use the data as published. Do not run collectors, rebuild data, re-rank entries, or search the wider web for a normal feed request.
3. Return the result directly in the conversation as a short Markdown list. Do not create a chart, image, dashboard, interactive visualization, HTML page, or output file unless the user explicitly requests that format.
4. Link each listed item to a URL already present in the selected JSON. Do not invent missing text, links, counts, or freshness.

## Output contracts

### 今日热榜

Use only `hot-events.json`. Sort visible `events` by published `rank`, exclude `hidden: true`, and return every visible event unless the user sets a limit. For each event show:

- `rank` and `hot_word_zh` (fall back to `hot_word_en`);
- `source_labels`, `heat`, and `items.length` when present;
- the anchor item's URL, falling back to the first related item URL.

“今日热榜” means the current webpage snapshot, not events first published today. Do not calculate a new score, cluster the events again, add other feeds, or turn the ranking into a visualization.

### 日报

Use only `items.json`. Select rows published today in the output timezone; if there are none, use the latest published date and label it clearly. Summarize the important official and verified media items with source, local time, and link. Do not add fan posts, statistics, a hot list, or historical content unless requested.

### 最近官方动态

Use only `items.json`, keep `official: true`, order by `published_at` newest first, and default to the latest five items unless the user asks for all. Do not include media rewrites or fan reposts. If there are no matching rows in the published snapshot, say so without expanding the search.

### 粉丝消息

Use only `social.json`, keep `source_group: fan_watch` rows (or ungrouped legacy fan rows), exclude known official-driver rows, order by `published_at` newest first, and default to the latest five items unless the user asks for all. Show the handle/source, platform, local time, short paraphrase, and original link. State once that fan content may be unverified; do not mix it into official news.

### 全量新闻、赛程和基础信息

- “全量” means every matching row in the published `items.json`, not a top-N list or topic cluster.
- For schedules, select the next future session from `calendar.json` rather than trusting a stale `next_race` blindly, and state the timezone.
- For a driver profile, use current official sources because Piasnews has no profile JSON. Keep current standings, points, and contracts out unless requested and verified live.

## Freshness and fallback

Prefer the public Piasnews Pages JSON because it matches the webpage. Use local `data/*.json` only when the user asks about unpublished/local state or the public endpoint is unavailable, and label local data as such. Use official web sources only for profile facts, stale schedule verification, or when the requested Piasnews endpoint fails; say when fallback data no longer matches the webpage snapshot.

Piasnews currently does not expose a “往日回顾” answer mode. Do not read `history.json`, search for a replacement history item, or add historical filler. If asked, say that the current skill supports 热榜、日报、官方动态、粉丝消息、全量新闻、赛程和基础信息 instead.

Normal answering is read-only. Never refresh data, edit source lists, trigger workflows, or publish the site unless the user explicitly asks for that mutation.
