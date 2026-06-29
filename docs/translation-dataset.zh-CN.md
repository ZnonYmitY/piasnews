# Piasnews 翻译确认集与术语库

## 结论

建立人工确认集是当前最稳的路线。人名、队名、常见缩写优先保留英文，其余 F1 术语、新闻标题短语和粉丝源口语进入结构化表。

仓库使用 CSV 作为源数据：

- `data/translation_review.csv`：人工确认样本，适合收集坏例、建议译文、审核状态。
- `data/translation_candidates.csv`：自动审查发现的待确认坏例，所有新增行默认 `pending`。
- `data/translation_glossary.csv`：F1 术语和短语库，适合稳定修正高频误译。

CSV 可以直接用 Excel / WPS / Numbers 打开。暂不把 `.xlsx` 作为主文件，因为二进制文件不利于 Git diff、代码审查和合并冲突处理。每次 GitHub Actions 更新数据后，`scripts/audit_translations.py` 会额外生成本轮新增候选的 Excel 文件 `translation_candidates_latest.xlsx`，并作为 workflow artifact 上传。

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

只有 `status=approved` 的样本才会被翻译脚本采用。`pending` 用来给你审核，不会自动上线。

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

术语库可以先作为规则后处理使用；如果之后做离线模型微调，也可以把它转成术语约束和评估用例。

稳定实体映射也放在这个文件中。新增人名、车队名、赛道名时，优先补这里，而不是新增整句 badcase。

## 人名规则

默认保留英文：

- 车手、领队、经理、工程师等人名保留英文。
- 姓氏或名字单独出现都可以保留英文；不强制统一为姓氏，只要读者能理解指向即可。
- 不使用半中半英形式，例如避免 `奥斯卡·Piastri`。
- 粉丝源中 `Oscar` 可以保留英文，因为语气更自然。

## 审核流程

1. 新抓取数据进入 `data/items.json` / `data/social.json`。
2. GitHub Actions 调用 `scripts/translate_zh_argos.py` 生成中文字段。
3. GitHub Actions 调用 `scripts/audit_translations.py` 完整遍历新闻和社交翻译，执行对抗式审查。
4. 新发现的坏例进入 `data/translation_candidates.csv`，本轮新增候选同时导出为 `translation_candidates_latest.csv` 和 `translation_candidates_latest.xlsx`。
5. 你确认后，把高质量样本转入 `translation_review.csv` 并设为 `approved`。
6. 下一次 GitHub Actions 翻译脚本读取 approved 样本，优先覆盖同一 `source_text`。
7. 当样本积累到 100-300 条，再导出为微调数据集。

## 微调前置标准

先评估规则和术语表是否已经解决大部分问题。只有满足以下条件时再做微调：

- `translation_review.csv` 有至少 100 条 approved 高质量样本。
- 覆盖新闻标题、X 粉丝短句、TR、赛段结果、传闻标题、处罚/干事公告。
- 单靠术语表仍无法解决语序、语气、标题压缩等问题。

这类工作更准确地说是“领域微调”或“继续训练/指令微调”，不是从零预训练。
