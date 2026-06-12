# Piasnews 需求文档

英文版：[requirements.md](requirements.md)

文档同步规则：后续每次修改需求文档时，需要同时更新英文版和中文版，保证两份文档内容一致。

## 1. 背景

Piasnews 是一个面向 Oscar Piastri 新闻收集的可复用 Agent Skill。目标是让 F1 车迷可以把这个 Skill 安装到自己的 Agent 中，抓取 Oscar Piastri 的最新信息，同时默认不消耗我们的模型 token 或私有 API 额度。

整体设计参考 AI HOT 模式：

- 轻量 Skill 作为 Agent 入口。
- 优先使用公开信息源，不要求用户安装私有 MCP server。
- 后续可以平滑接入静态 JSON/RSS 或 API，不需要重写 Skill。
- X 等增强源只作为可选能力，在用户提供自己的凭证或我们维护好来源列表后再接入。

## 2. 目标

- 提供一个可从 GitHub 安装的 `piasnews` Skill，支持 Codex、Claude Code、OpenCode 等 Agent 环境。
- 抓取、去重、分类并总结 Oscar Piastri 相关新闻。
- 先以 V0.5 无后端 Skill 版本启动，同时保留升级到 V1 静态数据和 V2 托管 API 的路径。
- 默认不消耗我们的模型 token。
- 默认不消耗我们的付费第三方 API 额度。
- 在 GitHub 仓库中维护 Skill 和对应文档。
- 支持后续接入用户提供的 X 账号/来源库。
- 支持后续统计每日新增信息数量。

## 3. 非目标

- V0.5 不建设完整托管后端。
- V0.5 不依赖付费新闻 API key。
- V0.5 不强制依赖 X API。
- 不抓取私密、登录后可见、付费墙或受限制内容。
- 不存储完整版权文章，只保存元数据、短摘要和来源链接。
- 不把传闻当作已确认新闻。

## 4. 版本规划

### V0.5：纯 Skill MVP

第一版只包含 Skill 指令和来源说明文档。

预期文件：

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

行为：

- 从用户自己的 Agent 环境直接访问官方和公开网页来源。
- 优先使用官方来源。
- 用新闻 RSS / 搜索作为覆盖补充。
- 默认返回简洁中文新闻简报。
- 用户用英文提问时支持英文输出。
- 明确标注传闻、未验证报道和非官方来源。

V0.5 需要提前采用 V1/V2 规划中的统一数据结构。这样后续升级时主要替换数据来源，不改变用户侧体验。

当前实现状态：

- `piasnews/SKILL.md` 已存在。
- `piasnews/references/sources.md` 已存在。
- `piasnews/agents/openai.yaml` 已存在，用于 Codex UI 元数据。
- 尚未添加托管后端、定时采集器或静态数据源。

### V1：静态 JSON/RSS 数据

V1 增加通过 GitHub Actions 或其他低成本调度器定时采集。

预期新增文件：

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

行为：

- 定时任务抓取公开来源。
- 生成静态 JSON/RSS，并通过 GitHub Pages 或其他静态托管方式发布。
- Skill 优先读取静态数据，失败后再回退到直接抓取来源。
- 生成并保存每日新增数量统计。

### V2：托管 API

如果项目需要更强的稳定性、搜索、筛选或社区能力，V2 再增加托管服务。

潜在接口：

```text
GET /api/items
GET /api/daily
GET /api/search?q=
GET /rss.xml
```

行为：

- 如果配置了 `PIASNEWS_API_URL`，Skill 优先使用该 API。
- API 支持按日期、来源、分类、是否官方、比赛周等条件筛选。
- API 返回与 V1 静态 JSON 相同的数据结构。
- 除非明确批准，否则托管 API 不使用付费 token 生成摘要。

## 5. 来源策略

### 默认官方来源

- Oscar Piastri 官方网站
- McLaren Formula 1 新闻 / 文章
- Formula 1 官方最新新闻和车手页面

### 公开新闻补充

- Google News RSS 或等价公开搜索 Feed，查询词包括：
  - `"Oscar Piastri"`
  - `"Piastri" "McLaren"`
  - `"OP81"`
  - `"Oscar Piastri" "qualifying"`
  - `"Oscar Piastri" "race"`
  - `"Oscar Piastri" "interview"`

