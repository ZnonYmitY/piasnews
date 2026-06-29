# Piasnews 翻译确认集与术语库

## 结论

建立人工确认集是当前最稳的路线。人名、队名、常见缩写优先保留英文，其余 F1 术语、新闻标题短语和粉丝源口语进入结构化表。

仓库使用 CSV 作为源数据：

- `data/translation_review.csv`：人工确认样本，适合收集坏例、建议译文、审核状态。
- `data/translation_glossary.csv`：F1 术语和短语库，适合稳定修正高频误译。

CSV 可以直接用 Excel / WPS / Numbers 打开。暂不把 `.xlsx` 作为主文件，因为二进制文件不利于 Git diff、代码审查和合并冲突处理；需要给非技术审核者使用时，可以从 CSV 另存为 `.xlsx`。

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

## 人名规则

默认保留英文：

- 车手、领队、经理、工程师等人名保留英文。
- 姓氏单独出现也保留英文。
- 不使用半中半英形式，例如避免 `奥斯卡·Piastri`。
- 粉丝源中 `Oscar` 可以保留英文，因为语气更自然。

## 审核流程

1. 新抓取数据进入 `data/items.json` / `data/social.json`。
2. 把高曝光坏例加入 `translation_review.csv`，状态设为 `pending`。
3. 你确认后，把 `status` 改成 `approved`。
4. GitHub Actions 翻译脚本读取 approved 样本，优先覆盖同一 `source_text`。
5. 当样本积累到 100-300 条，再导出为微调数据集。

## 微调前置标准

先评估规则和术语表是否已经解决大部分问题。只有满足以下条件时再做微调：

- `translation_review.csv` 有至少 100 条 approved 高质量样本。
- 覆盖新闻标题、X 粉丝短句、TR、赛段结果、传闻标题、处罚/干事公告。
- 单靠术语表仍无法解决语序、语气、标题压缩等问题。

这类工作更准确地说是“领域微调”或“继续训练/指令微调”，不是从零预训练。
