# Piasnews

中文 | [English](#english)

Piasnews 是一个面向 Oscar Piastri 粉丝的 Agent Skill，用来抓取、去重、分类并总结 Oscar Piastri 相关新闻。

当前版本是 **V0.5 Skill-only MVP**：不依赖托管后端、不要求 X API、不使用我们的私有 token 或第三方付费额度。安装后，粉丝可以在自己的 Agent 环境中直接使用公开来源获取新闻简报。

## 当前能力

- 汇总 Oscar Piastri / Piastri / OP81 相关新闻。
- 优先使用官方来源：Oscar 官网、McLaren F1、Formula 1 官网。
- 使用公开新闻 RSS / 搜索作为补充来源。
- 默认且强制只搜索最近 3 天的信息。
- 支持官方-only、比赛周、采访、传闻、媒体报道等场景。
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

## 数据源策略

默认优先级：

1. 未来配置的 `PIASNEWS_API_URL`。
2. 未来发布的 Piasnews 静态 JSON/RSS。
3. 官方公开来源。
4. 公开新闻 RSS / 搜索。
5. 可选 X / 社交来源。

所有搜索都限制在最近 3 天。如果最近 3 天没有新信息，Skill 会返回无新信息，而不是继续扩展到更早内容。

X 不是必需依赖。只有当用户提供自己的 X 访问方式，或后续维护了明确的 X 来源列表时，Skill 才会尝试使用 X。默认不会使用我们的共享 X token 或付费额度。

## 路线图

- **V0.5**：纯 Skill，已完成。
- **V1**：通过 GitHub Actions 定时生成 `items.json`、`daily.json`、`rss.xml`，并统计每日新增信息数量。
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
├── README.md
├── docs/
│   ├── requirements.md
│   └── requirements.zh-CN.md
└── piasnews/
    ├── SKILL.md
    ├── agents/
    │   └── openai.yaml
    └── references/
        └── sources.md
```

## 许可证

当前尚未添加许可证。正式公开分发前建议补充开源许可证。

---

## English

Piasnews is an Agent Skill for Oscar Piastri fans. It helps agents fetch, deduplicate, classify, and summarize Oscar Piastri related news.

The current release is a **V0.5 Skill-only MVP**. It does not require a hosted backend, X API access, our private tokens, or paid third-party API quota. After installation, fans can use public sources from their own agent environment.

## Current Capabilities

- Summarizes news about Oscar Piastri / Piastri / OP81.
- Prioritizes official sources: Oscar's official site, McLaren F1, and Formula 1.
- Uses public news RSS/search as fallback coverage.
- Strictly searches only the latest 3 days by default and by rule.
- Supports official-only updates, race-week reports, interviews, rumors, and media coverage.
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

## Source Strategy

Default priority:

1. Future `PIASNEWS_API_URL`, when configured.
2. Future Piasnews static JSON/RSS.
3. Official public sources.
4. Public news RSS/search.
5. Optional X/social sources.

All searches are limited to the latest 3 days. If no new item exists in that window, the Skill reports no new information instead of expanding to older results.

X is not a required dependency. The Skill only attempts to use X when the user provides their own X access or when a maintained X source list is added later. It does not use our shared X token or paid quota by default.

## Roadmap

- **V0.5**: Skill-only version, completed.
- **V1**: Scheduled GitHub Actions collector that generates `items.json`, `daily.json`, and `rss.xml`, including daily new-item counts.
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
├── README.md
├── docs/
│   ├── requirements.md
│   └── requirements.zh-CN.md
└── piasnews/
    ├── SKILL.md
    ├── agents/
    │   └── openai.yaml
    └── references/
        └── sources.md
```

## License

No license has been added yet. Add an open-source license before broader public distribution.
