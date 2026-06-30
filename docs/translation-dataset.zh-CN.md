# Piasnews 翻译确认集与术语库

## 结论

建立人工确认集是当前最稳的路线。人名、队名、常见缩写优先保留英文，其余 F1 术语、新闻标题短语和粉丝源口语进入结构化表。

仓库使用 CSV 作为源数据：

- `data/translation_review.csv`：人工确认样本，适合收集坏例、建议译文、审核状态。
- `data/translation_candidates.csv`：自动审查发现的待确认坏例，所有新增行默认 `pending`。
- `data/translation_glossary.csv`：F1 术语和短语库，适合稳定修正高频误译。

CSV 可以直接用 Excel / WPS / Numbers 打开。暂不把 `.xlsx` 作为主文件，因为二进制文件不利于 Git diff、代码审查和合并冲突处理。每次 GitHub Actions 更新数据后，`scripts/audit_translations.py` 会额外生成本轮新增候选的 Excel 文件 `translation_candidates_latest.xlsx`，并作为 workflow artifact 上传。

为了避免每次下载 Excel，仓库也支持把候选同步到飞书多维表格 Base。飞书审核表作为人工审核入口，仓库 CSV 作为可追溯源数据；另有一个飞书“翻译案例库”表作为 approved 样本的只读镜像，方便查看已经入库的案例。

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

只有 `status=approved` 的样本才会被翻译脚本采用。`pending` 用来给你审核，不会自动上线。把样本设为 `approved` 本身不是微调，也不是 SFT；当前只是确定性人工译文覆盖。后续如果要训练小模型，会从 approved 样本另行导出训练/验证集。

粉丝源 `social` 有一个额外保护：未命中 approved 样本时，不再调用机器翻译生成中文，而是保留英文原文作为标题兜底，避免产生误导性的坏中文。

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

自动审查只负责发现问题，不会把候选直接写入 `translation_review.csv`。你确认后，再把高质量样本转入 `translation_review.csv` 并设为 `approved`。

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
2. GitHub Actions 调用 `scripts/translate_zh_argos.py` 生成中文字段。
3. 如果配置了飞书 Base，GitHub Actions 先调用 `scripts/import_feishu_translation_review.py`，把飞书表中 `审核状态=approved` 的行导入 `data/translation_review.csv`。
4. GitHub Actions 调用 `scripts/audit_translations.py` 完整遍历新闻和社交翻译，执行对抗式审查。
5. 新发现的坏例进入 `data/translation_candidates.csv`，本轮新增候选同时导出为 `translation_candidates_latest.csv` 和 `translation_candidates_latest.xlsx`。
6. 如果配置了飞书 Base，GitHub Actions 调用 `scripts/sync_feishu_translation_base.py`，把本轮新增候选同步到飞书审核表。
7. 你在飞书审核表中检查 `英文原文`、`当前中文`、`建议中文`。如果认可，把 `审核状态` 改为 `approved`；如果暂不处理，保持 `pending`；如果不需要进入确认集，可改为 `ignored`。
8. 下一次 GitHub Actions 会把飞书审核表的 approved 行写回 `translation_review.csv`，翻译脚本读取 approved 样本，优先覆盖同一 `source_text`。
9. 同一次 workflow 会把 `translation_review.csv` 中的 approved 样本同步到飞书“翻译案例库”表，作为人工可读的案例库镜像。
10. 当样本积累到 100-300 条，再导出为微调数据集。

## 飞书 Base 配置

GitHub Actions 读取以下配置：

- Secrets：`FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`FEISHU_BASE_APP_TOKEN`、`FEISHU_BASE_TABLE_ID`、`FEISHU_CASE_TABLE_ID`
- Variable：`FEISHU_BASE_URL`

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

“翻译案例库”表推荐字段：

| 飞书字段 | 含义 |
| --- | --- |
| `英文原文` | 原始英文 |
| `当前中文` | 当时线上中文 |
| `建议中文` | 已确认中文 |
| `审核状态` | 固定为 `approved` |
| `备注` | 审核备注 |
| `样本ID` | 对应 `translation_review.csv` 的 `id` |
| `来源类型` | `news` / `social` / `team_radio` |
| `场景` | 标题、摘要、X post、TR 等 |
| `优先级` | `high` / `medium` / `low` |
| `标签` | 逗号分隔标签 |

同步规则：

- `候选ID` 是唯一键；重复候选不会新增多行。
- 新候选默认写入 `审核状态=pending`。
- 如果某行已经是 `approved`、`rejected`、`ignore` 或 `ignored`，后续同步不会覆盖它的审核状态。
- `approved` 不是模型微调动作，而是把该样本加入确定性确认集。
- `样本ID` 是“翻译案例库”的唯一键；同一 approved 样本会更新既有行，不会重复新增。
- 全自动链路依赖 GitHub Actions 中的飞书应用凭证。没有 `FEISHU_APP_ID` / `FEISHU_APP_SECRET` 时，本地人工授权仍可写表，但 workflow 会跳过飞书读写。

## 微调前置标准

先评估规则和术语表是否已经解决大部分问题。只有满足以下条件时再做微调：

- `translation_review.csv` 有至少 100 条 approved 高质量样本。
- 覆盖新闻标题、X 粉丝短句、TR、赛段结果、传闻标题、处罚/干事公告。
- 单靠术语表仍无法解决语序、语气、标题压缩等问题。

这类工作更准确地说是“领域微调”或“继续训练/指令微调”，不是从零预训练。