### 可选媒体来源

这些来源可以在检查稳定性和访问规则后加入：

- Motorsport
- Autosport
- The Race
- RacingNews365
- PlanetF1
- ESPN F1
- Sky Sports F1

## 6. X 接入策略

X 应作为可选增强源，而不是必需依赖。

V0.5 行为：

- 不要求 X API 访问权限。
- 不使用我们的 X API token 为所有用户抓取。
- 如果用户提供自己的 X 访问方式、本地浏览器登录态、MCP 或 bearer token，Skill 可以在该用户环境中使用。
- 如果没有 X 访问能力，Skill 仍然通过官方和公开新闻来源正常工作。

用户后续提供维护好的 X 来源列表后：

- 新增 `piasnews/references/x-sources.md`。
- 该文件作为用户自有 X 访问或未来 V1/V2 采集器的发现指南。
- 单独统计 X 来源的每日新增数量。
- 只保存 post 元数据和链接，不保存大段原文。

初始候选账号分组：

- 官方账号：Oscar Piastri、McLaren F1、Formula 1
- 车队和车手相关账号
- 可信 F1 记者和媒体账号
- 粉丝账号仅在人工确认后加入

## 7. 数据模型

所有版本都应把新闻条目规范成以下结构：

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

每日统计结构：

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

## 8. 输出要求

默认报告格式：

```markdown
# Piasnews - Oscar Piastri 新闻

## 概览
- 新增信息：N
- 官方信息：N
- 传闻/未验证：N

## 官方动态
1. [标题](url) - 来源，时间
   简短摘要。

## 媒体报道
1. [标题](url) - 来源，时间
   简短摘要。

## X / 社交动态
仅在 X 数据可用时展示。

## 备注
- 清楚标注未验证信息。
- 如果直接抓取来源失败，需要说明来源限制。
```

语言策略：

- 用户用中文提问时默认使用中文。
- 用户用英文提问时使用英文。
- 原始标题有价值时可以保留，但摘要应使用用户提问语言。

## 9. GitHub 同步

当前仓库状态：

- 本地仓库路径：`/Users/bytedance/Documents/piasnews`
- 本地已初始化 Git。
- 尚未配置 GitHub remote。

后续步骤：

1. 用户提供 GitHub 仓库 URL。
2. 添加 remote：

   ```bash
   git remote add origin <github-repo-url>
   ```

3. 提交文档和 Skill 文件。
4. 推送到 GitHub。
5. 使用 GitHub 作为 Skill 安装源。

建议分支策略：

- `main`：稳定可安装 Skill。
- `codex/*`：实现和文档分支。

V0.5 后建议仓库结构：

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

## 10. 验收标准

V0.5 完成标准：

- `piasnews/SKILL.md` 存在，并包含合法 Skill frontmatter。
- `piasnews/agents/openai.yaml` 存在，用于 Codex UI 元数据。
- `piasnews/references/sources.md` 列出官方、补充和可选来源。
- Skill 能回答以下提示：
  - "今天 Oscar Piastri 有什么新闻？"
  - "只看官方来源，整理 Piastri 最近动态。"
  - "Summarize the latest Oscar Piastri news in English."
- Skill 无需我们的 API key、X token 或托管后端即可运行。
- Skill 在信息源受限时说明限制，不编造新闻。
- 输出能清楚区分官方新闻、媒体报道和传闻。

V1 完成标准：

- 定时采集生成 `items.json`、`daily.json` 和 `rss.xml`。
- Skill 优先读取静态数据，失败后回退到直接来源。
- 每日新增信息数量可查询。

V2 完成标准：

- 托管 API 返回与 V1 相同的数据结构。
- Skill 可在配置 `PIASNEWS_API_URL` 时使用 API。
- API 仍然是可选项；用户没有 API 也能运行 Skill。

## 11. 待确认问题

- GitHub 仓库 URL 是哪个？
- 默认 Skill 输出使用简体中文、繁体中文，还是自动匹配用户语言？
- 第一批 X 来源账号包含哪些？
- V1 是否通过当前仓库的 GitHub Pages 发布？
- 用户侧展示名使用 `Piasnews`、`piasnews` 还是 `PIASNEWS`？
