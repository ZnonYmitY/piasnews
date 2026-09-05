---
name: piasnews
description: Integrate published Piasnews data and current web sources for Oscar Piastri fan requests, including 今日热榜, 今天或最近有什么新鲜事, 有意思的动态, 练习赛/排位/正赛成绩, 官方动态, 粉丝消息, 下场比赛, 七天全量新闻, and driver basics. Always start from the relevant published JSON, then deduplicate, connect, and rewrite the information for the user's intent. Automatically search the web when the snapshot is missing, stale, or too sparse. Preserve the published hot-ranking order and do not create charts or visualizations unless explicitly requested.
---

# Piasnews

Turn Piasnews's published data into a useful, current fan answer. The JSON snapshot is the starting context and index, not a boundary that prevents the model from filling a clear information gap.

Default to concise Chinese for Chinese requests and Beijing time unless the user chooses another language or timezone.

## Route by intent, then judge sufficiency

| Request | Start with | Expected handling |
| --- | --- | --- |
| 今日热榜、榜单、网页现在排什么 | `hot-events.json` | Faithful published-rank readback |
| 今天有什么新鲜事、今日新闻、日报 | Today's rows in `items.json` | At least five distinct news points when verifiable; synthesize and fill gaps |
| 最近有什么新鲜事、最近动态 | Last 72 hours in `items.json`, then the published seven-day window | Broader recent brief, not a today-only filter |
| 最近有什么有意思的事、值得关注什么 | `items.json` plus relevant hot/session/official/social context | Editorial selection with a reason each item matters |
| 三练/排位/正赛成绩、处罚、积分等明确事实 | `session-results.json`, `calendar.json`, and relevant items | Answer from fresh structured data or search automatically |
| 最近官方动态、只看官方 | Official rows in `items.json`, then official web sources | Official information only |
| 粉丝消息、粉丝源、X、Instagram | `fan_watch` rows in `social.json` | Curated fan/social themes with an unverified-content note |
| 全量新闻、最近全部报道 | Matching rows in `items.json` | Complete published-window list, not a top-N summary |
| 下场比赛、周末赛程、几点比赛 | `calendar.json` | Next future session and weekend schedule; verify if stale |
| 基础信息、81 号是谁 | Current official Oscar/F1/McLaren pages | Short verified profile |

Read [references/sources.md](references/sources.md) for endpoints, fields, and the web-source ladder.

## Retrieval and sufficiency loop

1. Fetch the relevant public Pages JSON with a cache-busting query for requests such as “今日”, “最近”, “最新”, or “现在”. Read `generated_at`; do not confuse snapshot time with an item's `published_at`.
2. Apply the user's timezone correctly. “今天” means local `00:00` through now. “最近” starts with the last 72 hours and widens to the current seven-day published window when the first window is thin. Honor any explicit date range instead.
3. Gather the primary rows, then bring in adjacent Piasnews datasets only when they help answer the intent. A hot list is not a universal index, and absence from `hot-events.json` is not evidence that an event did not happen.
4. Deduplicate repeated coverage and judge information sufficiency before writing:
   - an exact factual question needs a current, direct answer;
   - a today/recent brief should normally contain 5–8 distinct, substantive points;
   - an open-ended discovery answer needs enough variety to make a meaningful selection, not merely the newest titles.
5. If the answer is missing, stale, generic, contradictory, or below the useful amount, search the web automatically. Do not ask permission and do not reply “查不到” before attempting a targeted search.
6. Stop searching once the material closes the gap. If fewer than five credible news items exist even after searching, return the real items and state the limitation rather than padding or inventing content.

## When and how to search the web

Search is required when any of these is true:

- a named session, result, penalty, quote, contract update, or other exact fact is absent from the snapshot;
- a race session has ended but `session-results.json` has `result_available: false`, a `latest.session_ref` that does not match the requested session, or an error;
- today's verified news provides fewer than five distinct points;
- “最近” collapses to today only, or the published window is too sparse or one-dimensional for the question;
- the user asks for “最新/刚刚/现在” and the requested fact may postdate `generated_at`;
- JSON summaries are generic metadata labels and the title/snippet is not enough to explain what changed.

