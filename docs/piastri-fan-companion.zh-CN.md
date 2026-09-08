# Piastri Fan Companion 产品边界

`Piastri Fan Companion` 是 Piasnews 内的非官方粉丝体验。这个仓库负责产品，不再保存人物蒸馏 Skill 的源材料。

## 本仓库负责

- `public/companion/` 的页面、交互与非官方声明；
- Worker 的 `/companion/status`、`/companion/chat`、模型供应商与限流；
- Piasnews 的最新新闻、赛果、赛程和其他实时事实；
- 产品日志、分析、部署与故障兜底；
- 对独立蒸馏包某个固定版本的适配和验证。

## 独立蒸馏仓库负责

[piastri-persona-distillation](https://github.com/ZnonYmitY/piastri-persona-distillation) 负责公开证据、人物知识、谣言台账、候选判断规则、风格卡、边界、Correction Log、评测和运行时导出。它不负责本产品的 UI、API、模型托管或部署。

## 依赖方式

本仓库不会在请求时读取蒸馏仓库，也不会在 `npm test` 时临时构建 Skill。`worker/src/persona-runtime.generated.js` 是从独立仓库固定 tag 导出的只读快照；`worker/companion-runtime.lock.json` 记录来源、版本、源哈希和产物校验和；`worker/src/companion-runtime.js` 只做产品侧适配。

更新蒸馏包时，应在独立仓库完成审核、验证和构建，再把新的产物与 lock 信息作为一次明确的依赖升级提交到 Piasnews。这样产品发布与蒸馏实验不会互相误改。

## The Garage 体验

页面以粉丝对话为主：奶油白外场、石墨黑对话舱，以及 CSS 构建的立体 81、环轨、视差和扫光。小屏收起大场景，输入区固定在对话舱底部，只有消息区独立滚动。系统的减少动态效果偏好优先于装饰动效。

DeepSeek 负责实时生成，固定版本的蒸馏包提供事实、候选判断与表达边界。问候属于正常闲聊；题外和敏感边界仍使用明确标识的安全答复。欢迎文案不冒充模型回复，模型故障不冒充正常生成。依据抽屉展示回答关联的公开资料，不显示未经测量的性格分数，也不把关联来源说成逐句事实核验。

API key 只配置在 Worker secret 中，不进入公开页面或本仓库。`/companion/status` 仅说明配置状态，真实连通性以聊天请求成功为准。
