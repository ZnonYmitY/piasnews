# Piasnews Requirements

Chinese version: [requirements.zh-CN.md](requirements.zh-CN.md)

Documentation sync rule: whenever this requirements document changes, update the Chinese version in the same change so both versions stay aligned.

## 1. Background

Piasnews is a reusable Agent Skill for Oscar Piastri news collection. It should let F1 fans install the skill into their own agents and fetch recent Oscar Piastri information without consuming our model tokens or private API quotas by default.

The design follows the AI HOT pattern:

- A lightweight Skill acts as the agent-facing entry point.
- Public sources are used first, without requiring users to install a private MCP server.
- Future static JSON/RSS or API endpoints can be added without rewriting the Skill.
- Optional enhanced sources, such as X, are supported only when the user provides their own credentials or a maintained source list.

## 2. Goals

- Provide a `piasnews` Skill that can be installed from GitHub by fans using Codex, Claude Code, OpenCode, or similar agent environments.
- Fetch, deduplicate, classify, and summarize Oscar Piastri related news.
- Start with V0.5 as a no-backend Skill and leave a clean upgrade path to V1 static data and V2 hosted API.
- Avoid consuming our model tokens by default.
- Avoid consuming our paid third-party API quotas by default.
- Maintain documentation in the GitHub repository alongside the Skill.
- Support future X account/source integration after the user provides a maintained account list.
- Support future daily statistics, including the number of new items discovered per day.

## 3. Non-Goals

- Do not build a full hosted backend in V0.5.
- Do not require a paid news API key in V0.5.
- Do not require X API access in V0.5.
- Do not scrape private, login-only, paywalled, or restricted content.
- Do not store full copyrighted articles. Store only metadata, short summaries, and source links.
- Do not claim rumors as confirmed news.

## 4. Version Plan

### V0.5: Skill-only MVP

The first version contains only Skill instructions and source documentation.

Expected files:

```text
piasnews/
├── SKILL.md
├── agents/
│   └── openai.yaml
└── references/
    └── sources.md
docs/
├── requirements.md
└── requirements.zh-CN.md
```

Behavior:

- Use official and public web sources directly from the user's agent environment.
- Prefer official sources when available.
- Use news RSS/search fallback for broader coverage.
- Return a concise Chinese news brief by default.
- Support English output when the user asks in English.
- Clearly mark rumors, unverified reports, and non-official sources.

V0.5 should already use the same conceptual data shape planned for V1/V2, so future upgrades only change the data source, not the user-facing behavior.

Current implementation status:

- `piasnews/SKILL.md` exists.
- `piasnews/references/sources.md` exists.
- `piasnews/agents/openai.yaml` exists for Codex UI metadata.
- No hosted backend, scheduled collector, or static data feed has been added yet.

### V1: Static JSON/RSS Data

V1 adds scheduled collection through GitHub Actions or another low-cost scheduler.

Expected additional files:

```text
scripts/
└── fetch_piasnews.py
data/
├── items.json
├── daily.json
└── rss.xml
.github/
└── workflows/
    └── update-piasnews.yml
```

Behavior:

- Scheduled job fetches public sources.
- Generated static JSON/RSS is published through GitHub Pages or another static host.
- The Skill first attempts to read static data, then falls back to direct source fetching.
- Daily item counts are generated and persisted.

### V2: Hosted API

V2 adds a hosted service if the project needs stronger reliability, search, filtering, or community features.

Potential endpoints:

```text
GET /api/items
GET /api/daily
GET /api/search?q=
GET /rss.xml
```

Behavior:

- Skill first attempts `PIASNEWS_API_URL` if configured.
- API supports filtering by date, source, category, official-only, and race-week.
- API returns the same item schema used by V1 static JSON.
- The hosted API must avoid paid-token summaries unless explicitly approved.

## 5. Source Strategy

### Default Official Sources

- Oscar Piastri official website
- McLaren Formula 1 news/articles
- Formula 1 official latest news and driver pages

### Public News Fallback

- Google News RSS or equivalent public search feed for:
  - `"Oscar Piastri"`
  - `"Piastri" "McLaren"`
  - `"OP81"`
  - `"Oscar Piastri" "qualifying"`
  - `"Oscar Piastri" "race"`
  - `"Oscar Piastri" "interview"`

