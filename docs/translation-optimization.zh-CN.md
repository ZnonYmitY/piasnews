# Piasnews 中文翻译优化方案

## 当前目标

中文界面的主读者是中文车迷，但 X / IG 粉丝源天然包含口语、梗、缩写、车队无线电和情绪表达。翻译优化的最终目标是让沉浸式翻译映射、术语规则和后续离线模型在这个垂直场景里持续变好；英文原文只作为上线质量保护，不是长期替代方案。

页面展示策略改为：

- 链接标题展示中文翻译或中文概括。
- 链接下方小字展示英文原文，作为翻译兜底。
- 正文数据仍保留原始英文，不丢失溯源。

“英文原文兜底”的含义：当某条机器翻译没有进入确认集、且质量无法保证时，页面仍展示英文原文，避免把明显错误的中文放到线上。人工确认集不是为了让人工长期兜底，而是作为后续术语表、规则和离线模型微调的训练 / 评估数据。

## 翻译链路

当前生产链路：

1. 数据抓取写入英文原文，并为缺少中文映射的新内容保留确定性中文概括或英文兜底。
2. 本机沉浸式翻译采集链路对缺失目标生成 workbench，采集 `原文 -> 中文译文` 映射并写入 `data/immersive_translations.zh.json`。
3. GitHub Actions 调用 `scripts/import_feishu_translation_review.py` 导入 approved 人工案例，再调用 `scripts/apply_immersive_translations.py` 应用人工案例和沉浸式翻译映射，覆盖 `title_zh` / `summary_zh`。
4. `data/translation_glossary.csv` 和脚本规则继续处理稳定术语，保留 `Piastri`、`McLaren`、`FP1`、`P4`、`team radio` 等高识别度词。
5. `data/translation_review.csv` 保存人工确认样本。只有 `status=approved` 的条目会覆盖翻译结果，`pending` 只用于审核、评估和后续训练准备。
6. `scripts/audit_translations.py` 在每次数据更新后完整遍历最终展示中文，自动发现疑似坏例，写入 `data/translation_candidates.csv`，并生成本轮新增 Excel。

`scripts/translate_zh_argos.py` 不再进入默认生产 workflow，仅保留为手动 fallback、历史对照和模型选型评估工具。

结构化数据说明见 [translation-dataset.zh-CN.md](translation-dataset.zh-CN.md)。

## 模型选型评估

最初选择 Argos Translate 的原因是工程约束优先：它开源、离线、可在 GitHub Actions 中直接安装，不调用在线翻译 API，不需要用户或访问者承担 token / API 成本；同时脚本可以在依赖或模型不可用时退回术语表清洗，保证新闻抓取和静态 JSON 发布不中断。现在生产链路已切到沉浸式翻译映射优先，Argos 只作为手动 fallback 和对照基线。

2026-06-30 用 `facebook/nllb-200-distilled-600M` 对 10 条 Piasnews 样本做过一次本地对比，样本覆盖 X 粉丝梗、车队无线电、采访问答、传闻标题和新闻标题。结论：

- NLLB 冷启动成本更高：首次下载和加载明显慢于 Argos，直接放进 3 小时 / 6 小时更新链路会增加 GitHub Actions 耗时和缓存压力。
- NLLB 在通用句子上更自然的概率更高，但在 Piasnews 当前高频文本里没有稳定胜出；短 X 梗、缩写、对话体和 F1 转会语境仍会漏译、截断或误译。
- Argos 和 NLLB 都不能单独解决 `move` 译为“转会”、`stewards` 译为“干事”、TR 口语、粉丝梗意译等领域问题。
- 当前生产策略把质量提升重点放在沉浸式翻译映射、术语表、人工确认集、规则和 badcase loop；Argos / NLLB 暂不切为默认，只保留为手动 fallback、后续微调或二阶段评估候选。

## 待确认优化样例

这些是当前线上翻译中最影响阅读的高曝光候选。确认后可以进入训练集。

