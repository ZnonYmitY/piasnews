---
name: piasnews
description: Fetch and summarize Oscar Piastri news from the latest 3 days for F1 fans. Use this skill whenever the user asks for Oscar Piastri, Piastri, OP81, McLaren driver news, race-week updates, official-only Piastri updates, Piastri interviews, rumors, social/X updates, or daily counts of new Piastri information. The skill works without a hosted backend by default, can use future PIASNEWS_API_URL/static JSON when configured, treats X as optional user-provided access only, and must not search beyond the latest 3 days.
---

# Piasnews

Use this skill to collect, deduplicate, classify, and summarize recent Oscar Piastri news.

## Core behavior

Default to a concise Chinese report when the user asks in Chinese. Use English when the user asks in English. Keep original article titles when helpful, but summarize in the user's language.

Search only the latest 3 days. If the user asks for "latest", "today", "recent", "this week", "race weekend", or gives no time window, still use the latest 3 days as the maximum window. If no matching item exists in the latest 3 days, return "no new information found in the latest 3 days" rather than expanding to older sources.

Do not invent missing news. If live fetching, web access, or an optional source is unavailable, say which source was unavailable and continue with the sources that work.

Respect source limitations. Do not copy full articles or long excerpts. Use metadata, short snippets, and source links. Mark rumors and unverified reports clearly.

## Source priority

Use this order:

1. If `PIASNEWS_API_URL` is configured, query it first.
2. If a Piasnews static JSON/RSS URL is available, query it next.
3. Use official public sources.
4. Use public news RSS/search fallback with a strict latest-3-days filter.
5. Use optional X/social sources only when the user provides access or a maintained source list is available.

Read `references/sources.md` before doing source-specific work, source expansion, official-only reports, X integration, or daily count work.

## V0.5 workflow

1. Understand the user's scope:
   - Time window: latest 3 days only. Narrower windows such as today or last 24 hours are allowed. Broader windows must be clipped to the latest 3 days.
   - Source mode: all sources, official-only, media-only, X/social, or rumors.
   - Output language and depth.
2. Collect candidate items from available sources, limited to the latest 3 days.
3. Keep only items clearly related to Oscar Piastri:
   - Direct mentions: Oscar Piastri, Piastri, OP81.
   - Strong contextual mentions: McLaren article about both drivers, race result involving car 81, Piastri interview, Piastri penalty/strategy/contract/team order.
4. Deduplicate by canonical URL first, then by highly similar title plus source/date.
5. Classify each item:
   - `race`: race, qualifying, sprint, practice, result, points, penalty, strategy.
   - `team`: McLaren car, team operations, upgrades, team statements.
   - `interview`: driver quotes, press conferences, podcasts, video interviews.
   - `contract`: contract, management, sponsorship, commercial partnership.
   - `fan`: fan event, merch, campaign, social/community item.
   - `rumor`: unconfirmed transfer, dispute, penalty, strategy, or paddock rumor.
   - `other`: relevant but not covered above.
6. Prefer official sources for facts. Use media coverage for context and breadth.
7. Return a structured report with links.

## Optional X/social handling

X is not a required dependency.

Use X only when at least one of these is true:

- The user provides their own X bearer token, local browser session, MCP, or other access mechanism.
- The user provides a maintained X account/source list.
- The user explicitly asks the agent to inspect X in their own environment.

Never use our shared/private X token as a default source. If X is unavailable, omit the X/social section or state that X was not checked.

When X data is available, store or summarize only metadata, short snippets, counts, and links. Do not copy large post threads verbatim.

## Data shape

When normalizing items, use this conceptual shape even if V0.5 only produces it in prose:

```json
{
  "id": "stable-source-url-or-hash",
  "title": "Article or post title",
  "url": "https://example.com/item",
  "source": "McLaren",
  "source_type": "official | media | x | rss | api",
  "published_at": "2026-06-12T10:00:00Z",
  "discovered_at": "2026-06-12T10:05:00Z",
  "category": "race | team | interview | contract | fan | rumor | other",
  "summary": "Short summary from metadata or a short excerpt",
  "official": true,
  "verified": true,
  "tags": ["Oscar Piastri", "McLaren", "F1"],
  "language": "en",
  "daily_key": "2026-06-12"
}
```

## Daily counts

When the user asks for daily counts, count newly discovered items in the requested day or date range, clipped to the latest 3 days. If V1/V2 data is unavailable, make the limitation clear:

- "Based on live sources checked in this run..."
- "Static daily history is not available yet..."

Use this shape when reporting daily stats:

```json
{
  "date": "2026-06-12",
  "total_new_items": 12,
  "official_new_items": 3,
  "media_new_items": 7,
  "x_new_items": 2,
  "rumor_new_items": 1,
  "sources": {
    "McLaren": 1,
    "Formula1": 2,
    "X": 2
  }
}
```

## Default report

Use this structure unless the user requests another format:

```markdown
# Piasnews - Oscar Piastri News

## Summary
- New items checked: N
- Official items: N
- Rumors/unverified: N
- Source limitations: ...

## Official Updates
1. [Title](url) - Source, time
   Short summary.

## Media Coverage
1. [Title](url) - Source, time
   Short summary.

## X / Social Updates
Only include this section when X/social data is available.

## Notes
- Mark unverified items clearly.
- Mention important source limitations.
```

For Chinese output, translate headings naturally:

- `Summary` -> `概览`
- `Official Updates` -> `官方动态`
- `Media Coverage` -> `媒体报道`
- `X / Social Updates` -> `X / 社交动态`
- `Notes` -> `备注`

## Quality rules

- Only search and report items from the latest 3 days. Do not include older items as filler.
- For race-week requests, include practice, qualifying, sprint, race, strategy, penalties, and official quotes only when they fall within the latest 3 days.
- For official-only requests, use only Oscar Piastri, McLaren, Formula 1/FIA/F1 official channels, and clearly say that media coverage was excluded.
- Treat Wikipedia, fan reposts, and unsourced social claims as context only, not primary news sources.
- If dates or standings matter, verify them with current sources before stating them.
- Cite or link every listed item.