### Optional Media Sources

These may be added after checking stability and access rules:

- Motorsport
- Autosport
- The Race
- RacingNews365
- PlanetF1
- ESPN F1
- Sky Sports F1

## 6. X Integration Strategy

X should be treated as an optional enhanced source, not a required dependency.

V0.5 behavior:

- Do not require X API access.
- Do not use our X API token for all users.
- If a user provides their own X access, local browser session, MCP, or bearer token, the Skill may use it in that user's environment.
- If no X access is available, the Skill continues normally with official and public news sources.

Future behavior after the user provides a maintained X source list:

- Add the account list to `piasnews/references/x-sources.md`.
- Use it as a discovery guide for user-owned X access or future V1/V2 collectors.
- Track daily counts separately for X-origin items.
- Store post metadata and links, not large verbatim copies.

Initial candidate account groups:

- Official: Oscar Piastri, McLaren F1, Formula 1
- Team and driver-adjacent accounts
- Trusted F1 journalists and media accounts
- Fan accounts only if manually approved

## 7. Data Model

All versions should normalize items into this shape:

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
  "summary": "Short summary generated from metadata or short excerpt",
  "official": true,
  "verified": true,
  "tags": ["Oscar Piastri", "McLaren", "F1"],
  "language": "en",
  "daily_key": "2026-06-12"
}
```

Daily stats shape:

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

## 8. Output Requirements

Default report format:

```markdown
# Piasnews - Oscar Piastri News

## Summary
- New items: N
- Official items: N
- Rumors/unverified: N

## Official Updates
1. [Title](url) - Source, time
   Short summary.

## Media Coverage
1. [Title](url) - Source, time
   Short summary.

## X / Social Updates
Only show this section when X data is available.

## Notes
- Mark unverified items clearly.
- Mention source limitations when direct source fetching fails.
```

Language behavior:

- Use Chinese by default when the user asks in Chinese.
- Use English when the user asks in English.
- Preserve original titles when useful, but summarize in the user's language.

## 9. GitHub Synchronization

Current repository state:

- Local repo path: `/Users/bytedance/Documents/piasnews`
- Git is initialized locally.
- No GitHub remote is configured yet.

Required later steps:

1. User provides the GitHub repository URL.
2. Add remote:

   ```bash
   git remote add origin <github-repo-url>
   ```

3. Commit documentation and Skill files.
4. Push to GitHub.
5. Use GitHub as the install source for the Skill.

Suggested branch strategy:

- `main`: stable installable Skill.
- `codex/*`: implementation and documentation branches.

Suggested repository layout after V0.5:

```text
/
├── docs/
│   ├── requirements.md
│   └── requirements.zh-CN.md
└── piasnews/
    ├── agents/
    │   └── openai.yaml
    ├── SKILL.md
    └── references/
        └── sources.md
```

## 10. Acceptance Criteria

V0.5 is complete when:

- `piasnews/SKILL.md` exists and follows Skill format with valid frontmatter.
- `piasnews/agents/openai.yaml` exists for Codex UI metadata.
- `piasnews/references/sources.md` lists official, fallback, and optional sources.
- The Skill can answer prompts such as:
  - "今天 Oscar Piastri 有什么新闻？"
  - "只看官方来源，整理 Piastri 最近动态。"
  - "Summarize the latest Oscar Piastri news in English."
- The Skill works without our API key, X token, or hosted backend.
- The Skill explains source limitations instead of inventing missing news.
- The output clearly distinguishes official news, media coverage, and rumors.

V1 is complete when:

- Scheduled collection generates `items.json`, `daily.json`, and `rss.xml`.
- The Skill reads static data first and falls back to direct sources.
- Daily new item counts are available.

V2 is complete when:

- Hosted API returns the same schema as V1.
- Skill can use `PIASNEWS_API_URL` when configured.
- API remains optional; users can still run the Skill without it.

## 11. Open Questions

- What GitHub repository URL should be used as `origin`?
- Should the default Skill output use simplified Chinese, traditional Chinese, or match the user's language automatically?
- Which X accounts should be included in the first maintained source list?
- Should V1 publish through GitHub Pages under this repository?
- Should the project name be displayed as `Piasnews`, `piasnews`, or `PIASNEWS` in user-facing output?