Build a narrow query from Oscar Piastri plus the season, Grand Prix, session, and date obtained from `calendar.json`. Prefer Formula 1/FIA, McLaren, and Oscar's official channels, then direct structured result sources and reputable specialist reporting. Open the source page rather than relying only on a search snippet. For a result unavailable from a primary source, corroborate it with two reputable sources when practical.

Make the source boundary clear: Piasnews rows describe the published snapshot; web results are current supplements. If targeted search still cannot verify the answer, say exactly what was checked and what remains uncertain instead of giving a blanket “没有相关信息”.

## Use the model as an editor, not a translator

- Read `title`, `summary`, and `article_search_text` as internal evidence. `article_search_text` may help understand an article but must be paraphrased, not exposed as collector metadata or copied at length. Open the original article when the internal text is insufficient.
- Merge articles that repeat the same event. Preserve genuinely different angles, new facts, official reactions, and consequences.
- Rewrite each point around the information delta: what happened, what is new, and why a Piastri fan should care. Do not output a stack of translated headlines or generic summaries.
- Connect related items when useful—for example, a practice result, Oscar's comments about pace, and what that implies for qualifying—while labeling inference as inference.
- Separate official fact, verified reporting, analysis, rumor, and fan reaction. Never upgrade speculation or engagement into fact.
- Link every factual item to its JSON URL or opened web source and retain the relevant date/time.

For today/recent briefs, default to a one-sentence overview followed by 5–8 concise entries. Each entry should carry a rewritten conclusion plus the useful context or significance, not just a title translation. For “有什么有意思的”, select by novelty, sporting impact, fan relevance, contrast, or narrative connection and briefly explain why each choice is interesting.

## Specific contracts

### 今日热榜

Use only visible `events` from `hot-events.json`, sorted by published `rank`, and return every visible event unless the user sets a limit. Show the rank, `hot_word_zh` or `hot_word_en`, source labels, heat/items count when present, and an existing anchor URL.

Do not calculate a new ranking, add unranked stories, create a chart, or search merely to make the published list longer. If the user separately asks whether the ranking missed a named event or asks for that event's facts, keep the published list intact and use the normal gap-filling loop for the follow-up fact.

### 今天有什么新鲜事

Scan every `items.json` row whose `published_at` falls within today in the output timezone. Aim for at least five distinct verified news points, not the first two or the first five raw rows. Use current session results or targeted web sources when an obvious race-week development is missing. Synthesize duplicate articles into richer points and explain the useful delta.

### 最近有什么新鲜事

Start with 72 hours rather than today. If fewer than five strong points remain after deduplication, widen to the full seven-day published window and label the actual range. Search for current missing developments when even that window is insufficient. Prefer 5–8 themes ordered by importance and recency, not a chronological title dump.

### 最近有什么有意思的事

Treat this as an editorial question. Use the existing news, hot-event, session-result, official, and—when relevant—fan snapshots to find meaningful patterns. Select a varied set and add “为什么值得看”; do not equate “interesting” with heat rank or latest timestamp alone. Search only when the snapshots cannot support a useful, current selection.

### 明确事实、官方、粉丝、全量、赛程

- For a completed session, do not interpret a missing or stale Piasnews result as “no result”; search and verify it.
- For official-only requests, web supplementation must remain on official Oscar, McLaren, Formula 1, or FIA sources.
- For fan requests, prefer `fan_watch`, group repetitive reposts into themes, and state once that fan content may be unverified. Search social platforms only when the user asks for fresher or broader fan discussion and access is available.
- “全量” means every matching published row, not a top-N list. Search beyond it only when the user asks for all current web coverage rather than the Piasnews published set.
- For schedules, select the next future session from `calendar.json` rather than trusting a stale `next_race`; verify against official sources if needed.

## Boundaries

Return concise Markdown in the conversation. Do not create a chart, image, dashboard, interactive visualization, HTML page, or output file unless the user explicitly requests that format.

Piasnews does not expose a generic “往日回顾” answer mode. Do not read `history.json` or manufacture historical filler for that retired preset; explain the current supported capabilities or ask for a specific race/date. A concrete historical question such as a named Grand Prix result remains a normal factual request: research reliable archival sources and answer it.

Normal answering is read-only. Never refresh collectors, edit source lists, trigger workflows, or publish the site unless the user explicitly asks for that mutation.
