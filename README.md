# Piasnews

中文 | [English](#english)

Piasnews 是一个面向 Oscar Piastri 粉丝的 Agent Skill，用来抓取、去重、分类并总结 Oscar Piastri 相关新闻。

当前版本是 **V1 静态数据 + 公开粉丝日报 + 历史审核台**：粉丝使用 Skill 或直接打开网页都不依赖托管后端、不要求 X API，也不使用我们的私有 token 或第三方付费额度。仓库通过 GitHub Actions 定时生成最近 3 天的新闻数据和重大事件候选；网页随每次采集自动更新，维护者可以在静态审核台确认候选后写入正式历史库。

## 当前能力

- 汇总 Oscar Piastri / Piastri / OP81 相关新闻。
- 优先使用官方来源：Oscar 官网、McLaren F1、Formula 1 官网。
- 使用公开新闻 RSS / 搜索作为补充来源。
- 默认且强制只搜索最近 3 天的信息。
- 提供静态数据文件：`data/items.json`、`data/daily.json`、`data/rss.xml`、`data/calendar.json`、`data/social.json`、`data/history.json`、`data/history-candidates.json`。
- GitHub Actions 每 6 小时自动更新一次数据，也支持手动触发。
- 通过 GitHub Pages 发布公开粉丝日报和数据端点。
- 支持官方-only、比赛周、采访、传闻、媒体报道等场景。
- 粉丝日报网页支持右上角中英切换；中文模式下链接标题使用中文标题，并保留原始英文标题用于溯源。
- 粉丝日报支持速读版、日报版和粉丝源三个 Tab；日报版合并原标准版与深读版的高价值结构，粉丝源用于展示已抓取到的 X / IG 发帖与转帖。
- 默认中文输出，英文提问时输出英文。
- 明确标注非官方来源、传闻和未验证信息。
- 提供历史候选自动筛选、人工评分、批准/拒绝和即时 Pages 发布流程。
- 提供匿名页面浏览统计，并在审核后台展示 7/30 天访问趋势、热门页面和来源站点。
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
粉丝日报，合并同题报道。
```

## 日报模式

- **速读版**：最多 5 条，适合快速看今天有没有大事；不展示数据面板，没有传闻时不展示传闻提醒。
- **日报版**：合并原标准版和深读版，保留今日重点、话题合并、官方动态、媒体报道、可选传闻雷达和可选往日回顾；`daily_core` 社交来源进入普通日报信息流，不再单独展示 X / 社交观察栏目。
- **粉丝源**：第三个网页 Tab，用于展示 `data/social.json` 中最近 3 天的 X / Instagram 发帖与转帖；每条保留公开原帖文本、时间、原帖链接和账号归属，不外显后台账号清单。

数据面板只在用户明确要求统计时展示，避免让日报显得冗余。

“往日回顾”把同日纪念和强关联历史合并成一个可选模块，来自 `data/history.json`。只展示已经人工审核、历史价值达标的事件；普通采访和常规公告不会因为“官方”而自动入库，标志性社媒事件则可以凭长期影响力入选。每期最多一条，没有合格事件时省略。

历史价值由候选规则自动判断为“值得保留 / 重要节点 / 标志事件”三档。它只用于未来准入、排序和训练监督，不进入审核表单，也不在粉丝日报中展示。

历史库当前采用结构化标签检索。`piasnews/references/history-retrieval.json` 已预留向量模型配置，但默认关闭；启用时会在 GitHub 记录模型 ID、固定版本、维度、许可证和校验值，小型向量索引可以随仓库发布，模型权重本身放在 Release 或模型仓库中。

## 公开粉丝日报

- 网页地址：https://znonymity.github.io/piasnews/
- 页面提供速读、日报、粉丝源三个 Tab；速读和日报共用同一份已核验静态数据。
- 粉丝源 Tab 读取 `data/social.json` 展示已抓取到的 X / IG 发帖与转帖；后台维护的账号表不在公开页面展示。
- 页面右上角支持中文 / English 切换。中文模式优先读取 `title_zh` 和 `summary_zh`，链接文字也可以显示为中文标题；原始英文标题保留为溯源字段。
- 页面显示北京时间的数据更新时间，并提供手动刷新按钮。
- 页面接入 F1 赛历，展示下一场大奖赛、比赛周时间和每秒更新的正赛倒计时。
- 每次 GitHub Actions 完成信息抓取后，会在同一工作流中重新部署网页和 JSON/RSS，因此页面与公开数据同步更新。
- 日报由浏览器中的确定性模板生成，不调用大模型，不消耗项目方或访问者的模型 token。

## 历史审核台

- 审核页面：https://znonymity.github.io/piasnews/admin/
- 自动候选由 `scripts/build_history_candidates.py` 使用确定性规则生成，不调用大模型。
- `data/history-candidates.json` 保存待审和历史决定；`data/history.json` 只保存批准事件。
- 审核时只需确认中文标题、中文摘要和简短理由；历史价值与语义字段均由系统维护。
- 审核写入通过 `worker/` 和 `review-history.yml` 完成，前端不持有 GitHub Token。
- “访问看板”读取 Worker 返回的聚合数据，支持近 7 天和近 30 天切换。
- 统计只保存访问时间、页面路径和来源站点域名，不保存 IP、Cookie 或访客标识；原始记录保留 90 天。

仓库已包含完整 Worker、D1 migration 和配置模板，但首次使用前仍需在 Cloudflare 创建 D1、部署 Worker、设置 `ADMIN_API_KEY`/`GITHUB_TOKEN`，并把公开 Worker URL 写入 GitHub Actions 变量 `PIASNEWS_WORKER_URL`。详细流程见 [Worker README](worker/README.md)，完整需求和候选流程图见[中文版需求文档](docs/requirements.zh-CN.md)。

## 数据源策略

默认优先级：

1. 未来配置的 `PIASNEWS_API_URL`。
2. Piasnews 静态 JSON/RSS。
3. 官方公开来源。
4. 公开新闻 RSS / 搜索。

RSS 只用于发现，不再直接采用其 `pubDate`。采集器会解析 Google News 跳转、读取原站 `datePublished`，只保留原文发布日期确实位于最近 3 天的条目；无法核验日期的条目不进入静态数据。
5. 可选 X / 社交来源。

所有搜索都限制在最近 3 天。如果最近 3 天没有新信息，Skill 会返回无新信息，而不是继续扩展到更早内容。

X 不是必需依赖。只有当用户提供自己的 X 访问方式，或项目配置了自有 X API token 时，Skill 才会尝试使用 X。默认不会使用我们的共享 X token 或付费额度。

当前维护的 X / Instagram 参考源位于 `piasnews/references/x-sources.json`，只作为采集配置和审核依据，不作为公开页面内容发布：

- 日报抓取源：Oscar Piastri 的 X 与 Instagram、`@NFFormula`、`@F1`。
- 粉丝相关源：`@PiastriNews`、`@NicolePiastri`、`@oscarpiastri81`、`@laurogeitabat`、`@oscarsspiastree`。

后续抓取这些账号的发帖与转帖时，每条信息必须标注账号来源，只保存公开原帖文本、元数据和链接；如有侵权或账号方要求删除，应立即删除。

社交动态由 `scripts/fetch_social_sources.py` 生成到 `data/social.json`。X 抓取需要在 GitHub Secrets 中配置项目自有 `PIASNEWS_X_BEARER_TOKEN`；Instagram 公开抓取默认不启用，可通过用户提供的导出 JSON 或后续正式 API 接入写入同一数据结构。

如果不使用 X API，也可以让本地 Agent、Agent-Reach 类工具或人工流程生成 JSON，再导入到 `data/social.json`。导入文件或环境变量只需要包含最近 3 天内的公开动态元数据：

```json
{
  "items": [
    {
      "platform": "x",
      "handle": "PiastriNews",
      "id": "1234567890",
      "text": "Oscar Piastri and McLaren update...",
      "created_at": "2026-06-27T08:00:00Z",
      "kind": "post"
    }
  ]
}
```

本地导入：

```bash
python3 scripts/fetch_social_sources.py --input-json social-import.json --days 3 --output data/social.json
```

GitHub Actions 导入：把同样的 JSON 写入仓库变量 `PIASNEWS_SOCIAL_INPUT_JSON`，下一次 `Update Piasnews Data` 会生成并发布粉丝源动态。粉丝源 Tab 顶部统一展示 `如有侵权请联系删除。`，每条动态只展示账号归属。

粉丝源和日报新闻的发布层一致，都会落到 GitHub Pages 的静态 JSON；采集层不同。日报新闻由 GitHub Actions 每 6 小时抓取 RSS/网页并核验原站发布日期。粉丝源由本机 Agent-Reach 或外部 JSON 先生成公开动态导入文件，再交给 GitHub Actions 归一化和部署。GitHub Actions 本身不会读取你的本机 X 登录态。

本机已支持 Agent-Reach 采集入口。先确认 Twitter/X 后端状态：

```bash
env PATH=/Users/bytedance/.agent-reach-venv/bin:$PATH agent-reach doctor --json
env PATH=/Users/bytedance/.agent-reach-venv/bin:$PATH twitter status
```

如果 `twitter status` 提示未认证，需要先在浏览器登录 X，或按 Agent-Reach 指引配置 `TWITTER_AUTH_TOKEN` 与 `TWITTER_CT0`。认证可用后运行：

```bash
env PATH=/Users/bytedance/.agent-reach-venv/bin:$PATH \
  python3 scripts/collect_agent_reach_social.py \
  --group fan_watch \
  --days 3 \
  --output /tmp/piasnews-agent-reach-social.json \
  --update-social
```

这会读取 `piasnews/references/x-sources.json` 中的 X 账号，默认调用本地 `twitter-cli user-posts` 拉取账号公开时间线，再按最近 3 天过滤，生成导入 JSON，并更新 `data/social.json`。如果 `agent-reach configure --from-browser chrome` 已经写入 `~/.agent-reach/config.yaml`，采集脚本会自动把其中的 Twitter/X cookies 传给 `twitter-cli`，不需要把 token 写进仓库。`twitter search` 端点不稳定，仅在明确需要时用 `--method search`。

这个本地采集不是常驻服务。手动运行时只执行一次；如果希望粉丝源无人值守更新，需要额外用 macOS `launchd`、cron 或其他调度器定时运行上面的命令。脚本本身是普通 Python/CLI 流程，不调用大模型，不消耗 Codex token；只有让 Codex 代你执行、提交或排障时才会占用 Codex 会话额度。

`daily_core` 和 `fan_watch` 已在同一来源表中维护，但展示分区不同：`daily_core` 进入普通日报信息流，粉丝源 Tab 只读取 `fan_watch` 条目。自动脚本默认采集全部分组；运行时也可用 `PIASNEWS_SOCIAL_GROUPS=fan_watch` 或 `PIASNEWS_SOCIAL_GROUPS=daily_core` 限制分组。

完整本地发布脚本：

```bash
scripts/update_social_agent_reach.sh
```

默认采集全部 X 分组，更新 `data/social.json`，生成 compact import，写入 GitHub 变量 `PIASNEWS_SOCIAL_INPUT_JSON`，并触发 `Update Piasnews Data` workflow。compact import 不写入每次变化的生成时间；如果内容和上次发布完全一致，脚本会跳过 GitHub 变量更新和 workflow 触发。需要强制发布时设置 `PIASNEWS_FORCE_SOCIAL_PUBLISH=1`。只更新本地、不触发 GitHub：

```bash
PIASNEWS_SKIP_GITHUB=1 scripts/update_social_agent_reach.sh
```

只采集粉丝源：

```bash
PIASNEWS_SOCIAL_GROUPS=fan_watch scripts/update_social_agent_reach.sh
```

macOS 每 6 小时定时运行可以使用 `launchd`。如果要改成 30 分钟，把 `StartInterval` 改为 `1800`；高频运行更适合比赛周或赛道日，平时建议保留 6 小时，以降低 X 账号访问频率和 GitHub Pages 部署噪声。把下面文件保存为 `~/Library/LaunchAgents/com.znonymity.piasnews.social.plist` 后执行 `launchctl load ~/Library/LaunchAgents/com.znonymity.piasnews.social.plist`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.znonymity.piasnews.social</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/bytedance/Documents/piasnews/scripts/update_social_agent_reach.sh</string>
  </array>
  <key>StartInterval</key>
  <integer>21600</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/piasnews-social.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/piasnews-social.err</string>
</dict>
</plist>
```

## 静态数据

GitHub Pages：

- 粉丝日报首页：https://znonymity.github.io/piasnews/
- 最新条目：https://znonymity.github.io/piasnews/data/items.json
- 每日统计：https://znonymity.github.io/piasnews/data/daily.json
- RSS Feed：https://znonymity.github.io/piasnews/data/rss.xml
- F1 赛历：https://znonymity.github.io/piasnews/data/calendar.json
- X / IG 动态：https://znonymity.github.io/piasnews/data/social.json
- 历史事件：https://znonymity.github.io/piasnews/data/history.json
- 历史候选：https://znonymity.github.io/piasnews/data/history-candidates.json
- 历史检索配置：https://znonymity.github.io/piasnews/data/history-retrieval.json

GitHub raw fallback：

- 最新条目：[data/items.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/items.json)
- 每日统计：[data/daily.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/daily.json)
- RSS Feed：[data/rss.xml](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/rss.xml)
- F1 赛历：[data/calendar.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/calendar.json)
- 历史事件：[data/history.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/history.json)
- 历史候选：[data/history-candidates.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/history-candidates.json)
- 历史检索配置：[piasnews/references/history-retrieval.json](piasnews/references/history-retrieval.json)

本地更新：

```bash
python3 scripts/fetch_piasnews.py --days 3 --output-dir data
python3 scripts/fetch_f1_calendar.py --output data/calendar.json
scripts/update_social_agent_reach.sh
python3 scripts/fetch_social_sources.py --days 3 --output data/social.json
python3 scripts/build_history_candidates.py
python3 scripts/validate_history.py
```

## 路线图

- **V0.5**：纯 Skill，已完成。
- **V1**：通过 GitHub Actions 定时生成 `items.json`、`daily.json`、`rss.xml`，并统计每日新增信息数量，已完成。
- **V1 历史审核台**：候选生成、静态审核页、审核工作流和 Worker 已完成；Worker 外部部署与 Secret 配置待完成。
- **V1 页面统计**：匿名采集、D1 聚合接口和审核后台看板已完成；Cloudflare D1/Worker 与仓库变量配置待完成。
- **V2**：可选托管 API，支持搜索、筛选和更稳定的数据服务。
- **X 接入**：账号/来源库和 `data/social.json` 数据结构已接入；实时 X 抓取需要配置项目自有 `PIASNEWS_X_BEARER_TOKEN`，Instagram 需要导入或正式 API 接入。
- **粉丝源 Tab**：页面已改为展示社交动态流；账号库只保留为后台采集配置，不在前端外显。

## 文档

- 需求文档：[docs/requirements.zh-CN.md](docs/requirements.zh-CN.md)
- Requirements: [docs/requirements.md](docs/requirements.md)
- Skill 主文件：[piasnews/SKILL.md](piasnews/SKILL.md)
- 来源说明：[piasnews/references/sources.md](piasnews/references/sources.md)
- X / IG 参考源：[piasnews/references/x-sources.json](piasnews/references/x-sources.json)

## 仓库结构

```text
/
├── .github/
│   └── workflows/
│       ├── review-history.yml
│       └── update-piasnews.yml
├── README.md
├── data/
│   ├── daily.json
│   ├── calendar.json
│   ├── history-candidates.json
│   ├── history.json
│   ├── items.json
│   ├── rss.xml
│   └── social.json
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
│       ├── sources.md
│       └── x-sources.json
├── public/
│   ├── app.js
│   ├── index.html
│   ├── styles.css
│   ├── admin/
│   │   ├── app.js
│   │   ├── index.html
│   │   └── styles.css
├── scripts/
│   ├── build_history_candidates.py
│   ├── compact_social_input.py
│   ├── collect_agent_reach_social.py
│   ├── fetch_f1_calendar.py
│   ├── fetch_piasnews.py
│   ├── fetch_social_sources.py
│   ├── review_history.py
│   ├── update_social_agent_reach.sh
│   └── validate_history.py
├── tests/
│   ├── test_compact_social_input.py
│   ├── test_collect_agent_reach_social.py
│   ├── test_fetch_piasnews.py
│   ├── test_f1_calendar.py
│   ├── test_fetch_social_sources.py
│   ├── test_history_pipeline.py
│   └── test_x_sources.py
└── worker/
    ├── src/
    │   └── index.js
    ├── README.md
    └── wrangler.toml.example
```

## 许可证

当前尚未添加许可证。正式公开分发前建议补充开源许可证。

---

## English

Piasnews is an Agent Skill for Oscar Piastri fans. It helps agents fetch, deduplicate, classify, and summarize Oscar Piastri related news.

The current release combines **V1 static data, a public fan daily, and a history review console**. Fans can use the Skill or open the website without a hosted backend, X API access, private token, or paid third-party quota. GitHub Actions refreshes recent news and major-event candidates, redeploys the public daily, and lets the maintainer approve candidates into the formal history library.

## Current Capabilities

- Summarizes news about Oscar Piastri / Piastri / OP81.
- Prioritizes official sources: Oscar's official site, McLaren F1, and Formula 1.
- Uses public news RSS/search as fallback coverage.
- Strictly searches only the latest 3 days by default and by rule.
- Provides static data files: `data/items.json`, `data/daily.json`, `data/rss.xml`, `data/calendar.json`, `data/social.json`, `data/history.json`, and `data/history-candidates.json`.
- GitHub Actions refreshes data every 6 hours and can also be triggered manually.
- Publishes a public fan daily and data endpoints through GitHub Pages.
- Supports official-only updates, race-week reports, interviews, rumors, and media coverage.
- Supports a Chinese/English website language switch. In Chinese mode, link text can use Chinese titles while preserving original English titles for traceability.
- Supports short, daily, and fan-source tabs. The daily mode merges the useful parts of the previous standard and deep modes; the fan-source tab shows collected X / IG posts and reposts.
- Replies in Chinese by default for Chinese prompts, and in English for English prompts.
- Clearly marks unofficial sources, rumors, and unverified information.
- Supports deterministic history nomination, human scoring, approval/rejection, and immediate Pages publication.
- Adds anonymous page-view analytics with 7/30-day trends, top pages, and referrer sites in the admin console.
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
Give me a fan daily and merge duplicate topics.
```

## Daily Report Modes

- **Short**: Up to 5 bullets for a quick check; no data panel, and no rumor reminder when there are no rumors.
- **Daily**: Merges the previous standard and deep modes. It keeps key points, topic grouping, official updates, media coverage, optional social updates, optional rumor radar, and optional Looking Back context. It removes source-confidence notes, next watch points, and the default data panel to keep the report concise.
- **Fan Sources**: A third website tab for recent X / Instagram posts and reposts from `data/social.json`. Each item keeps only a short paraphrase, timestamp, original-post link, and account attribution; the backend account list is not exposed on the page.

Show the data panel only when the user asks for stats, so the daily report does not feel redundant.

`Looking Back` merges exact-date anniversaries and strongly related historical events into one optional section backed by `data/history.json`. Only human-approved events above the historical-value threshold may appear. Routine interviews and announcements do not qualify merely because they are official, while an iconic social post may qualify through lasting impact. Show at most one item and omit the section when nothing qualifies.

Candidate rules automatically assign one of three internal historical-value tiers: worth keeping, important milestone, or iconic event. The tier supports future eligibility, ranking, and training supervision but is absent from both the review form and fan daily reports.

The current knowledge base uses structured-facet retrieval. `piasnews/references/history-retrieval.json` reserves optional vector-model settings but keeps embeddings disabled. When enabled, GitHub records the model ID, immutable revision, dimensions, license, and checksum; a small vector index may be committed, while model weights belong in a release or model registry.

## Public Fan Daily

- Web page: https://znonymity.github.io/piasnews/
- The page provides short, daily, and fan-source tabs. Short and daily share the same verified static data; fan sources reads `data/social.json`.
- The fan-source tab displays collected X / IG posts and reposts only. The maintained source list remains backend configuration and is not shown on the public page.
- The top-right language switch toggles Chinese and English UI. Chinese mode prefers `title_zh` and `summary_zh`, so even the article link text can be Chinese while the original English title remains available for traceability.
- The page shows the data refresh time in China Standard Time and includes a manual refresh control.
- The page reads the F1 calendar and shows the next Grand Prix, race-week timing, and a live race-start countdown.
- Each successful GitHub Actions collection redeploys the page and JSON/RSS in the same workflow, keeping them synchronized.
- Browser-side deterministic templates generate the views without an LLM or model-token usage.

## History Review Console

- Review console: https://znonymity.github.io/piasnews/admin/
- `scripts/build_history_candidates.py` nominates candidates with deterministic rules and no LLM.
- `data/history-candidates.json` keeps the review queue and decisions; `data/history.json` contains approved events only.
- Reviewers only confirm the Chinese title, Chinese summary, and a short reason; historical value and semantic fields are system-maintained.
- Writes go through `worker/` and `review-history.yml`, so the static frontend never holds a GitHub token.
- The Analytics view reads authenticated aggregate data and supports 7-day and 30-day ranges.
- Analytics stores only timestamp, page path, and referrer hostname. It stores no IP address, cookie, or visitor ID, and raw rows expire after 90 days.

The repository contains deployable Worker code, a D1 migration, and a configuration template. Before review writes or analytics work, create D1, deploy the Worker, set `ADMIN_API_KEY` and `GITHUB_TOKEN`, and add the public Worker URL as the GitHub Actions variable `PIASNEWS_WORKER_URL`. See the [Worker README](worker/README.md) for activation and the [English requirements](docs/requirements.md) for the full security model.

## Source Strategy

Default priority:

1. Future `PIASNEWS_API_URL`, when configured.
2. Piasnews static JSON/RSS.
3. Official public sources.
4. Public news RSS/search.
5. Optional X/social sources.

All searches are limited to the latest 3 days. If no new item exists in that window, the Skill reports no new information instead of expanding to older results.

RSS is discovery-only. The collector decodes Google News links, reads the publisher's `datePublished`, and keeps an item only when the original publication date is verifiably inside the latest three-day window. RSS `pubDate` is retained as discovery metadata and never used as authoritative recency evidence.

X is not a required dependency. The Skill only attempts to use X when the user provides their own X access or the project configures its own X API token. It does not use our shared X token or paid quota by default.

The maintained X / Instagram source list is `piasnews/references/x-sources.json`. It is collection configuration and review context only, not public page content:

- Daily sources: Oscar Piastri X and Instagram, `@NFFormula`, `@F1`.
- Fan-watch sources: `@PiastriNews`, `@NicolePiastri`, `@oscarpiastri81`, `@laurogeitabat`, `@oscarsspiastree`.

When posts and reposts are collected later, every item must include account-level attribution. Store only short paraphrases, metadata, and links; remove content immediately on rights request.

Social items are generated by `scripts/fetch_social_sources.py` into `data/social.json`. Live X collection requires a project-owned `PIASNEWS_X_BEARER_TOKEN` in GitHub Secrets. Instagram public collection is disabled by default and can be added through user-provided JSON exports or a later official API path using the same data shape.

Without the X API, a local agent, Agent-Reach-style tool, or manual workflow can generate JSON and import it into `data/social.json`. The import only needs public metadata from the latest three days:

```json
{
  "items": [
    {
      "platform": "x",
      "handle": "PiastriNews",
      "id": "1234567890",
      "text": "Oscar Piastri and McLaren update...",
      "created_at": "2026-06-27T08:00:00Z",
      "kind": "post"
    }
  ]
}
```

Local import:

```bash
python3 scripts/fetch_social_sources.py --input-json social-import.json --days 3 --output data/social.json
```

GitHub Actions import: store the same JSON in the repository variable `PIASNEWS_SOCIAL_INPUT_JSON`; the next `Update Piasnews Data` run will generate and publish the fan-source feed. The fan-source tab shows one removal-on-rights-request notice above the feed; each card only shows account attribution.

Fan sources and daily news share the same static GitHub Pages delivery layer, but their collection layers differ. Daily news is collected every six hours by GitHub Actions through RSS/web sources with publisher-date verification. Fan sources are collected locally through Agent-Reach or supplied as external JSON, then normalized and deployed by GitHub Actions. GitHub Actions cannot read your local X browser session.

This repo now includes a local Agent-Reach collection entrypoint. First check the Twitter/X backend:

```bash
env PATH=/Users/bytedance/.agent-reach-venv/bin:$PATH agent-reach doctor --json
env PATH=/Users/bytedance/.agent-reach-venv/bin:$PATH twitter status
```

If `twitter status` reports unauthenticated, sign in to X in the browser or configure `TWITTER_AUTH_TOKEN` and `TWITTER_CT0` following Agent-Reach guidance. After authentication works:

```bash
env PATH=/Users/bytedance/.agent-reach-venv/bin:$PATH \
  python3 scripts/collect_agent_reach_social.py \
  --group fan_watch \
  --days 3 \
  --output /tmp/piasnews-agent-reach-social.json \
  --update-social
```

The script reads X accounts from `piasnews/references/x-sources.json`, calls local `twitter-cli user-posts` by default, filters to the latest three days, writes the import JSON, and updates `data/social.json`. If `agent-reach configure --from-browser chrome` has written cookies to `~/.agent-reach/config.yaml`, the collector automatically passes them to `twitter-cli`; no token is committed to the repo. The `twitter search` endpoint is less stable and is available only via `--method search`.

This local collection is not a resident service. A manual run executes once; unattended fan-source updates require an external scheduler such as macOS `launchd`, cron, or another local runner. The script is plain Python/CLI work and does not call an LLM or consume Codex tokens; Codex quota is used only when Codex is asked to run, commit, or debug it.

`daily_core` and `fan_watch` are maintained in the same source table but rendered separately. `daily_core` is folded into the normal daily item flow, while the fan-source tab reads only `fan_watch` items. The automation script collects all groups by default; use `PIASNEWS_SOCIAL_GROUPS=fan_watch` or `PIASNEWS_SOCIAL_GROUPS=daily_core` to limit collection.

Full local publish script:

```bash
scripts/update_social_agent_reach.sh
```

By default it collects all X groups, updates `data/social.json`, builds the compact import JSON, writes `PIASNEWS_SOCIAL_INPUT_JSON`, and triggers the `Update Piasnews Data` workflow. The compact import omits per-run generated timestamps; when the compact content is unchanged from the previous publish, the script skips the GitHub variable update and workflow dispatch. Set `PIASNEWS_FORCE_SOCIAL_PUBLISH=1` to force a publish. To update local files only:

```bash
PIASNEWS_SKIP_GITHUB=1 scripts/update_social_agent_reach.sh
```

To collect only fan sources:

```bash
PIASNEWS_SOCIAL_GROUPS=fan_watch scripts/update_social_agent_reach.sh
```

For a six-hour macOS schedule, save this as `~/Library/LaunchAgents/com.znonymity.piasnews.social.plist`, then run `launchctl load ~/Library/LaunchAgents/com.znonymity.piasnews.social.plist`. For a 30-minute schedule, change `StartInterval` to `1800`; that cadence is better reserved for race weekends or live-session days, while six hours is quieter for normal days.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.znonymity.piasnews.social</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Users/bytedance/Documents/piasnews/scripts/update_social_agent_reach.sh</string>
  </array>
  <key>StartInterval</key>
  <integer>21600</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/piasnews-social.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/piasnews-social.err</string>
</dict>
</plist>
```

## Static Data

GitHub Pages:

- Fan daily: https://znonymity.github.io/piasnews/
- Latest items: https://znonymity.github.io/piasnews/data/items.json
- Daily stats: https://znonymity.github.io/piasnews/data/daily.json
- RSS feed: https://znonymity.github.io/piasnews/data/rss.xml
- F1 calendar: https://znonymity.github.io/piasnews/data/calendar.json
- X / IG updates: https://znonymity.github.io/piasnews/data/social.json
- Historical events: https://znonymity.github.io/piasnews/data/history.json
- History candidates: https://znonymity.github.io/piasnews/data/history-candidates.json
- History retrieval config: https://znonymity.github.io/piasnews/data/history-retrieval.json

GitHub raw fallback:

- Latest items: [data/items.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/items.json)
- Daily stats: [data/daily.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/daily.json)
- RSS feed: [data/rss.xml](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/rss.xml)
- F1 calendar: [data/calendar.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/calendar.json)
- Historical events: [data/history.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/history.json)
- History candidates: [data/history-candidates.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/history-candidates.json)
- History retrieval config: [piasnews/references/history-retrieval.json](piasnews/references/history-retrieval.json)

Update locally:

```bash
python3 scripts/fetch_piasnews.py --days 3 --output-dir data
python3 scripts/fetch_f1_calendar.py --output data/calendar.json
scripts/update_social_agent_reach.sh
python3 scripts/fetch_social_sources.py --days 3 --output data/social.json
python3 scripts/build_history_candidates.py
python3 scripts/validate_history.py
```

## Roadmap

- **V0.5**: Skill-only version, completed.
- **V1**: Scheduled GitHub Actions collector that generates `items.json`, `daily.json`, and `rss.xml`, including daily new-item counts, completed.
- **V1 history review console**: candidate generation, static console, review workflow, and Worker are implemented; external Worker deployment and secret configuration remain.
- **V1 page analytics**: anonymous ingestion, D1 aggregates, and the admin dashboard are implemented; Cloudflare D1/Worker and repository-variable setup remain.
- **V2**: Optional hosted API for search, filtering, and more stable data delivery.
- **Fan-source tab**: page rendering now uses the social-update feed; the account list remains backend collection configuration and is not exposed in the frontend.
- **X / IG collection**: source configuration and `data/social.json` are implemented. Live X collection requires a project-owned `PIASNEWS_X_BEARER_TOKEN`; Instagram requires import or a later official API integration.

## Documentation

- Requirements: [docs/requirements.md](docs/requirements.md)
- Chinese requirements: [docs/requirements.zh-CN.md](docs/requirements.zh-CN.md)
- Skill file: [piasnews/SKILL.md](piasnews/SKILL.md)
- Source guide: [piasnews/references/sources.md](piasnews/references/sources.md)
- X / IG source list: [piasnews/references/x-sources.json](piasnews/references/x-sources.json)

## Repository Layout

```text
/
├── .github/
│   └── workflows/
│       ├── review-history.yml
│       └── update-piasnews.yml
├── README.md
├── data/
│   ├── daily.json
│   ├── calendar.json
│   ├── history-candidates.json
│   ├── history.json
│   ├── items.json
│   ├── rss.xml
│   └── social.json
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
│       ├── sources.md
│       └── x-sources.json
├── public/
│   ├── app.js
│   ├── index.html
│   ├── styles.css
│   ├── admin/
│   │   ├── app.js
│   │   ├── index.html
│   │   └── styles.css
├── scripts/
│   ├── build_history_candidates.py
│   ├── compact_social_input.py
│   ├── collect_agent_reach_social.py
│   ├── fetch_f1_calendar.py
│   ├── fetch_piasnews.py
│   ├── fetch_social_sources.py
│   ├── review_history.py
│   ├── update_social_agent_reach.sh
│   └── validate_history.py
├── tests/
│   ├── test_compact_social_input.py
│   ├── test_collect_agent_reach_social.py
│   ├── test_fetch_piasnews.py
│   ├── test_f1_calendar.py
│   ├── test_fetch_social_sources.py
│   ├── test_history_pipeline.py
│   └── test_x_sources.py
└── worker/
    ├── src/
    │   └── index.js
    ├── README.md
    └── wrangler.toml.example
```

## License

No license has been added yet. Add an open-source license before broader public distribution.
