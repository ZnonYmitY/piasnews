# Piasnews

中文 | [English](#english)

Piasnews 是一个面向 Oscar Piastri 粉丝的 Agent Skill，用来抓取、去重、分类并总结 Oscar Piastri 相关新闻。

当前版本已升级到 **V1 静态数据版**：不依赖托管后端、不要求 X API、不使用我们的私有 token 或第三方付费额度。仓库会通过 GitHub Actions 定时生成最近 3 天的 `items.json`、`daily.json` 和 `rss.xml`，并发布到 GitHub Pages，粉丝的 Agent 可以优先读取静态数据。

## 当前能力

- 汇总 Oscar Piastri / Piastri / OP81 相关新闻。
- 优先使用官方来源：Oscar 官网、McLaren F1、Formula 1 官网。
- 使用公开新闻 RSS / 搜索作为补充来源。
- 默认且强制只搜索最近 3 天的信息。
- 提供静态数据文件：`data/items.json`、`data/daily.json`、`data/rss.xml`、`data/history.json`。
- GitHub Actions 每 6 小时自动更新一次数据，也支持手动触发。
- 通过 GitHub Pages 发布公开数据端点。
- 支持官方-only、比赛周、采访、传闻、媒体报道等场景。
- 粉丝日报支持速读版、标准版和深读版三种输出长度。
- 默认中文输出，英文提问时输出英文。
- 明确标注非官方来源、传闻和未验证信息。
- 为后续每日新增信息统计、静态 JSON/RSS、API 和 X 来源接入预留数据结构。

## 安装

使用支持 Skills 的 Agent 环境时，可以从 GitHub 安装：

```bash
npx skills add https://github.com/ZnonYmitY/piasnews --skill piasnews --full-depth
```

也可以直接让你的 Agent 安装：

```text
请从 https://github.com/ZnonYmitY/piasnews 安装 piasnews skill
```

## 更新

如果你之前已经安装过 Piasnews，本仓库更新后，你本地已安装的 Skill 通常不会自动更新。请运行：

```bash
npx skills update piasnews
```

如果是全局安装：

```bash
npx skills update piasnews -g
```

如果更新失败，可以重新安装：

```bash
npx skills add https://github.com/ZnonYmitY/piasnews --skill piasnews --full-depth -y
```

更新后建议开启一个新会话，或重启你的 Agent，让新的 Skill 描述和触发词生效。

## 使用示例

```text
今天 Oscar Piastri 有什么新闻？
```

```text
只看官方来源，整理 Piastri 最近动态。
```

```text
Summarize the latest Oscar Piastri news in English.
```

```text
统计今天 Piastri 相关新增信息数量。
```

```text
粉丝日报速读版。
```

```text
粉丝日报深读版，合并同题报道。
```

## 日报模式

- **速读版**：最多 5 条，适合快速看今天有没有大事；不展示数据面板，没有传闻时不展示传闻提醒。
- **标准版**：默认粉丝日报，保留今日重点、官方动态、媒体报道、可选社交动态、可选传闻雷达和可选往日回顾；不展示今日一句、数据和备注。
- **深读版**：按话题合并同类报道，补充来源可信度、明日关注、可选往日回顾和更完整的数据面板；不使用泛泛的今日一句开场。

数据面板只在深读版或用户明确要求统计时展示，避免让日报显得冗余。

“往日回顾”把同日纪念和强关联历史合并成一个可选模块，来自 `data/history.json`。只展示已经人工审核、历史价值达标的事件；普通采访和常规公告不会因为“官方”而自动入库，标志性社媒事件则可以凭长期影响力入选。每期最多一条，没有合格事件时省略。

历史库当前采用结构化标签检索。`piasnews/references/history-retrieval.json` 已预留向量模型配置，但默认关闭；启用时会在 GitHub 记录模型 ID、固定版本、维度、许可证和校验值，小型向量索引可以随仓库发布，模型权重本身放在 Release 或模型仓库中。

## 数据源策略

默认优先级：

1. 未来配置的 `PIASNEWS_API_URL`。
2. Piasnews 静态 JSON/RSS。
3. 官方公开来源。
4. 公开新闻 RSS / 搜索。
5. 可选 X / 社交来源。

所有搜索都限制在最近 3 天。如果最近 3 天没有新信息，Skill 会返回无新信息，而不是继续扩展到更早内容。

X 不是必需依赖。只有当用户提供自己的 X 访问方式，或后续维护了明确的 X 来源列表时，Skill 才会尝试使用 X。默认不会使用我们的共享 X token 或付费额度。

## 静态数据

GitHub Pages：

- 数据首页：https://znonymity.github.io/piasnews/
- 最新条目：https://znonymity.github.io/piasnews/data/items.json
- 每日统计：https://znonymity.github.io/piasnews/data/daily.json
- RSS Feed：https://znonymity.github.io/piasnews/data/rss.xml
- 历史事件：https://znonymity.github.io/piasnews/data/history.json
- 历史检索配置：https://znonymity.github.io/piasnews/data/history-retrieval.json

GitHub raw fallback：

- 最新条目：[data/items.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/items.json)
- 每日统计：[data/daily.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/daily.json)
- RSS Feed：[data/rss.xml](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/rss.xml)
- 历史事件：[data/history.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/history.json)
- 历史检索配置：[piasnews/references/history-retrieval.json](piasnews/references/history-retrieval.json)

本地更新：

```bash
python3 scripts/fetch_piasnews.py --days 3 --output-dir data
```

## 路线图

- **V0.5**：纯 Skill，已完成。
- **V1**：通过 GitHub Actions 定时生成 `items.json`、`daily.json`、`rss.xml`，并统计每日新增信息数量，已完成。
- **V2**：可选托管 API，支持搜索、筛选和更稳定的数据服务。
- **X 接入**：等待维护好的 X 账号/来源库后再接入，并单独统计 X 来源数量。

## 文档

- 需求文档：[docs/requirements.zh-CN.md](docs/requirements.zh-CN.md)
- Requirements: [docs/requirements.md](docs/requirements.md)
- Skill 主文件：[piasnews/SKILL.md](piasnews/SKILL.md)
- 来源说明：[piasnews/references/sources.md](piasnews/references/sources.md)

## 仓库结构

```text
/
├── .github/
│   └── workflows/
│       └── update-piasnews.yml
├── README.md
├── data/
│   ├── daily.json
│   ├── history.json
│   ├── items.json
│   └── rss.xml
├── docs/
│   ├── requirements.md
│   └── requirements.zh-CN.md
├── piasnews/
│   ├── SKILL.md
│   ├── agents/
│   │   └── openai.yaml
│   └── references/
│       ├── history-retrieval.json
│       ├── history.md
│       └── sources.md
├── public/
│   └── index.html
└── scripts/
    ├── fetch_piasnews.py
    └── validate_history.py
```

## 许可证

当前尚未添加许可证。正式公开分发前建议补充开源许可证。

---

## English

Piasnews is an Agent Skill for Oscar Piastri fans. It helps agents fetch, deduplicate, classify, and summarize Oscar Piastri related news.

The current release is a **V1 static-data release**. It does not require a hosted backend, X API access, our private tokens, or paid third-party API quota. GitHub Actions refreshes `items.json`, `daily.json`, and `rss.xml` for the latest 3-day window, publishes them through GitHub Pages, and agents can read static data first.

## Current Capabilities

- Summarizes news about Oscar Piastri / Piastri / OP81.
- Prioritizes official sources: Oscar's official site, McLaren F1, and Formula 1.
- Uses public news RSS/search as fallback coverage.
- Strictly searches only the latest 3 days by default and by rule.
- Provides static data files: `data/items.json`, `data/daily.json`, `data/rss.xml`, and `data/history.json`.
- GitHub Actions refreshes data every 6 hours and can also be triggered manually.
- Publishes public data endpoints through GitHub Pages.
- Supports official-only updates, race-week reports, interviews, rumors, and media coverage.
- Supports short, standard, and deep fan-daily report modes.
- Replies in Chinese by default for Chinese prompts, and in English for English prompts.
- Clearly marks unofficial sources, rumors, and unverified information.
- Keeps a forward-compatible data shape for future daily counts, static JSON/RSS, API, and X-source integration.

## Installation

In an agent environment that supports Skills, install from GitHub:

```bash
npx skills add https://github.com/ZnonYmitY/piasnews --skill piasnews --full-depth
```

You can also ask your agent directly:

```text
Install the piasnews skill from https://github.com/ZnonYmitY/piasnews
```

## Updating

If you installed Piasnews before, updates to this repository usually do not automatically update your local installed copy. Run:

```bash
npx skills update piasnews
```

For a global install:

```bash
npx skills update piasnews -g
```

If updating fails, reinstall it:

```bash
npx skills add https://github.com/ZnonYmitY/piasnews --skill piasnews --full-depth -y
```

After updating, start a new conversation or restart your agent so the latest Skill description and trigger terms are loaded.

## Example Prompts

```text
今天 Oscar Piastri 有什么新闻？
```

```text
只看官方来源，整理 Piastri 最近动态。
```

```text
Summarize the latest Oscar Piastri news in English.
```

```text
Count today's new Oscar Piastri items.
```

```text
Give me a short Piasnews fan daily.
```

```text
Give me a deep fan daily and merge duplicate topics.
```

## Daily Report Modes

- **Short**: Up to 5 bullets for a quick check; no data panel, and no rumor reminder when there are no rumors.
- **Standard**: Default fan daily with key points, official updates, media coverage, optional social updates, optional rumor radar, and optional Looking Back context; no one-liner, data, or notes sections.
- **Deep**: Groups similar coverage into topic cards and adds source-confidence notes, next watch points, optional Looking Back context, and a fuller data panel; no generic one-line opener.

Show the data panel only when the user asks for stats or requests deep mode, so the daily report does not feel redundant.

`Looking Back` merges exact-date anniversaries and strongly related historical events into one optional section backed by `data/history.json`. Only human-approved events above the historical-value threshold may appear. Routine interviews and announcements do not qualify merely because they are official, while an iconic social post may qualify through lasting impact. Show at most one item and omit the section when nothing qualifies.

The current knowledge base uses structured-facet retrieval. `piasnews/references/history-retrieval.json` reserves optional vector-model settings but keeps embeddings disabled. When enabled, GitHub records the model ID, immutable revision, dimensions, license, and checksum; a small vector index may be committed, while model weights belong in a release or model registry.

## Source Strategy

Default priority:

1. Future `PIASNEWS_API_URL`, when configured.
2. Piasnews static JSON/RSS.
3. Official public sources.
4. Public news RSS/search.
5. Optional X/social sources.

All searches are limited to the latest 3 days. If no new item exists in that window, the Skill reports no new information instead of expanding to older results.

X is not a required dependency. The Skill only attempts to use X when the user provides their own X access or when a maintained X source list is added later. It does not use our shared X token or paid quota by default.

## Static Data

GitHub Pages:

- Data index: https://znonymity.github.io/piasnews/
- Latest items: https://znonymity.github.io/piasnews/data/items.json
- Daily stats: https://znonymity.github.io/piasnews/data/daily.json
- RSS feed: https://znonymity.github.io/piasnews/data/rss.xml
- Historical events: https://znonymity.github.io/piasnews/data/history.json
- History retrieval config: https://znonymity.github.io/piasnews/data/history-retrieval.json

GitHub raw fallback:

- Latest items: [data/items.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/items.json)
- Daily stats: [data/daily.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/daily.json)
- RSS feed: [data/rss.xml](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/rss.xml)
- Historical events: [data/history.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/history.json)
- History retrieval config: [piasnews/references/history-retrieval.json](piasnews/references/history-retrieval.json)

Update locally:

```bash
python3 scripts/fetch_piasnews.py --days 3 --output-dir data
```

## Roadmap

- **V0.5**: Skill-only version, completed.
- **V1**: Scheduled GitHub Actions collector that generates `items.json`, `daily.json`, and `rss.xml`, including daily new-item counts, completed.
- **V2**: Optional hosted API for search, filtering, and more stable data delivery.
- **X integration**: Add after a maintained X account/source list is available, with separate X daily counts.

## Documentation

- Requirements: [docs/requirements.md](docs/requirements.md)
- Chinese requirements: [docs/requirements.zh-CN.md](docs/requirements.zh-CN.md)
- Skill file: [piasnews/SKILL.md](piasnews/SKILL.md)
- Source guide: [piasnews/references/sources.md](piasnews/references/sources.md)

## Repository Layout

```text
/
├── .github/
│   └── workflows/
│       └── update-piasnews.yml
├── README.md
├── data/
│   ├── daily.json
│   ├── history.json
│   ├── items.json
│   └── rss.xml
├── docs/
│   ├── requirements.md
│   └── requirements.zh-CN.md
├── piasnews/
│   ├── SKILL.md
│   ├── agents/
│   │   └── openai.yaml
│   └── references/
│       ├── history-retrieval.json
│       ├── history.md
│       └── sources.md
├── public/
│   └── index.html
└── scripts/
    ├── fetch_piasnews.py
    └── validate_history.py
```

## License

No license has been added yet. Add an open-source license before broader public distribution.
