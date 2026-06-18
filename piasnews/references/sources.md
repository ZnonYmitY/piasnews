# Piasnews Sources

Use this file when collecting Oscar Piastri news, adding sources, building daily counts, or wiring future X/social integration.

## Recency rule

Search only the latest 3 days. Do not expand to older results when the latest 3 days are empty.

Source strategy update:

- Keep official news endpoints as direct sources.
- Treat media outlets as RSS-discovered sources rather than direct crawl targets.
- Do not remove a media outlet just because it has no item on one audit day; keep it eligible through Google News RSS discovery.
- If static `data/*.json` files are available, prefer them for normal summaries and daily counts.

## Direct official sources

Official sources have the highest priority for facts, quotes, schedule, team statements, partnerships, and race-week framing.

| Source | URL | Notes |
| --- | --- | --- |
| Oscar Piastri official news | https://www.oscarpiastri.com/news | Official Oscar news, partnerships, events, and campaigns. Use only items published in the latest 3 days. |
| McLaren Formula 1 articles | https://www.mclaren.com/racing/formula-1/articles/ | McLaren F1 team articles. Use only Oscar/Piastri-relevant items published in the latest 3 days. |
| Formula 1 latest news | https://www.formula1.com/en/latest | Official F1 news feed. Use only Oscar/Piastri/OP81 items published in the latest 3 days. |

## RSS discovery sources

Use public news search/RSS for broad coverage and media discovery. Media items discovered here should be labeled as `source_type: "media"` unless the source is official.

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

## Discovered media sources

These are not direct crawl targets in V1. Keep them eligible through RSS discovery and classify them based on item metadata:

- Motorsport.
- Autosport.
- The Race.
- RacingNews365.
- PlanetF1.
- ESPN F1.
- Sky Sports F1.
- BBC.
- Motorsport Week.
- GPblog.
- Crash.net.
- RACER.
- Speedcafe.
- The Race.
- Other reputable outlets discovered by Google News RSS.

Low-confidence aggregators may appear in RSS. Mark them as unverified or filter them out when they produce noisy, duplicated, or synthetic-looking items.

## Static generated sources

The V1 collector writes these files:

| File | Purpose |
| --- | --- |
| `data/items.json` | Normalized item list from the latest 3-day window. |
| `data/daily.json` | Daily item counts plus source/category breakdowns. |
| `data/rss.xml` | RSS feed generated from normalized items. |

Public static endpoints:

| Endpoint | URL |
| --- | --- |
| Pages index | https://znonymity.github.io/piasnews/ |
| Pages items | https://znonymity.github.io/piasnews/data/items.json |
| Pages daily stats | https://znonymity.github.io/piasnews/data/daily.json |
| Pages RSS | https://znonymity.github.io/piasnews/data/rss.xml |
| Raw items fallback | https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/items.json |
| Raw daily fallback | https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/daily.json |
| Raw RSS fallback | https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/rss.xml |

Generate them locally with:

```bash
python3 scripts/fetch_piasnews.py --days 3 --output-dir data
```

## Historical context sources

Historical context such as "去年今日" is optional and must not expand the live news search window beyond the latest 3 days.

Only include a historical module when one of these sources has a clear, meaningful same-month/day event:

- A future maintained `references/history.md` or `data/history.json` file.
- User-provided historical context.
- A current official item that explicitly references the historical event.

If no meaningful event exists, omit the section. Do not fill it with trivia or weak search results.

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