| 原文 | 当前问题 | 建议中文 |
| --- | --- | --- |
| Oscar Piastri bemoans ‘magicless’ reality of ‘very tough’ McLaren situation | 专名混杂、句式生硬 | Oscar Piastri 谈到 McLaren 的艰难处境：缺少“魔法” |
| George Russell takes pole at Austrian GP despite yellow flag controversy as Oscar Piastri banks seventh | `pole` 和 `banks seventh` 误译 | Russell 在黄旗争议中拿下奥地利站杆位，Piastri 排位第七 |
| Piastri left frustrated by Austria qualifying drop | `qualifying drop` 生硬 | Piastri 对奥地利排位下滑感到沮丧 |
| McLaren Austrian GP qualifying leaves Norris and Piastri chasing | 语义反了 | 奥地利排位后，Norris 与 Piastri 仍需追赶 |
| Russell on pole in Austria as Piastri banks seventh | `banks` 误译 | Russell 奥地利站杆位，Piastri 收获第七 |
| McLaren’s Piastri spotlights key progress with MCL40 after Austrian GP Friday | 句子截断 | Piastri 认为 MCL40 在奥地利周五练习后取得关键进展 |
| Oscar Piastri Warns McLaren Still Trail Kimi Antonelli In Austria | 音译错误、语序差 | Piastri 警告 McLaren 在奥地利仍落后 Antonelli 一步 |
| Why Piastri is in striking distance... and only one McLaren will have key fix | `striking distance` 误解 | 为什么 Piastri 仍有机会，而 McLaren 只有一台车能用上关键修复 |
| Piastri emerges as Mercedes’ closest challenger | `closest challenger` 应自然表达 | Piastri 成为 Mercedes 最接近的挑战者 |
| 'Suprise' Piastri pace shocks rivals in scorching Austrian heat | `scorching heat` 直译差 | 奥地利高温中，Piastri 的速度让对手意外 |
| FP2: Antonelli sets the pace from Piastri and Norris during second practice in Austria | `sets the pace from` 误译 | 奥地利二练：Antonelli 领跑，Piastri 与 Norris 紧随其后 |
| Antonelli pips Piastri to top Austria FP2 | `pips` 误译 | Antonelli 微弱优势力压 Piastri，领跑奥地利二练 |
| Piastri explains McLaren appeal in Gasly penalty case | 可更精确 | Piastri 解释 McLaren 为何就 Gasly 处罚案提出上诉 |
| Oscar Piastri wary of 'tricky precedent' in 'risk' to F1 results | `tricky precedent` 误译 | Piastri 警惕处罚争议可能给 F1 赛果开下棘手先例 |
| McLaren need 'new bits' to catch F1 leaders Mercedes, says Piastri | `new bits` 应保留赛车语境 | Piastri 表示 McLaren 需要新部件才能追上领先的 Mercedes |
| Enjoyed that one | 粉丝源短句应意译 | 这场跑得很享受 |
| From P7 to P4 | 应突出比赛结果 | 从 P7 追到 P4 |
| NO FURTHER ACTION !!! p4 is secured | 应解释赛会语境 | 不再处罚，P4 保住了 |
| HAPPY OSCAR ON THE RADIO | 应转为车队无线电语境 | 车队无线电里的开心 Oscar |
| Well done mate, that's a really phenomenal drive | TR 应口语但清楚 | 干得漂亮，这是一场非常出色的驾驶 |
| Oscar's overtake at the start | 应简洁 | Oscar 起步阶段的超车 |
| Oscar's overtake on Charles | 应补足对象 | Oscar 对 Charles 的超车 |
| p4 today also means oscar is now p4 in the driver standings with 80 points | 应压缩信息 | P4 完赛后，Oscar 以 80 分升至车手积分榜第 4 |
| he looks so young this weekend... what a CUTIE | 粉丝语气可保留 | 他这个周末看起来好年轻，太可爱了 |

## 微调路线

先不要直接训练。推荐顺序：

1. 建立人工确认集：保存 `source_text`、`current_zh`、`suggested_zh`、`source_type`、`domain`、`notes`。
2. 自动审查每次更新后的新内容，新增候选默认进入 `pending`，不能直接 approved。
3. 累积 100-300 条高质量坏例：优先覆盖新闻标题、X 短句、TR、排位/正赛、传闻、车队技术词。
4. 先做术语表和规则评估：如果规则能解决 70% 以上坏例，暂不微调。
5. 再做离线模型微调：优先考虑 OPUS-MT / MarianMT en-zh 或小型 NLLB，做领域微调，而不是从零训练。
6. 输出模型包：权重放 Hugging Face model repo 或 GitHub Release；仓库只保存模型版本、checksum 和调用脚本。
7. CI 调用：GitHub Actions 下载固定版本模型，生成 `title_zh` / `summary_zh` 后发布静态 JSON。

## 训练样本格式

```json
{
  "source_text": "Antonelli pips Piastri to top Austria FP2",
  "current_zh": "Antonelli pips Piastri)为奥地利顶级二练",
  "approved_zh": "Antonelli 微弱优势力压 Piastri，领跑奥地利二练",
  "domain": "f1_news_title",
  "tags": ["FP2", "race_week", "result"],
  "notes": "pips means narrowly beats; keep Piastri in English"
}
```

## 评估标准

- 专名稳定：Piastri、McLaren、Norris、Antonelli、Verstappen 不乱译；名字或姓氏单独出现均可，不强制统一。
- 赛段准确：FP1/FP2/FP3、qualifying、race、stewards、parc ferme 不误译。
- 粉丝语气可读：保留情绪，但不把梗翻成机器直译。
- 链接标题短：优先 16-32 个中文字，不写成长摘要。
- 英文兜底：粉丝源始终在中文标题下展示英文原文。
