# Piasnews 翻译确认集与术语库

## 结论

建立人工确认集是当前最稳的路线。人名、队名、常见缩写优先保留英文，其余 F1 术语、新闻标题短语和粉丝源口语进入结构化表。

仓库使用 CSV 作为源数据：

- `data/translation_review.csv`：可选人工确认样本集，适合后续训练、评估和规则沉淀；默认生产 workflow 不再读取它覆盖线上译文。
- `data/translation_candidates.csv`：自动审查发现的待确认坏例，所有新增行默认 `pending`。
- `data/translation_glossary.csv`：F1 术语和短语库，适合稳定修正高频误译。

CSV 可以直接用 Excel / WPS / Numbers 打开。暂不把 `.xlsx` 作为主文件，因为二进制文件不利于 Git diff、代码审查和合并冲突处理。每次 GitHub Actions 更新数据后，`scripts/audit_translations.py` 会额外生成本轮新增候选的 Excel 文件 `translation_candidates_latest.xlsx`，并作为 workflow artifact 上传。

飞书当前主要作为翻译 badcase 通知和人工审核入口。仓库 CSV 是可追溯源数据；如后续需要训练样本库，可以另建飞书“翻译案例库”表作为 approved 样本镜像，但它不参与默认生产翻译链路。

人名、车队名、赛道名这类稳定映射统一放在 `translation_glossary.csv`，例如 `奥斯卡·Piastri -> Oscar Piastri`、`红牛环 -> Red Bull Ring`。这类问题不再作为新增 badcase 进入 `translation_candidates.csv`；候选表优先保留需要人工判断语义的坏例，例如 `move` 在转会语境下不应译为“行动”。

## 字段说明

### `translation_review.csv`

| 字段 | 说明 |
| --- | --- |
| `id` | 样本唯一 ID |
| `source_type` | `news` / `social` / `team_radio` |
| `domain` | 场景，例如 `f1_news_title`、`x_post` |
| `source_text` | 英文原文 |
| `current_zh` | 当前机器译文 |
| `suggested_zh` | 建议中文译文 |
| `status` | `pending` / `approved` / `rejected` |
| `priority` | `high` / `medium` / `low` |
| `tags` | 逗号分隔标签 |
| `notes` | 审核备注 |

`pending` 用来给你审核，不会自动上线。把样本设为 `approved` 本身不是微调，也不是 SFT；当前只表示该样本可进入后续训练 / 评估集。默认生产 workflow 不再把 approved 样本作为确定性人工译文覆盖。

粉丝源 `social` 有一个额外保护：最终页面始终保留英文原文用于溯源。未命中沉浸式翻译映射时，当前 workflow 仍会先经过 Argos / 确定性 fallback 生成中文保底；如果后续审查发现坏中文，应优先沉淀为 glossary、source-aware repair 或新的沉浸式映射，而不是依赖人工 approved 直接覆盖生产。

### `translation_candidates.csv`

| 字段 | 说明 |
| --- | --- |
| `id` | 候选唯一 ID，按 `source_type + domain + source_text` 确定性生成 |
| `run_id` | 发现该候选的审查运行 ID |
| `first_seen_at` | 首次发现时间 |
| `source_type` | `news` / `social` |
| `domain` | `f1_news_title`、`f1_news_summary`、`x_post`、`team_radio`、`interview_quote` |
| `url` | 来源链接 |
| `source` | 来源媒体或账号 |
| `source_text` | 英文原文 |
| `current_zh` | 当前中文 |
| `suggested_zh` | 规则生成的初步建议，可能为空，需人工判断 |
| `status` | 默认 `pending` |
| `priority` | `high` / `medium` / `low` |
| `error_type` | 自动检测到的错误类型 |
| `tags` | 逗号分隔标签 |
| `notes` | 对抗式审查备注 |

自动审查只负责发现问题，不会把候选直接写入 `translation_review.csv`。你确认后，可以把高质量样本转入 `translation_review.csv` 并设为 `approved`，作为后续训练 / 评估数据。

### `translation_glossary.csv`

| 字段 | 说明 |
| --- | --- |
| `source` | 英文术语或短语 |
| `target` | 中文目标译法，或保留英文 |
| `type` | `person` / `team` / `term` / `phrase` 等 |
| `scope` | `all` / `news` / `social` |
| `case_sensitive` | 是否区分大小写 |
| `status` | `approved` / `pending` / `rejected` |
| `notes` | 备注 |

术语库可以先作为规则后处理使用；如果之后做离线模型微调，也可以把它转成术语约束和评估用例。术语表本身不是微调，它是规则层。

稳定实体映射也放在这个文件中。新增人名、车队名、赛道名时，优先补这里，而不是新增整句 badcase。

位置缩写默认覆盖 `P1-P22`，适配 11 支车队的 22 台车；如果未来车队数量变化，再扩展这个范围。

## 人名规则

默认保留英文：

- 车手、领队、经理、工程师等人名保留英文。
- 姓氏或名字单独出现都可以保留英文；不强制统一为姓氏，只要读者能理解指向即可。
- 不使用半中半英形式，例如避免 `奥斯卡·Piastri`。
- 粉丝源中 `Oscar` 可以保留英文，因为语气更自然。

## 审核流程

