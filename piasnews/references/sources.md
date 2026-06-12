# Piasnews Sources

Use this file when collecting Oscar Piastri news, adding sources, building daily counts, or wiring future X/social integration.

## Official sources

Official sources have the highest priority for facts, quotes, schedule, team statements, partnerships, and race-week framing.

| Source | URL | Notes |
| --- | --- | --- |
| Oscar Piastri official site | https://www.oscarpiastri.com/ | Homepage includes latest news and profile information. |
| Oscar Piastri official news | https://www.oscarpiastri.com/news | Official Oscar news, partnerships, events, and campaigns. |
| McLaren Formula 1 articles | https://www.mclaren.com/racing/formula-1/articles/ | McLaren F1 team articles covering Oscar Piastri, Lando Norris, and team news. Filter or search for Oscar/Piastri where possible. |
| McLaren Oscar Piastri driver page | https://www.mclaren.com/racing/formula-1/drivers/oscar-piastri/ | Driver profile and team context. |
| Formula 1 latest news | https://www.formula1.com/en/latest | Official F1 news feed. Search within results for Oscar Piastri/Piastri/OP81. |
| Formula 1 Oscar Piastri driver page | https://www.formula1.com/en/drivers/oscar-piastri | Official F1 driver profile and related context. |

## Public news fallback

Use public news search/RSS only after official sources, or when the user asks for broader coverage.

Suggested Google News RSS queries:

```text
https://news.google.com/rss/search?q=%22Oscar%20Piastri%22&hl=en-US&gl=US&ceid=US:en
https://news.google.com/rss/search?q=%22Piastri%22%20%22McLaren%22&hl=en-US&gl=US&ceid=US:en
https://news.google.com/rss/search?q=%22OP81%22&hl=en-US&gl=US&ceid=US:en
https://news.google.com/rss/search?q=%22Oscar%20Piastri%22%20%22qualifying%22&hl=en-US&gl=US&ceid=US:en
https://news.google.com/rss/search?q=%22Oscar%20Piastri%22%20%22race%22&hl=en-US&gl=US&ceid=US:en
https://news.google.com/rss/search?q=%22Oscar%20Piastri%22%20%22interview%22&hl=en-US&gl=US&ceid=US:en
```

For Chinese summaries, keep the source title if useful and translate the summary. Do not translate names of outlets unless the Chinese name is well established.

## Optional media sources

Add these only after checking access stability, duplication rate, and source quality:

| Source | URL | Notes |
| --- | --- | --- |
| Motorsport | https://www.motorsport.com/f1/ | Strong F1 news coverage. Verify article access and avoid paywalled excerpts. |
| Autosport | https://www.autosport.com/f1/ | Strong F1 news coverage. Some content may require subscription. |
| The Race | https://www.the-race.com/formula-1/ | Analysis-heavy source. Mark opinion/analysis clearly. |
| RacingNews365 | https://racingnews365.com/formula-1 | General F1 news. |
| PlanetF1 | https://www.planetf1.com/ | General F1 news and commentary. Mark rumor/commentary carefully. |
| ESPN F1 | https://www.espn.com/f1/ | Mainstream sports coverage. |
| Sky Sports F1 | https://www.skysports.com/f1 | Mainstream F1 coverage. |

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
