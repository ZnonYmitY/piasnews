# Piasnews Sources

Use this file when collecting Oscar Piastri news, adding sources, building daily counts, or wiring future X/social integration.

## Recency rule

Search only the latest 3 days. Do not expand to older results when the latest 3 days are empty.

Source audit on 2026-06-12:

- Domain-specific searches for McLaren, Formula 1, Oscar Piastri official news, Motorsport, Autosport, The Race, RacingNews365, PlanetF1, ESPN F1, and Sky Sports F1 found no stable Oscar Piastri news items inside the latest 3-day window.
- Static profile/homepage pages and optional media candidates without 3-day news hits were removed from the active source list.
- Keep only core news discovery endpoints and strict 3-day public RSS query templates. If they return no items, report that no new information was found in the latest 3 days.

## Official sources

Official sources have the highest priority for facts, quotes, schedule, team statements, partnerships, and race-week framing.

| Source | URL | Notes |
| --- | --- | --- |
| Oscar Piastri official news | https://www.oscarpiastri.com/news | Official Oscar news, partnerships, events, and campaigns. Use only items published in the latest 3 days. |
| McLaren Formula 1 articles | https://www.mclaren.com/racing/formula-1/articles/ | McLaren F1 team articles. Use only Oscar/Piastri-relevant items published in the latest 3 days. |
| Formula 1 latest news | https://www.formula1.com/en/latest | Official F1 news feed. Use only Oscar/Piastri/OP81 items published in the latest 3 days. |

## Public news fallback

Use public news search/RSS only after official sources, or when the user asks for broader coverage.

Suggested Google News RSS queries. Keep `when:3d` in every query:

```text
https://news.google.com/rss/search?q=%22Oscar%20Piastri%22%20when%3A3d&hl=en-US&gl=US&ceid=US:en
https://news.google.com/rss/search?q=%22Piastri%22%20%22McLaren%22%20when%3A3d&hl=en-US&gl=US&ceid=US:en
https://news.google.com/rss/search?q=%22OP81%22%20when%3A3d&hl=en-US&gl=US&ceid=US:en
https://news.google.com/rss/search?q=%22Oscar%20Piastri%22%20%22qualifying%22%20when%3A3d&hl=en-US&gl=US&ceid=US:en
https://news.google.com/rss/search?q=%22Oscar%20Piastri%22%20%22race%22%20when%3A3d&hl=en-US&gl=US&ceid=US:en
https://news.google.com/rss/search?q=%22Oscar%20Piastri%22%20%22interview%22%20when%3A3d&hl=en-US&gl=US&ceid=US:en
```

For Chinese summaries, keep the source title if useful and translate the summary. Do not translate names of outlets unless the Chinese name is well established.

## Removed inactive sources

The following sources were removed from the active source list after the 2026-06-12 audit because no stable Oscar Piastri item was found inside the latest 3-day window:

- Oscar Piastri homepage/profile pages.
- McLaren Oscar Piastri driver profile page.
- Formula 1 Oscar Piastri driver profile page.
- Motorsport.
- Autosport.
- The Race.
- RacingNews365.
- PlanetF1.
- ESPN F1.
- Sky Sports F1.

Re-add a removed source only after a fresh audit finds Oscar Piastri items within the latest 3 days.

## X/social sources

X is optional. Do not require it for normal operation.

Only use X when the user provides one of these:

- Their own X API bearer token.
- A local browser session where they explicitly ask the agent to browse X.
- An MCP/tool integration available in their environment.
- A maintained account/source list, to be added later as `references/x-sources.md`.

Initial source groups to consider after the account list is provided:

- Official Oscar Piastri account.
- Official McLaren F1 account.
- Official Formula 1 account.
- McLaren team personnel and Oscar management accounts, if approved.
- Trusted F1 journalists and media accounts.
- Fan accounts only after manual approval.

For X-derived items:

- Keep post URL, account handle, timestamp, engagement count when available, and a short paraphrase.
- Track them with `source_type: "x"`.
- Count them separately in daily stats as `x_new_items`.
- Do not store long threads or large verbatim post text.

## Deduplication rules

1. Normalize URLs by removing common tracking parameters such as `utm_*`, `fbclid`, and `gclid`.
2. Treat identical canonical URLs as the same item.
3. Treat near-identical titles on the same day as duplicates unless they add clearly new facts.
4. Prefer the earliest official source over later media rewrites.
5. Keep analysis pieces separate from straight news if they add original interpretation.

## Verification rules

- Official announcement: `verified: true`, `official: true`.
- Reputable media with named sourcing: `verified: true`, `official: false`.
- Rumor, anonymous sourcing, fan repost, or speculative commentary: `verified: false`, category `rumor` when relevant.
- Race result, standings, penalties, or schedule claims must be checked against official F1/FIA/team sources when possible.

## Category guide

| Category | Use for |
| --- | --- |
| `race` | Practice, qualifying, sprint, race, result, points, penalties, strategy. |
| `team` | McLaren car, upgrades, operations, team comments, garage issues. |
| `interview` | Driver quotes, press conferences, podcasts, video interviews. |
| `contract` | Driver contract, management, sponsorship, commercial partnership. |
| `fan` | Fan events, merch, pop-ups, campaigns, community moments. |
| `rumor` | Unconfirmed transfer, dispute, penalty, strategy, paddock rumor. |
| `other` | Relevant items that do not fit the above. |