1. 新抓取数据进入 `data/items.json` / `data/social.json`。
2. 抓取脚本先写入英文原文、确定性中文概括或英文兜底，保证没有映射时页面也能发布。
3. GitHub Actions 在临时 runner 中先恢复 pip / Argos cache；cache 命中时复用 `argostranslate` 下载缓存和 Argos 语言包，cache 未命中时按原逻辑安装 Argos Translate。
4. GitHub Actions 调用 `scripts/translate_zh_argos.py` 生成离线中文 fallback。Argos 是沉浸式映射缺失时的自动保底，不是最终质量层。
5. 本机运行 `scripts/run_immersive_workbench.mjs` 时，脚本会打开本地 workbench 页面；需要人工点击沉浸式翻译悬浮球触发页面翻译，脚本再通过 Apple Events 或 OpenCLI 读取翻译后的 DOM，并把结果写入 `data/immersive_translations.zh.json`。
6. GitHub Actions 调用 `scripts/apply_immersive_translations.py`，把 `data/immersive_translations.zh.json` 中的沉浸式翻译映射覆盖到 `title_zh` / `summary_zh`。
7. 映射覆盖时立即执行术语表和 source-aware auto-repair：这是基于英文原文关键词 / 短语触发的确定性后处理，例如把 F1 语境下的 `stewards`、`qualifying`、`pole` 等误译修回稳定译法。
8. GitHub Actions 调用 `scripts/audit_translations.py` 完整遍历最终展示中文，执行对抗式审查。
9. 新发现的坏例进入 `data/translation_candidates.csv`，本轮新增候选同时导出为 `translation_candidates_latest.csv` 和 `translation_candidates_latest.xlsx`。
10. 如果配置了 `FEISHU_WEBHOOK_URL`，GitHub Actions 调用 `scripts/notify_feishu_badcases.py` 发送本轮新增 badcase 通知；飞书审核表可作为人工处理入口，但当前默认生产 workflow 不把飞书 approved 结果写回生产覆盖链路。
11. 你在飞书审核表或 CSV 中检查 `英文原文`、`当前中文`、`建议中文`。如果认可，把 `审核状态` 改为 `approved`；如果暂不处理，保持 `pending`；如果不需要进入确认集，可改为 `ignored`。
12. 默认 GitHub Actions 不会把飞书审核表或 `translation_review.csv` 的 approved 行写回生产链路，也不会用 approved 覆盖同一 `source_text`。
13. 当样本积累到 100-300 条，再导出为微调或规则评估数据集。

## 飞书 Base 配置

GitHub Actions 读取以下配置：

- Secrets：`FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`FEISHU_BASE_APP_TOKEN`、`FEISHU_BASE_TABLE_ID`
- Variable：`FEISHU_BASE_URL`
- Secret：`FEISHU_WEBHOOK_URL`，用于发送本轮新增翻译 badcase 通知

审核表推荐字段：

| 飞书字段 | 含义 |
| --- | --- |
| `候选ID` | 对应候选 `id`，用于去重和更新 |
| `运行ID` | 发现该候选的审查运行 |
| `首次发现` | 首次发现时间 |
| `来源类型` | `news` / `social` |
| `场景` | 标题、摘要、X post、TR 等 |
| `原始链接` | 新闻或社交原帖链接 |
| `来源` | 媒体或账号 |
| `英文原文` | 原始英文 |
| `当前中文` | 当前线上中文 |
| `建议中文` | 规则生成或人工修正后的建议 |
| `审核状态` | `pending` / `approved` / `ignored` / `rejected` |
| `优先级` | `high` / `medium` / `low` |
| `错误类型` | 自动检测类型 |
| `标签` | 逗号分隔标签 |
| `备注` | 审查说明 |

审核表视图建议把 `英文原文`、`当前中文`、`建议中文`、`审核状态`、`备注` 放在前部。飞书 Base 会强制主字段在第一列，因此如果 `候选ID` 是主字段，它会保留在最前。

可选“翻译案例库”表推荐字段：

| 飞书字段 | 含义 |
| --- | --- |
| `英文原文` | 原始英文 |
| `当前中文` | 当时线上中文 |
| `建议中文` | 已确认中文 |
| `审核状态` | 固定为 `approved`，表示可进入训练 / 评估集 |
| `备注` | 审核备注 |
| `样本ID` | 对应训练 / 评估样本 ID |
| `来源类型` | `news` / `social` / `team_radio` |
| `场景` | 标题、摘要、X post、TR 等 |
| `优先级` | `high` / `medium` / `low` |
| `标签` | 逗号分隔标签 |

同步规则：

- `候选ID` 是唯一键；重复候选不会新增多行。
- 新候选默认写入 `审核状态=pending`。
- 如果某行已经是 `approved`、`rejected`、`ignore` 或 `ignored`，后续同步不会覆盖它的审核状态。
- `approved` 不是模型微调动作，也不代表默认上线覆盖；它只是把该样本标为可进入后续训练 / 评估集。
- `样本ID` 是“翻译案例库”的唯一键；同一 approved 样本会更新既有行，不会重复新增。
- 全自动飞书 Base 读写依赖 GitHub Actions 中的飞书应用凭证。当前默认 workflow 以 badcase 通知为主；如果后续恢复 Base 同步，需要同步更新 workflow 与本文档。

## 微调前置标准

先评估规则和术语表是否已经解决大部分问题。只有满足以下条件时再做微调：

- `translation_review.csv` 有至少 100 条 approved 高质量样本。
- 覆盖新闻标题、X 粉丝短句、TR、赛段结果、传闻标题、处罚/干事公告。
- 单靠术语表仍无法解决语序、语气、标题压缩等问题。

这类工作更准确地说是“领域微调”或“继续训练/指令微调”，不是从零预训练。
