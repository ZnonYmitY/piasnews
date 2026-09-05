# Piasnews

中文 | [English](#english)

Piasnews 是一个面向 Oscar Piastri 粉丝的 Agent Skill，用来抓取、去重、分类并总结 Oscar Piastri 相关新闻。

当前版本是 **V1 静态数据 + 公开粉丝日报 + 历史审核台**：粉丝使用 Skill 或直接打开网页都不依赖托管后端、不要求 X API，也不使用我们的私有 token 或第三方付费额度。仓库通过 GitHub Actions 定时生成最近 3 天的新闻数据和重大事件候选；网页随每次采集自动更新，维护者可以在静态审核台确认候选后写入正式历史库。

## 当前能力

- 汇总 Oscar Piastri / Piastri / OP81 相关新闻。
- 优先使用官方来源：Oscar 官网、McLaren F1、Formula 1 官网。
- 使用公开新闻 RSS / 搜索作为补充来源。
- 采集器每轮发现最近 3 天的信息并合并进网页保留窗口；Skill 按用户意图直接读取已发布快照。
- 提供静态数据文件：`data/items.json`、`data/daily.json`、`data/rss.xml`、`data/calendar.json`、`data/social.json`、`data/history.json`、`data/history-candidates.json`。
- GitHub Actions 每 6 小时自动更新一次数据，也支持手动触发。
- 通过 GitHub Pages 发布公开粉丝日报和数据端点。
- 支持官方-only、比赛周、采访、传闻、媒体报道等场景。
- 粉丝日报网页支持右上角中英切换；中文模式下链接标题使用中文标题，并保留原始英文标题用于溯源。
- 粉丝日报支持速读版、日报版和粉丝源三个 Tab；日报版合并原标准版与深读版的高价值结构，粉丝源用于展示已抓取到的 X / IG 发帖与转帖。
- 默认中文输出，英文提问时输出英文。
- 明确标注非官方来源、传闻和未验证信息。
- 提供历史候选自动筛选、人工评分、批准/拒绝和即时 Pages 发布流程。
- 提供匿名 PV 统计，并在审核后台展示 7/30/90 天折线趋势、历史周期、峰值、热门页面和来源站点。
- 提供 Piastri Fan Companion 页面与 Worker API；人物蒸馏源码位于独立仓库，本仓库只消费固定版本的运行时快照。
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

## Skill 能力

| 用户问题 | 数据入口 | 默认输出 |
| --- | --- | --- |
| 今日热榜、大家在讨论什么 | `hot-events.json` | 按已发布排名返回当前可见榜单 |
| 日报、今日新闻、Piastri 最新 | `items.json` | 当日简洁新闻摘要 |
| 最近官方动态、只看官方 | `items.json` 中 `official: true` | 最新官方条目 |
| 粉丝消息、X / IG、粉丝源 | `social.json` 中 `fan_watch` | 最新粉丝帖子 |
| 最近全部报道 | `items.json` | 当前窗口内全量列表 |
| 下场比赛、周末赛程 | `calendar.json` | 下一未来赛段与周末时间 |
| Oscar 基础信息、81 号是谁 | Oscar / F1 / McLaren 官方资料 | 简短已核实资料 |

Skill 一次只读取与问题匹配的数据入口，默认在对话中输出简洁 Markdown。今日热榜不重排、不扩写，也不生成图表、图片或可视化；只有用户明确要求时才改变格式。“往日回顾”不再作为 Skill 能力。完整约定见 [Skill 主文件](piasnews/SKILL.md) 与 [公开数据说明](piasnews/references/sources.md)。

## Piastri Fan Companion

Piastri Fan Companion 的页面、API、实时 Piasnews 上下文和部署保留在本仓库；证据、人物知识、谣言台账、判断规则、风格卡、边界、Correction Log 与评测已迁移到独立的 [piastri-persona-distillation](https://github.com/ZnonYmitY/piastri-persona-distillation) 仓库。产品通过带来源哈希和校验和的固定运行时快照消费蒸馏包，具体边界见 [产品边界文档](docs/piastri-fan-companion.zh-CN.md)。

## 公开粉丝日报

- 网页地址：https://znonymity.github.io/piasnews/
- 页面提供速读、日报、粉丝源三个 Tab；速读和日报共用同一份已核验静态数据。
- 粉丝源 Tab 读取 `data/social.json` 展示已抓取到的 X / IG 发帖与转帖；后台维护的账号表不在公开页面展示。
- 页面右上角支持中文 / English 切换。中文模式优先读取 `title_zh` 和 `summary_zh`，链接文字也可以显示为中文标题；原始英文标题保留为溯源字段。
- 页面分别显示北京时间的新闻数据更新时间、X / IG 粉丝源采集时间和最新内容时间，并提供手动刷新按钮。
- 页面接入 F1 赛历，展示下一场大奖赛、比赛周时间、每秒更新的下一赛段倒计时；练习赛、冲刺排位、冲刺赛、排位赛或正赛进行中时自动切为正计时，结束后切到下一赛段。页面提供下一场正赛、比赛周末和全年赛历的 iCalendar 导入链接。
- 每次数据工作流都会完整遍历中文翻译，自动审查疑似 badcase，写入 `data/translation_candidates.csv`，并上传本轮新增候选 Excel artifact；候选必须有建议中文，否则不进入 review-needed 队列。
- 大模型翻译完成后会生成 `data/translation-fallback.json`。只有仍缺少大模型映射且包含可翻译英文的内容才会在管理后台告警；纯链接、纯表情以及 HTML 实体造成的键差异不会触发告警。沉浸式翻译不再定时启动，由 publisher 或 admin 在后台按需打开缺口 Workbench。
- 如果仓库配置了 `FEISHU_WEBHOOK_URL` secret，工作流会在发现本轮新增翻译 badcase 后向飞书发送通知，包含新增数量、预览、飞书审核表链接和最新 Excel 链接。Codex 当前对话不作为 GitHub Actions 的稳定入站通知目标。
- 如果另一个飞书账号的群配置了独立自定义机器人，并把 webhook URL 写入 GitHub Actions secret `PIASNEWS_FEISHU_WEBHOOK_URL`，工作流会在新闻数据、粉丝源或其他公开网页数据发生实际内容变化且 Pages 部署成功后，向该群推送刷新通知。这个机器人不复用翻译审核通知的 `FEISHU_WEBHOOK_URL`。
- 每次 GitHub Actions 完成信息抓取后，会在同一工作流中重新部署网页和 JSON/RSS，因此页面与公开数据同步更新。
- 日报由浏览器中的确定性模板生成，不调用大模型，不消耗项目方或访问者的模型 token。

## 飞书翻译审核表

翻译 badcase 的主记录界面可以使用飞书多维表格 Base 或 Excel artifact。仓库内 `data/translation_candidates.csv` 是自动发现的 review-needed 队列；生产 workflow 不再把候选同步成飞书 pending 队列，也不再把缺失候选标记为 ignored。`data/translation_review.csv` 可作为后续训练 / 评估样本集维护，但默认生产 workflow 不再导入 approved 样本，也不会用 approved 样本覆盖线上中文。工作流支持以下环境配置：

- GitHub Secrets：`FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`FEISHU_BASE_APP_TOKEN`、`FEISHU_BASE_TABLE_ID`。
- GitHub Variable：`FEISHU_BASE_URL`，用于飞书通知中展示可点击的审核表链接。

审核表建议字段：

- `候选ID`
- `运行ID`
- `首次发现`
- `来源类型`
- `场景`
- `原始链接`
- `来源`
- `英文原文`
- `当前中文`
- `建议中文`
- `审核状态`
- `优先级`
- `错误类型`
- `标签`
- `备注`

审核表视图建议把 `英文原文`、`当前中文`、`建议中文`、`审核状态`、`备注` 放在前部。飞书 Base 会强制主字段在第一列，因此如果 `候选ID` 是主字段，它会保留在最前。

如后续需要单独维护训练样本库，可建立“翻译案例库”表，建议字段：

- `英文原文`
- `当前中文`
- `建议中文`
- `审核状态`
- `备注`
- `样本ID`
- `来源类型`
- `场景`
- `优先级`
- `标签`

审核方式：

1. 打开飞书审核表。
2. 检查 `英文原文`、`当前中文`、`建议中文`。
3. 如果建议译文可以进入确认集，把 `审核状态` 改为 `approved`。
4. 如果不需要处理，可以改为 `ignored` 或保持 `pending`。
5. 默认生产 workflow 不会读取 approved 行覆盖线上译文；approved 仅表示该样本可进入后续训练 / 评估集。

同步规则：

- 新增候选会写入飞书 Base。
- 已存在候选会更新原文、当前译文、建议译文和备注等字段。
- 已经在飞书中标为 `approved`、`rejected`、`ignore` 或 `ignored` 的行不会被工作流覆盖审核状态。
- `data/translation_candidates.csv` 是仓库内可追溯的自动审查队列；飞书审核表是人工审核入口。
- “翻译案例库”表目前是可选训练样本镜像，不参与默认生产翻译链路。
- 全自动飞书读写依赖 GitHub Actions 中的飞书应用凭证。缺少 `FEISHU_APP_ID` / `FEISHU_APP_SECRET` 时，本地人工授权仍可写表，但 workflow 会跳过飞书读写。

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

采集器每轮只发现最近 3 天的信息并核验原站日期，再将有效条目合并进网页保留窗口。Skill 默认读取线上快照：“今天”按用户时区筛选，“全量新闻”使用当前已发布窗口，不为补数量自动扩大搜索。

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

GitHub Actions 导入：把同样的 JSON 写入仓库变量 `PIASNEWS_SOCIAL_INPUT_JSON`，或把返回 compact JSON 的远程地址写入仓库变量 `PIASNEWS_SOCIAL_INPUT_URL`；如果远程地址需要 bearer token，把 token 写入 secret `PIASNEWS_SOCIAL_INPUT_AUTH_BEARER`。下一次 `Update Piasnews Data` 会生成并发布粉丝源动态。粉丝源 Tab 顶部统一展示 `如有侵权请联系删除。`，每条动态只展示账号归属。

粉丝源和日报新闻的发布层一致，都会落到 GitHub Pages 的静态 JSON；采集层不同。日报新闻由 GitHub Actions 每 6 小时抓取 RSS/网页并核验原站发布日期，并额外配置一个 10 分钟后的备用 schedule，降低 GitHub 定时任务延迟或丢触发的影响。粉丝源由本机 Agent-Reach、常在线机器或外部调度器先生成公开动态导入文件，再交给 GitHub Actions 归一化和部署。GitHub Actions 本身不会读取你的本机 X 登录态。

如果要把 X / IG 采集迁到常在线环境，推荐路径是：在小主机、VPS、Supabase Edge Function 或外部调度器上运行采集器，生成 compact social JSON，再通过 `PIASNEWS_SOCIAL_INPUT_URL`、仓库变量 `PIASNEWS_SOCIAL_INPUT_JSON`，或 Supabase collector 的外部输入配置交给 `Update Piasnews Data` workflow。X 对数据中心 IP 有风控风险，低成本优先级建议是本地常开小主机或家宽环境；如果使用官方 X API bearer token，Supabase 可以解决“本机睡眠导致调度不跑”的问题。Supabase 不能复用你的本机 Chrome 登录态、Agent-Reach cookies 或沉浸式翻译浏览器插件；这类链路仍需要本机或改成服务器可运行的 API / compact JSON 推送。

仓库提供了 Supabase 迁移骨架：

- `supabase/migrations/0001_social_import_snapshots.sql`：存储最新 compact social import 快照。
- `supabase/functions/collect-social/index.ts`：用官方 X API 采集账号时间线，也可合并外部 compact JSON 输入（包括 IG），写入快照表，并可触发 `update-piasnews.yml`。
- `supabase/functions/collect-social/README.md`：列出 Supabase secrets、GitHub 变量和定时配置。

配置完成后，把 `PIASNEWS_SOCIAL_INPUT_URL` 指向 `https://<project>.functions.supabase.co/collect-social`。Supabase 定时函数负责生成新快照，GitHub Actions 负责复用现有归一化、翻译、审计和 Pages 发布流程。若 IG 由另一个后端采集器生成 compact JSON，可把地址配置成 Supabase secret `PIASNEWS_INSTAGRAM_INPUT_URL`，或用带 JSON body 的 POST 推送到 collector；这样本机定时任务就不需要再打开 Instagram 页面。

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

这会读取 `piasnews/references/x-sources.json` 中的 X 账号，默认按 `OpenCLI → X Web GraphQL → twitter-cli` 的顺序读取账号公开时间线，再按最近 3 天过滤，生成导入 JSON，并更新 `data/social.json`。OpenCLI 返回的 `media_urls` / `media_posters` 会被归一化成图片、视频和封面字段；浏览器桥接不可用时，脚本会复用 `~/.agent-reach/config.yaml` 中的本机 cookies 走 X Web GraphQL，以免旧 `twitter-cli` 只返回正文却漏掉媒体。可用 `--backend opencli|x-web|twitter-cli` 固定后端；导入 JSON 的 `source_status[].method` 会记录实际路径。

这个本地采集不是常驻服务。手动运行时只执行一次；如果希望粉丝源无人值守更新，需要额外用 macOS `launchd`、cron 或其他调度器定时运行上面的命令。脚本本身是普通 Python/CLI 流程，不调用大模型，不消耗 Codex token；只有让 Codex 代你执行、提交或排障时才会占用 Codex 会话额度。

`daily_core` 和 `fan_watch` 已在同一来源表中维护，但展示分区不同：`daily_core` 进入普通日报信息流，粉丝源 Tab 只读取 `fan_watch` 条目。自动脚本默认采集全部分组；运行时也可用 `PIASNEWS_SOCIAL_GROUPS=fan_watch` 或 `PIASNEWS_SOCIAL_GROUPS=daily_core` 限制分组。

完整本地发布脚本：

```bash
scripts/update_social_agent_reach.sh
```

默认采集全部 X 分组，并额外尝试用本机已登录 Chrome 采集 Oscar Piastri Instagram 主页最近公开 posts/reels。如果 Chrome Apple Events 仍阻止 DOM 读取，Instagram 采集器会自动降级到 OpenCLI Browser Bridge；导入 JSON 的 `source_status[].method` 会显示 `opencli-browser`。如果 IG 已改由 Supabase 或外部后端导入，设置 `PIASNEWS_COLLECT_INSTAGRAM=0` 可让本机脚本只采 X，不再打开 Instagram 或 OpenCLI Browser。脚本随后更新社媒快照，生成只包含最近 3 天增量的 v2 compact import，写入 GitHub 变量 `PIASNEWS_SOCIAL_INPUT_JSON`，再由 GitHub 与已有数据合并保留 7 天并触发 `Update Piasnews Data` workflow。缺少 v2 标识的旧 `agent-reach/compact-social` 快照会被忽略，不能继续覆盖线上数据。compact import 带采集版本、生成时间、条目数和媒体条目数；比较是否变化时会忽略生成时间，所以内容未变化仍会跳过 GitHub 变量更新和 workflow 触发。相同 URL 的新快照缺少附件时会保留旧图片、视频和封面；发布前还会阻断任何“保留内容的媒体字段被清空”的退化刷新。脚本会先确认至少一个社交来源采集成功；如果认证、DNS、网络或 Chrome DOM 权限失败且没有任何来源成功，它会停止在发布前，避免把失败采集伪装成新的 X / IG 更新时间。需要强制发布时设置 `PIASNEWS_FORCE_SOCIAL_PUBLISH=1`。只更新本地、不触发 GitHub：

```bash
PIASNEWS_SKIP_GITHUB=1 scripts/update_social_agent_reach.sh
```

只采集粉丝源：

```bash
PIASNEWS_SOCIAL_GROUPS=fan_watch scripts/update_social_agent_reach.sh
```

macOS 无人值守运行可以使用 `launchd`。当前模板每 10 分钟轻量检查一次，但通过 `PIASNEWS_SOCIAL_MIN_INTERVAL_SECONDS=10800` 限制为距离上次成功采集超过 3 小时才真正访问 X / IG；如果电脑睡眠错过周期，醒来后的下一次检查会补跑。安装到 Application Support 的运行副本会在真正采集前执行 `git pull --ff-only`，版本过旧、工作区脏或存在冲突时直接停止发布；社媒输出写入临时文件，不再把运行仓库的 `data/social.json` 留成脏文件。安装模板：

```bash
mkdir -p "$HOME/Library/Application Support/piasnews"
cp -X scripts/update_social_agent_reach.sh "$HOME/Library/Application Support/piasnews/update_social_agent_reach.sh"
cp scripts/com.znonymity.piasnews.social.plist "$HOME/Library/LaunchAgents/"
launchctl load "$HOME/Library/LaunchAgents/com.znonymity.piasnews.social.plist"
```

## 静态数据

GitHub Pages：

- 粉丝日报首页：https://znonymity.github.io/piasnews/
- 最新条目：https://znonymity.github.io/piasnews/data/items.json
- 每日统计：https://znonymity.github.io/piasnews/data/daily.json
- RSS Feed：https://znonymity.github.io/piasnews/data/rss.xml
- F1 赛历：https://znonymity.github.io/piasnews/data/calendar.json
- 最近场次成绩：https://znonymity.github.io/piasnews/data/session-results.json
- 添加下一场正赛：https://znonymity.github.io/piasnews/data/next-race.ics
- 添加下一场比赛周末：https://znonymity.github.io/piasnews/data/next-weekend.ics
- 添加全年赛历：https://znonymity.github.io/piasnews/data/full-season.ics
- X / IG 动态：https://znonymity.github.io/piasnews/data/social.json
- 历史事件：https://znonymity.github.io/piasnews/data/history.json
- 历史候选：https://znonymity.github.io/piasnews/data/history-candidates.json
- 历史检索配置：https://znonymity.github.io/piasnews/data/history-retrieval.json

GitHub raw fallback：

- 最新条目：[data/items.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/items.json)
- 每日统计：[data/daily.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/daily.json)
- RSS Feed：[data/rss.xml](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/rss.xml)
- F1 赛历：[data/calendar.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/calendar.json)
- 最近场次成绩：[data/session-results.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/session-results.json)
- 添加下一场正赛：[data/next-race.ics](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/next-race.ics)
- 添加下一场比赛周末：[data/next-weekend.ics](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/next-weekend.ics)
- 添加全年赛历：[data/full-season.ics](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/full-season.ics)
- 历史事件：[data/history.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/history.json)
- 历史候选：[data/history-candidates.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/history-candidates.json)
- 历史检索配置：[piasnews/references/history-retrieval.json](piasnews/references/history-retrieval.json)

## 中文翻译

GitHub Actions 在抓取新闻和 social 数据后会先运行 `scripts/translate_zh_argos.py` 作为离线中文 fallback；如果配置了 `PIASNEWS_LLM_TRANSLATION_API_KEY`，随后运行 `scripts/translate_zh_llm_mapping.py`，只对缺失映射的新内容调用 OpenAI-compatible Chat Completions API，并把结果写入 `data/immersive_translations.zh.json`，engine 为 `piasnews_llm_translation`。当前低成本推荐配置是 `PIASNEWS_LLM_TRANSLATION_BASE_URL=https://api.deepseek.com` 和 `PIASNEWS_LLM_TRANSLATION_MODEL=deepseek-v4-flash`；脚本会对 DeepSeek 请求关闭 thinking。最后 `scripts/apply_immersive_translations.py` 同时应用 LLM 映射和沉浸式翻译映射，覆盖 `title_zh` 和 `summary_zh`，并执行 deterministic auto-repair 修正已沉淀的低风险术语坏例。缺少 API、接口失败或仍未生成映射的新内容，会继续走现有离线/沉浸式兜底链路。

沉浸式翻译现在是 LLM 映射不可用时的兜底中文增强链路。`scripts/build_immersive_workbench.mjs` 会为新闻标题、新闻摘要和粉丝源摘要生成 workbench，并过滤纯 URL 短链这类不可翻译目标；生产 Pages artifact 会发布全量采集页到 `https://znonymity.github.io/piasnews/immersive/`。`scripts/run_immersive_workbench.mjs` 会在 `targets_count > 0` 时打开 Chrome，发送沉浸式翻译快捷键，滚动每个 workbench 页让扩展处理完整页面，再采集中文映射并写入 `data/immersive_translations.zh.json`。默认直接运行脚本仍使用本机 workbench；传入 `--public-base-url https://znonymity.github.io/piasnews/immersive` 或设置 `PIASNEWS_IMMERSIVE_PUBLIC_BASE_URL` 后会改用线上 HTTPS workbench。采集目标可用 `--targets missing|non-immersive|all` 控制：`missing` 只补缺失，`non-immersive` 补缺失并替换非沉浸式旧 engine，`all` 会重抓所有当前源文本并覆盖旧映射。生产 workflow 会应用 `engine=piasnews_llm_translation` 和 `engine=immersive_translate_chrome` 的映射覆盖，再执行 deterministic auto-repair；`existing_data_zh`、`published_data_translation` 等旧来源不会再伪装成生产覆盖。采集结束后默认关闭对应 workbench 标签页；如需保留页面，可使用 `--no-close` 或 `PIASNEWS_IMMERSIVE_CLOSE=0`。目标较多时可用 `--tabs 3` 分成多个 workbench tab；如果 Chrome Apple Events 仍不能读取 DOM，但 OpenCLI Browser Bridge 可用，可加 `--browser-driver opencli`。沉浸式流程不调用大模型，只有通过 Codex 手动操纵浏览器时才消耗 Codex token。

映射发布已拆成 apply-only 路径。`PIASNEWS_IMMERSIVE_PUBLISH=1` 会只提交 `data/immersive_translations.zh.json`，push 后用 `gh workflow run update-piasnews.yml -f apply_only=true` 触发线上 workflow。这个模式会跳过新闻、赛历和社交源重新抓取，只在当前已提交数据上运行 Argos fallback、沉浸式映射覆盖、deterministic auto-repair、badcase audit 和 Pages 部署，避免“刚采完映射又抓进新英文内容”导致无法收敛。普通定时或手动数据刷新仍使用默认 `apply_only=false`，会完整抓取最新数据。

Codex 专用流程已封装为 repo skill：`.agents/skills/piasnews-immersive-update/SKILL.md`。之后可以直接要求“跑 Piasnews 沉浸式翻译更新”或“触发 piasnews-immersive-update skill”，让 Codex 按固定步骤同步仓库、触发 Chrome/Option+A、采集映射、提交、触发 apply-only workflow 并验证线上结果。

本机 Chrome 自动采集依赖 Chrome Apple Events 执行只读 DOM 脚本。首次使用前需要在 Chrome 菜单开启 `显示/查看 > 开发者 > 允许来自 Apple Events 的 JavaScript`（英文界面为 `View > Developer > Allow JavaScript from Apple Events`）。如果未开启，沉浸式映射和 Instagram 本机采集都会打开页面但无法读取 DOM，日志会提示 Chrome blocked JavaScript from Apple Events。沉浸式任务检测到该阻断后会写入 `/private/tmp/piasnews-immersive-state.json` 并进入默认 6 小时冷却，后续定时任务会跳过打开 Chrome；开启权限后可用 `PIASNEWS_IMMERSIVE_IGNORE_COOLDOWN=1` 手动跑一次恢复。

生产 workflow 会先运行 `scripts/translate_zh_argos.py` 作为离线中文 fallback，再运行沉浸式翻译映射覆盖。Argos 只在 GitHub Actions 构建时运行，不调用在线翻译 API，也不消耗模型 token；如果后续沉浸式映射可用，它的结果优先级高于 Argos fallback。

手动运行：

```bash
node scripts/run_immersive_workbench.mjs
node scripts/run_immersive_workbench.mjs --public-base-url https://znonymity.github.io/piasnews/immersive
node scripts/run_immersive_workbench.mjs --public-base-url https://znonymity.github.io/piasnews/immersive --targets all --tabs 3
node scripts/run_immersive_workbench.mjs --public-base-url https://znonymity.github.io/piasnews/immersive --targets all --tabs 3 --trigger-shortcut Option+A
node scripts/run_immersive_workbench.mjs --browser-driver opencli --tabs 3 --ignore-cooldown
```

`--trigger-shortcut` 可用于 Apple Events 和 OpenCLI 两种 driver：脚本会先选中每个 workbench 标签页，再发送沉浸式翻译扩展快捷键；当前本机沉浸式翻译动作使用 `Option+A`。默认只更新本地映射并应用到 `data/items.json` / `data/social.json`。如需自动提交映射、push 并触发 GitHub Pages 更新：

```bash
PIASNEWS_IMMERSIVE_IGNORE_COOLDOWN=1 \
PIASNEWS_IMMERSIVE_PUBLISH=1 \
PIASNEWS_IMMERSIVE_APPLY=0 \
PIASNEWS_IMMERSIVE_PUBLIC_BASE_URL=https://znonymity.github.io/piasnews/immersive \
PIASNEWS_IMMERSIVE_TARGETS=all \
PIASNEWS_IMMERSIVE_TABS=3 \
node scripts/run_immersive_workbench.mjs --trigger-shortcut Option+A --wait-ms 180000 --poll-ms 5000
```

无人值守运行使用 wrapper，它会先同步 GitHub 最新数据，再默认使用线上 HTTPS workbench、`Option+A` 快捷键、3 个 tab 和 180 秒等待窗口，采集缺失和非沉浸式旧映射：

```bash
scripts/update_immersive_translations.sh
```

macOS 定时运行可以安装仓库内的 launchd 模板。默认每 30 分钟检查一次；无新增目标时会直接跳过，不打开 Chrome。模板内已设置 `PIASNEWS_IMMERSIVE_PUBLISH=1` 和 `PIASNEWS_IMMERSIVE_APPLY=0`：有新映射时提交映射、push 并触发 GitHub workflow，但不把生成数据长期留成本地未提交改动。

```bash
cp scripts/com.znonymity.piasnews.immersive.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.znonymity.piasnews.immersive.plist
launchctl print gui/$(id -u)/com.znonymity.piasnews.immersive
```

本地更新：

```bash
python3 scripts/fetch_piasnews.py --days 3 --output-dir data
python3 scripts/fetch_f1_calendar.py --output data/calendar.json
python3 scripts/fetch_f1_session_results.py --calendar data/calendar.json --output data/session-results.json
scripts/update_social_agent_reach.sh
python3 scripts/fetch_social_sources.py --days 3 --output data/social.json
python3 scripts/build_history_candidates.py
python3 scripts/validate_history.py
```

## 热榜 MVP（本地版本）

本地前台已将“速读”替换为合并热榜，展示客观热点词、`官 / 媒 / 粉` 来源标签和热度。点击词条进入独立详情页，热点词固定在顶部，官方/媒体内容与粉丝讨论分区展示；图片、视频和封面归属于单条内容，整张内容卡（含标题与媒体）点击后打开原始来源。自动规则位于 `config/hot-ranking.json`，生成命令为：

```bash
python3 scripts/build_hot_events.py
```

比赛周赛段结束并经过 15 分钟确认缓冲后，工作流从 OpenF1 `session_result` 获取 Oscar 的结构化成绩，不依赖新闻标题是否及时收录。结果可用时生成“人物＋场次＋名次/状态”热点并硬置顶第一，支持正常名次以及 DNF、DNS、DSQ；如果结果暂未返回，gate 会在后续检查中重试。最近一次有效成绩会跨日更、翻译发布和后台配置发布保留，直到产生更新的有效赛段成绩，或实际在榜满 24 小时后自动退出；同一成绩重复采集不会重置计时。

后台 `/admin/` 新增热榜工作台。角色由 Worker 的 `ADMIN_KEYS_JSON` 配置：`viewer` 可查看，`editor` 可保存草稿，`publisher` 和 `admin` 可提交生效覆盖。工作台支持查看事件下的当前内容列表，新增、删除或编辑单条内容及其原链接和媒体。覆盖数据与采集数据分开保存；从前台隐藏的事件仍保留在后台并标记为“前台隐藏”。人工指定名次只调整仍满足普通热度门槛的事件顺序，不能阻挡赛后成绩硬置顶，也不能让低于 `minimum_heat`（当前为 8，含热度 0）的事件继续留榜；相同人工名次以最近发布的修改优先。草稿只写入配置，启用覆盖会在配置提交后自动触发正式站发布。热榜写入工作流串行执行；同一事件采用乐观版本校验，旧页面不会静默覆盖其他管理员的新修改，而会要求刷新后重新提交。

本版本不启用评论，也不让大模型直接决定聚类或排名。内容逐步保留 7 天、热度按 72 小时衰减、翻译缓存保留 8 天；正文搜索匹配英文原文。

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
- 中文翻译优化方案：[docs/translation-optimization.zh-CN.md](docs/translation-optimization.zh-CN.md)
- 翻译确认集与术语库说明：[docs/translation-dataset.zh-CN.md](docs/translation-dataset.zh-CN.md)
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
│   ├── session-results.json
│   ├── history-candidates.json
│   ├── history.json
│   ├── items.json
│   ├── rss.xml
│   ├── social.json
│   ├── translation_glossary.csv
│   └── translation_review.csv
├── docs/
│   ├── requirements.md
│   ├── requirements.zh-CN.md
│   ├── translation-dataset.zh-CN.md
│   └── translation-optimization.zh-CN.md
├── piasnews/
│   ├── SKILL.md
│   ├── agents/
│   │   └── openai.yaml
│   ├── evals/
│   │   └── evals.json
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
│   ├── com.znonymity.piasnews.immersive.plist
│   ├── com.znonymity.piasnews.social.plist
│   ├── collect_agent_reach_social.py
│   ├── feishu_translation_base.py
│   ├── fetch_f1_calendar.py
│   ├── fetch_piasnews.py
│   ├── fetch_social_sources.py
│   ├── import_feishu_translation_review.py
│   ├── notify_feishu_badcases.py
│   ├── review_history.py
│   ├── sync_feishu_translation_cases.py
│   ├── sync_feishu_translation_base.py
│   ├── update_social_agent_reach.sh
│   └── validate_history.py
├── supabase/
│   ├── functions/
│   │   └── collect-social/
│   └── migrations/
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
- Each collection run discovers the latest three days and merges verified items into the webpage retention window; the Skill reads the published snapshot by user intent.
- Provides static data files: `data/items.json`, `data/daily.json`, `data/rss.xml`, `data/calendar.json`, `data/social.json`, `data/history.json`, and `data/history-candidates.json`.
- GitHub Actions refreshes data every 6 hours and can also be triggered manually.
- Publishes a public fan daily and data endpoints through GitHub Pages.
- Supports official-only updates, race-week reports, interviews, rumors, and media coverage.
- Supports a Chinese/English website language switch. In Chinese mode, link text can use Chinese titles while preserving original English titles for traceability.
- Supports short, daily, and fan-source tabs. The daily mode merges the useful parts of the previous standard and deep modes; the fan-source tab shows collected X / IG posts and reposts.
- Replies in Chinese by default for Chinese prompts, and in English for English prompts.
- Clearly marks unofficial sources, rumors, and unverified information.
- Supports deterministic history nomination, human scoring, approval/rejection, and immediate Pages publication.
- Adds anonymous PV analytics with 7/30/90-day trends, historical periods, peak days, top pages, and referrer sites in the admin console.
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

## Skill Capabilities

| User intent | Data source | Default response |
| --- | --- | --- |
| Today's hot ranking, what fans discuss | `hot-events.json` | Current visible list in published rank order |
| Daily, today's news, latest Piastri update | `items.json` | Concise digest for the target date |
| Recent official updates, official only | `official: true` rows in `items.json` | Latest official items |
| Fan posts, X / IG, Fan Sources | `fan_watch` rows in `social.json` | Latest fan posts |
| Every recent article | `items.json` | Complete current-window list |
| Next race and weekend sessions | `calendar.json` | Next future session and weekend schedule |
| Oscar basics, who drives car 81 | official Oscar / F1 / McLaren pages | Short verified profile |

The Skill reads only the data source that matches the request and returns concise Markdown in the conversation. Today's hot ranking is not re-ranked or expanded and does not generate charts, images, or visualizations unless the user explicitly requests another format. Looking Back is no longer a Skill capability. See [SKILL.md](piasnews/SKILL.md) and the [published-data guide](piasnews/references/sources.md).

## Public Fan Daily

- Web page: https://znonymity.github.io/piasnews/
- The page provides short, daily, and fan-source tabs. Short and daily share the same verified static data; fan sources reads `data/social.json`.
- The fan-source tab displays collected X / IG posts and reposts only. The maintained source list remains backend configuration and is not shown on the public page.
- The top-right language switch toggles Chinese and English UI. Chinese mode prefers `title_zh` and `summary_zh`, so even the article link text can be Chinese while the original English title remains available for traceability.
- The page shows separate China Standard Time refresh times for news data, X / IG fan-source generation, and the newest retained X / IG item, and includes a manual refresh control.
- The page reads the F1 calendar and shows the next Grand Prix, race-week timing, and a live countdown to the next session. During practice, sprint qualifying, sprint, qualifying, or the race, the timer switches to elapsed time, then moves to the next session after the expected session duration. The page exposes iCalendar links for adding the next race, the next race weekend, or the full season to any iCalendar-compatible calendar app.
- Each data workflow fully audits Chinese translations, appends suspected review-needed badcases with concrete suggested Chinese text to `data/translation_candidates.csv`, and uploads the current run's new candidates as an Excel artifact.
- If the repository has a `FEISHU_WEBHOOK_URL` secret, the workflow sends a Feishu notification when the current run finds new translation badcases, including the count, preview, Feishu review table link, and latest Excel link. The active Codex conversation is not treated as a stable inbound target for GitHub Actions.
- If another Feishu account creates a separate custom bot in the target group and its webhook URL is stored as the GitHub Actions secret `PIASNEWS_FEISHU_WEBHOOK_URL`, the workflow sends a refresh notification after meaningful public data changes are deployed to Pages. This public-refresh bot is separate from the translation-review `FEISHU_WEBHOOK_URL`.
- Each successful GitHub Actions collection redeploys the page and JSON/RSS in the same workflow, keeping them synchronized.
- Browser-side deterministic templates generate the views without an LLM or model-token usage.

## Feishu Translation Review Table

The review surface for translation badcases can be a Feishu Base table or the Excel artifact. `data/translation_candidates.csv` is the repository-tracked review-needed queue; the production workflow no longer syncs candidates into a Feishu pending queue and no longer marks missing candidates as ignored. `data/translation_review.csv` may still be maintained as a future training/evaluation set, but the default production workflow no longer imports approved rows or uses them to overwrite live Chinese text. The workflow supports these settings:

- GitHub Secrets: `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `FEISHU_BASE_APP_TOKEN`, `FEISHU_BASE_TABLE_ID`.
- GitHub Variable: `FEISHU_BASE_URL`, used in Feishu notifications as the clickable review-table link.

Recommended Base fields:

- `候选ID`
- `运行ID`
- `首次发现`
- `来源类型`
- `场景`
- `原始链接`
- `来源`
- `英文原文`
- `当前中文`
- `建议中文`
- `审核状态`
- `优先级`
- `错误类型`
- `标签`
- `备注`

Put `英文原文`, `当前中文`, `建议中文`, `审核状态`, and `备注` near the front of the review view. Feishu Base keeps the primary field first, so `候选ID` remains the first column if it is the primary field.

If a separate future training-sample library is needed, recommended fields for the `翻译案例库` table:

- `英文原文`
- `当前中文`
- `建议中文`
- `审核状态`
- `备注`
- `样本ID`
- `来源类型`
- `场景`
- `优先级`
- `标签`

Review flow:

1. Open the Feishu review table.
2. Check `英文原文`, `当前中文`, and `建议中文`.
3. If the suggested translation should enter the confirmed set, set `审核状态` to `approved`.
4. If no action is needed, set it to `ignored` or leave it as `pending`.
5. The default production workflow does not import approved rows to overwrite live translations; `approved` only marks samples that may enter a future training/evaluation set.

Sync rules:

- New candidates are inserted into Feishu Base.
- Existing candidates are refreshed with source text, current translation, suggested translation, and notes.
- Rows already marked `approved`, `rejected`, `ignore`, or `ignored` keep their review status.
- `data/translation_candidates.csv` remains the repository-tracked audit queue; the review table is the human inbox.
- The `翻译案例库` table is currently an optional training-sample mirror and is not part of the default production translation path.
- Fully automated Feishu reads and writes require valid Feishu app credentials in GitHub Actions. Without `FEISHU_APP_ID` / `FEISHU_APP_SECRET`, local user-authorized writes can still work, but the workflow skips Feishu I/O.

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

Each collector run discovers only the latest three days and verifies the publisher date before merging valid items into the webpage retention window. The Skill reads the public snapshot by default: “today” is filtered in the user's timezone, and “all news” uses the current published window without expanding searches merely to add volume.

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

GitHub Actions import: store the same JSON in the repository variable `PIASNEWS_SOCIAL_INPUT_JSON`, or store a remote compact-JSON endpoint in repository variable `PIASNEWS_SOCIAL_INPUT_URL`. If the endpoint needs a bearer token, store it as secret `PIASNEWS_SOCIAL_INPUT_AUTH_BEARER`. The next `Update Piasnews Data` run will generate and publish the fan-source feed. The fan-source tab shows one removal-on-rights-request notice above the feed; each card only shows account attribution.

Fan sources and daily news share the same static GitHub Pages delivery layer, but their collection layers differ. Daily news is collected every six hours by GitHub Actions through RSS/web sources with publisher-date verification, with a second backup schedule ten minutes later to reduce the impact of delayed or dropped GitHub scheduled runs. Fan sources are collected locally through Agent-Reach, an always-on machine, or an external scheduler, then normalized and deployed by GitHub Actions. GitHub Actions cannot read your local X browser session.

To migrate X / IG collection to an always-on environment, run the collector on a mini PC, VPS, Supabase Edge Function, or external scheduler, generate compact social JSON, then pass it into the `Update Piasnews Data` workflow through `PIASNEWS_SOCIAL_INPUT_URL`, `PIASNEWS_SOCIAL_INPUT_JSON`, or the Supabase collector's external-input configuration. X can apply stricter risk controls to data-center IPs, so the low-cost preference is an always-on local/home machine first. If an official X API bearer token is available, Supabase can solve the "local host is asleep, so the schedule does not run" problem. Supabase cannot reuse your local Chrome login state, Agent-Reach cookies, or the Immersive Translate browser extension; those flows still require a local host or a server-side API / compact JSON push replacement.

The repository includes a Supabase migration skeleton:

- `supabase/migrations/0001_social_import_snapshots.sql`: stores the latest compact social import snapshots.
- `supabase/functions/collect-social/index.ts`: collects X timelines through the official X API, can merge external compact JSON inputs including IG, writes a snapshot, and can dispatch `update-piasnews.yml`.
- `supabase/functions/collect-social/README.md`: lists Supabase secrets, GitHub variables, and scheduling setup.

After deployment, set `PIASNEWS_SOCIAL_INPUT_URL` to `https://<project>.functions.supabase.co/collect-social`. Supabase creates the fresh snapshot on a schedule, while GitHub Actions keeps the existing normalization, translation, audit, and Pages deployment pipeline. If IG is collected by another backend, configure its compact JSON endpoint as Supabase secret `PIASNEWS_INSTAGRAM_INPUT_URL`, or push a JSON body to the collector; the local scheduler then no longer needs to open Instagram.

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

The script reads X accounts from `piasnews/references/x-sources.json` and tries `OpenCLI → X Web GraphQL → twitter-cli` by default before filtering to the latest three days, writing the import JSON, and updating `data/social.json`. OpenCLI's `media_urls` / `media_posters` are normalized into image, video, and poster fields. If its browser bridge is unavailable, the collector reuses local cookies from `~/.agent-reach/config.yaml` for X Web GraphQL so a text-only legacy `twitter-cli` response cannot silently remove current media. Use `--backend opencli|x-web|twitter-cli` to pin a backend; `source_status[].method` records the path actually used.

This local collection is not a resident service. A manual run executes once; unattended fan-source updates require an external scheduler such as macOS `launchd`, cron, or another local runner. The script is plain Python/CLI work and does not call an LLM or consume Codex tokens; Codex quota is used only when Codex is asked to run, commit, or debug it.

`daily_core` and `fan_watch` are maintained in the same source table but rendered separately. `daily_core` is folded into the normal daily item flow, while the fan-source tab reads only `fan_watch` items. The automation script collects all groups by default; use `PIASNEWS_SOCIAL_GROUPS=fan_watch` or `PIASNEWS_SOCIAL_GROUPS=daily_core` to limit collection.

Full local publish script:

```bash
scripts/update_social_agent_reach.sh
```

By default it collects all X groups and also tries to collect Oscar Piastri's latest public Instagram posts/reels through the logged-in local Chrome profile. If Chrome Apple Events still blocks DOM reads, the Instagram collector automatically falls back to OpenCLI Browser Bridge; `source_status[].method` will show `opencli-browser` in the import JSON. If IG has moved to Supabase or another backend import, set `PIASNEWS_COLLECT_INSTAGRAM=0` so the local script collects X only and does not open Instagram or OpenCLI Browser. It then updates the social snapshot, builds a v2 compact import containing only the latest three-day discovery window, writes `PIASNEWS_SOCIAL_INPUT_JSON`, and lets GitHub merge that increment into the retained seven-day dataset before triggering the `Update Piasnews Data` workflow. Legacy `agent-reach/compact-social` snapshots without the v2 marker are ignored and cannot keep overwriting live data. The compact import records the collector version, generated time, item count, and media-item count; generated time is ignored when comparing snapshots, so unchanged content still skips the GitHub variable update and workflow dispatch. If a fresh record for the same URL omits attachments, the merge preserves the prior image, video, and poster. A pre-publish validation also rejects any refresh that strips media fields from retained posts. The public page displays both the social feed generation time and the newest retained post time, because a fresh generation can still contain no newer qualifying posts after the Piastri relevance filter runs. The script verifies that at least one social source collected successfully before publishing; authentication, DNS, network, or Chrome DOM permission failures stop before updating GitHub when no source succeeded, so a failed collection is not presented as a fresh X / IG update. Set `PIASNEWS_FORCE_SOCIAL_PUBLISH=1` to force a publish. To update local files only:

```bash
PIASNEWS_SKIP_GITHUB=1 scripts/update_social_agent_reach.sh
```

To collect only fan sources:

```bash
PIASNEWS_SOCIAL_GROUPS=fan_watch scripts/update_social_agent_reach.sh
```

For unattended macOS operation, use `launchd`. The included template runs a lightweight check every 10 minutes, but `PIASNEWS_SOCIAL_MIN_INTERVAL_SECONDS=10800` makes the script collect only when the last successful collection is more than three hours old. If the Mac sleeps through the interval, the next check after wake catches up. The Application Support runtime performs `git pull --ff-only` immediately before a real collection and fails closed when its repository is stale, dirty, or conflicted. Its normalized social output is written to a temporary file so scheduled runs no longer dirty the runtime repository's `data/social.json`.

```bash
mkdir -p "$HOME/Library/Application Support/piasnews"
cp -X scripts/update_social_agent_reach.sh "$HOME/Library/Application Support/piasnews/update_social_agent_reach.sh"
cp scripts/com.znonymity.piasnews.social.plist "$HOME/Library/LaunchAgents/"
launchctl load "$HOME/Library/LaunchAgents/com.znonymity.piasnews.social.plist"
```

## Static Data

GitHub Pages:

- Fan daily: https://znonymity.github.io/piasnews/
- Latest items: https://znonymity.github.io/piasnews/data/items.json
- Daily stats: https://znonymity.github.io/piasnews/data/daily.json
- RSS feed: https://znonymity.github.io/piasnews/data/rss.xml
- F1 calendar: https://znonymity.github.io/piasnews/data/calendar.json
- Latest session result: https://znonymity.github.io/piasnews/data/session-results.json
- Add next race: https://znonymity.github.io/piasnews/data/next-race.ics
- Add next race weekend: https://znonymity.github.io/piasnews/data/next-weekend.ics
- Add full season: https://znonymity.github.io/piasnews/data/full-season.ics
- X / IG updates: https://znonymity.github.io/piasnews/data/social.json
- Historical events: https://znonymity.github.io/piasnews/data/history.json
- History candidates: https://znonymity.github.io/piasnews/data/history-candidates.json
- History retrieval config: https://znonymity.github.io/piasnews/data/history-retrieval.json

GitHub raw fallback:

- Latest items: [data/items.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/items.json)
- Daily stats: [data/daily.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/daily.json)
- RSS feed: [data/rss.xml](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/rss.xml)
- F1 calendar: [data/calendar.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/calendar.json)
- Latest session result: [data/session-results.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/session-results.json)
- Add next race: [data/next-race.ics](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/next-race.ics)
- Add next race weekend: [data/next-weekend.ics](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/next-weekend.ics)
- Add full season: [data/full-season.ics](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/full-season.ics)
- Historical events: [data/history.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/history.json)
- History candidates: [data/history-candidates.json](https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/data/history-candidates.json)
- History retrieval config: [piasnews/references/history-retrieval.json](piasnews/references/history-retrieval.json)

## Chinese Translation

After news and social data are fetched, GitHub Actions first runs `scripts/translate_zh_argos.py` as an offline Chinese fallback. If `PIASNEWS_LLM_TRANSLATION_API_KEY` is configured, it then runs `scripts/translate_zh_llm_mapping.py` to translate only missing mapping targets through an OpenAI-compatible Chat Completions API and write entries to `data/immersive_translations.zh.json` with engine `piasnews_llm_translation`. The current low-cost recommended settings are `PIASNEWS_LLM_TRANSLATION_BASE_URL=https://api.deepseek.com` and `PIASNEWS_LLM_TRANSLATION_MODEL=deepseek-v4-flash`; the script disables thinking for DeepSeek requests. `scripts/apply_immersive_translations.py` then applies both LLM and Immersive mappings before deterministic auto-repair fixes accumulated low-risk terminology issues. When the API is absent or fails, the existing offline and Immersive fallback paths keep the site publishable.

Immersive Translate is now the fallback Chinese enhancement path when LLM mappings are unavailable. `scripts/build_immersive_workbench.mjs` creates a workbench for news titles, news summaries, and fan-source summaries, and filters URL-only short links that cannot be translated. The production Pages artifact publishes full capture pages under `https://znonymity.github.io/piasnews/immersive/`. `scripts/run_immersive_workbench.mjs` opens Chrome only when `targets_count > 0`, sends the Immersive Translate shortcut, scrolls each workbench page so the extension processes the full page, captures Chinese mappings, and writes `data/immersive_translations.zh.json`. Running the script directly still uses the local workbench by default; pass `--public-base-url https://znonymity.github.io/piasnews/immersive` or set `PIASNEWS_IMMERSIVE_PUBLIC_BASE_URL` to use the HTTPS workbench. Use `--targets missing|non-immersive|all` to control capture scope: `missing` only fills absent mappings, `non-immersive` fills absent mappings and replaces old non-Immersive engines, and `all` recaptures every current source text and overwrites prior mappings. The production workflow applies `engine=piasnews_llm_translation` and `engine=immersive_translate_chrome` entries before deterministic auto-repair, so `existing_data_zh` and `published_data_translation` entries no longer masquerade as production overrides. After capture, it closes matching workbench tabs by default; use `--no-close` or `PIASNEWS_IMMERSIVE_CLOSE=0` to keep the page open. For larger batches, pass `--tabs 3` to split targets across several workbench tabs. If Chrome Apple Events still cannot read DOM but OpenCLI Browser Bridge is available, pass `--browser-driver opencli`. The Immersive flow does not call an LLM; Codex tokens are used only when Codex itself is asked to drive or debug the browser.

Mapping publication uses an apply-only workflow dispatch. `PIASNEWS_IMMERSIVE_PUBLISH=1` commits only `data/immersive_translations.zh.json`, pushes it, then runs `gh workflow run update-piasnews.yml -f apply_only=true`. In this mode the workflow skips news, calendar, and social refetching, and only runs Argos fallback, Immersive mapping overwrite, deterministic auto-repair, badcase audit, and Pages deployment against the already committed data. This avoids introducing new English source text while applying freshly captured mappings. Normal scheduled or manual data refreshes keep the default `apply_only=false` and still fetch fresh data.

The Codex-specific flow is packaged as a repo skill at `.agents/skills/piasnews-immersive-update/SKILL.md`. In a later Codex thread, ask to run the Piasnews Immersive update or trigger the `piasnews-immersive-update` skill; it will sync the repo, trigger Chrome/Option+A, capture mappings, commit them, dispatch the apply-only workflow, and verify the live result.

Local Chrome capture depends on Chrome Apple Events running a read-only DOM script. Before first use, enable `View > Developer > Allow JavaScript from Apple Events` in Chrome. Without it, the Immersive mapping job and local Instagram collector can open pages but cannot read DOM; logs will report that Chrome blocked JavaScript from Apple Events. When the Immersive job detects that block, it writes `/private/tmp/piasnews-immersive-state.json` and enters a default six-hour cooldown, so later scheduled runs skip opening Chrome. After enabling the Chrome setting, run once with `PIASNEWS_IMMERSIVE_IGNORE_COOLDOWN=1` to resume immediately.

The production workflow installs and runs `scripts/translate_zh_argos.py` as a build-time offline fallback before Immersive Translate mappings are applied. If Immersive mappings exist, they remain the higher-priority source.

Manual run:

```bash
node scripts/run_immersive_workbench.mjs
node scripts/run_immersive_workbench.mjs --public-base-url https://znonymity.github.io/piasnews/immersive
node scripts/run_immersive_workbench.mjs --public-base-url https://znonymity.github.io/piasnews/immersive --targets all --tabs 3
node scripts/run_immersive_workbench.mjs --public-base-url https://znonymity.github.io/piasnews/immersive --targets all --tabs 3 --trigger-shortcut Option+A
node scripts/run_immersive_workbench.mjs --browser-driver opencli --tabs 3 --ignore-cooldown
```

`--trigger-shortcut` works with both Apple Events and OpenCLI drivers: the script selects each workbench tab and sends the Immersive Translate extension shortcut. The current local Immersive Translate action uses `Option+A`. By default it only updates local mappings and applies them to `data/items.json` / `data/social.json`. To commit the mapping, push it, and trigger the GitHub Pages refresh:

```bash
PIASNEWS_IMMERSIVE_IGNORE_COOLDOWN=1 \
PIASNEWS_IMMERSIVE_PUBLISH=1 \
PIASNEWS_IMMERSIVE_APPLY=0 \
PIASNEWS_IMMERSIVE_PUBLIC_BASE_URL=https://znonymity.github.io/piasnews/immersive \
PIASNEWS_IMMERSIVE_TARGETS=all \
PIASNEWS_IMMERSIVE_TABS=3 \
node scripts/run_immersive_workbench.mjs --trigger-shortcut Option+A --wait-ms 180000 --poll-ms 5000
```

For unattended local operation, use the wrapper. It pulls the latest GitHub data first, then defaults to the HTTPS workbench, `Option+A`, three tabs, and a 180-second wait window while checking for absent or non-Immersive mappings:

```bash
scripts/update_immersive_translations.sh
```

On macOS, install the included launchd template. It checks every 30 minutes by default and skips without opening Chrome when there are no new targets. The template sets `PIASNEWS_IMMERSIVE_PUBLISH=1` and `PIASNEWS_IMMERSIVE_APPLY=0`: new mappings are committed, pushed, and followed by a GitHub workflow dispatch, while generated data files are not left as recurring local dirty changes.

```bash
cp scripts/com.znonymity.piasnews.immersive.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.znonymity.piasnews.immersive.plist
launchctl print gui/$(id -u)/com.znonymity.piasnews.immersive
```

To enable Feishu notifications for new translation badcase Excel exports, create a Feishu incoming webhook in the target group and add it as the GitHub Actions secret `FEISHU_WEBHOOK_URL`. The notification sends a link to the latest published Excel file; uploading the file itself requires a Feishu app with file-upload permission.

To enable the separate public-refresh group notification, use the other Feishu account to create a custom bot in that group and add its webhook URL as the GitHub Actions secret `PIASNEWS_FEISHU_WEBHOOK_URL`. This bot is intentionally separate from `FEISHU_WEBHOOK_URL`: it sends only post-deploy website refresh messages for meaningful changes in public data such as news, fan-source updates, calendar data, translation mappings, or history candidates.

Update locally:

```bash
python3 scripts/fetch_piasnews.py --days 3 --output-dir data
python3 scripts/fetch_f1_calendar.py --output data/calendar.json
python3 scripts/fetch_f1_session_results.py --calendar data/calendar.json --output data/session-results.json
scripts/update_social_agent_reach.sh
python3 scripts/fetch_social_sources.py --days 3 --output data/social.json
python3 scripts/build_history_candidates.py
python3 scripts/validate_history.py
```

## Hot Ranking MVP (local only)

The former Short tab is now a merged hot ranking with objective hot words, source labels, integer heat, and related items. Deterministic rules live in `config/hot-ranking.json`; generate the snapshot with `python3 scripts/build_hot_events.py`.

After a race-weekend session and its 15-minute confirmation buffer, the workflow reads Oscar's structured result from OpenF1 `session_result`. A normal position or DNF/DNS/DSQ status becomes the hard-ranked first event. It survives daily, translation, and editorial rebuilds until a newer valid session result replaces it or it has been ranked for 24 hours; refetching the same result does not reset that timer. Missing results remain unhandled so the 15-minute gate retries instead of silently accepting a result-less refresh.

The `/admin/` workbench uses Worker roles configured through `ADMIN_KEYS_JSON`: viewers can inspect, editors can save drafts, and publishers or admins can activate overrides. Editorial overlays remain separate from collected source data. Events hidden from the public ranking remain visible and labeled in the workbench. An editorial position only reorders an event that still meets the normal `minimum_heat` threshold; it cannot displace the session-result hard rule or keep a zero-heat event on the ranking. The newest publication wins a same-slot editorial collision. Drafts only update configuration; activating an override automatically triggers a production-site deployment after the configuration commit. Writes are serialized, and optimistic per-event version checks reject stale edits instead of silently overwriting another administrator's work.

Comments and direct model-based ranking are out of scope for this MVP. Content is gradually retained for seven days, heat uses a decayed 72-hour window, translations are cached for eight days, and body search matches original English text.

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
- Chinese translation optimization: [docs/translation-optimization.zh-CN.md](docs/translation-optimization.zh-CN.md)
- Translation review and glossary guide: [docs/translation-dataset.zh-CN.md](docs/translation-dataset.zh-CN.md)
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
│   ├── session-results.json
│   ├── history-candidates.json
│   ├── history.json
│   ├── items.json
│   ├── rss.xml
│   ├── social.json
│   ├── translation_glossary.csv
│   └── translation_review.csv
├── docs/
│   ├── requirements.md
│   ├── requirements.zh-CN.md
│   ├── translation-dataset.zh-CN.md
│   └── translation-optimization.zh-CN.md
├── piasnews/
│   ├── SKILL.md
│   ├── agents/
│   │   └── openai.yaml
│   ├── evals/
│   │   └── evals.json
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
│   ├── import_feishu_translation_review.py
│   ├── review_history.py
│   ├── sync_feishu_translation_base.py
│   ├── sync_feishu_translation_cases.py
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
