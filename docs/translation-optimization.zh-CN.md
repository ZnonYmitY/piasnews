# Piasnews 中文翻译优化方案

## 当前目标

中文界面的主读者是中文车迷，但 X / IG 粉丝源天然包含口语、梗、缩写、车队无线电和情绪表达。页面展示策略改为：

- 链接标题展示中文翻译或中文概括。
- 链接下方小字展示英文原文，作为翻译兜底。
- 正文数据仍保留原始英文，不丢失溯源。

## 翻译链路

当前采用三层策略：

1. Argos Translate 离线 en-to-zh 生成初版中文。
2. F1 / Piastri 术语表做后处理，保留 `Piastri`、`McLaren`、`FP1`、`P4`、`team radio` 等高识别度词。
3. 对高频坏例和首页高曝光标题加人工规则，避免 `奥斯卡·Piastri(Oscar Piastri)`、`银行第七`、`拿起杆子` 这类直译。

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
| Oscar's overtake on Charles | 应补足对象 | Oscar 对 Leclerc 的超车 |
| p4 today also means oscar is now p4 in the driver standings with 80 points | 应压缩信息 | P4 完赛后，Oscar 以 80 分升至车手积分榜第 4 |
| he looks so young this weekend... what a CUTIE | 粉丝语气可保留 | 他这个周末看起来好年轻，太可爱了 |

## 微调路线

先不要直接训练。推荐顺序：

1. 建立人工确认集：保存 `source_text`、`current_zh`、`approved_zh`、`source_type`、`category`、`notes`。
2. 累积 100-300 条高质量坏例：优先覆盖新闻标题、X 短句、TR、排位/正赛、传闻、车队技术词。
3. 先做术语表和规则评估：如果规则能解决 70% 以上坏例，暂不微调。
4. 再做离线模型微调：优先考虑 OPUS-MT / MarianMT en-zh 或小型 NLLB，做领域微调，而不是从零训练。
5. 输出模型包：权重放 Hugging Face model repo 或 GitHub Release；仓库只保存模型版本、checksum 和调用脚本。
6. CI 调用：GitHub Actions 下载固定版本模型，生成 `title_zh` / `summary_zh` 后发布静态 JSON。

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

- 专名稳定：Piastri、McLaren、Norris、Antonelli、Verstappen 不乱译。
- 赛段准确：FP1/FP2/FP3、qualifying、race、stewards、parc ferme 不误译。
- 粉丝语气可读：保留情绪，但不把梗翻成机器直译。
- 链接标题短：优先 16-32 个中文字，不写成长摘要。
- 英文兜底：粉丝源始终在中文标题下展示英文原文。
