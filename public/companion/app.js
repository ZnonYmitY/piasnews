const DEFAULT_WORKER_URL = "https://piasnews-review.znonymity-piasnews.workers.dev";
const MAX_HISTORY_ITEMS = 8;
const MAX_HISTORY_CHARS = 900;
const MAX_PROMPT_CHARS = 500;
const APP_VERSION = "20260910-service-errors-1";
const MODE_LABELS = { free: "自由演绎", grounded: "强依据" };
const ANSWER_KIND_LABELS = { fictional: "角色演绎 · 非本人事实", evidence: "有来源的事实", social: "轻松聊天", boundary: "边界答复", insufficient: "依据不足" };
const FEEDBACK_CATEGORIES = [
  ["off_persona", "不像 Oscar"], ["unnatural", "太机械 / 不自然"],
  ["fact_error", "事实不对"], ["irrelevant", "答非所问"],
  ["over_refusal", "不该拒绝却拒绝"], ["context_loss", "没接住上下文"],
  ["boundary_miss", "该收住却越界"], ["invented_private", "把演绎当真实私事"],
  ["rumor_handling", "辟谣不清 / 没依据"], ["translation", "中英不一致"],
  ["too_long", "太啰嗦 / 重复"], ["technical", "生成 / 显示异常"], ["other", "其他"],
];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const ROUTE_LABELS = {
  f1_grounded: "F1 / race analysis",
  fan_light: "F1 / fan conversation",
  public_fact: "Verified public biography",
  rumor_check: "Public claim verification",
  public_adjacent: "Verified public adjacent topic",
  unrelated_general: "Outside Piastri / F1 scope",
  private_or_inner_state_unverified: "Private or unverified personal claim",
  team_secret_or_live_engineering: "Non-public team information",
  medical_legal_financial: "Professional-advice boundary",
  gambling: "Gambling boundary",
  illegal_hate_harm: "Safety boundary",
  identity_or_impersonation: "Identity boundary",
  insufficient_current_fact: "Current evidence unavailable",
  unverified_rumor_source: "Source authenticity unavailable",
};

const DEFAULT_TRACE = {
  route: "fan_light",
  domain: "F1 / fan context",
  fact: "欢迎文案没有提出赛事事实。",
  style: "静态开场 · 非模型生成",
  styleNote: "这是粉丝体验的固定欢迎文案。发送消息后，可在每条回答下查看它自己的依据。",
  sources: [],
};

const els = {
  messages: document.querySelector("#messages"),
  form: document.querySelector("#composerForm"),
  input: document.querySelector("#messageInput"),
  typing: document.querySelector("#typingIndicator"),
  promptList: document.querySelector("#promptList"),
  reset: document.querySelector("#resetButton"),
  panel: document.querySelector("#insightPanel"),
  panelButton: document.querySelector("#panelButton"),
  closePanel: document.querySelector("#closePanelButton"),
  modeButtons: [...document.querySelectorAll("[data-companion-mode]")],
  modeDescription: document.querySelector("#modeDescription"),
  modeStatus: document.querySelector("#modeStatus"),
  drawerModeSummary: document.querySelector("#drawerModeSummary"),
  evidenceToggle: document.querySelector("#evidenceToggle"),
  evidenceList: document.querySelector("#evidenceList"),
  routeBadge: document.querySelector("#routeBadge"),
  domainTrace: document.querySelector("#domainTrace"),
  factTrace: document.querySelector("#factTrace"),
  styleTrace: document.querySelector("#styleTrace"),
  styleNote: document.querySelector("#styleNote"),
  clearContext: document.querySelector("#clearContextButton"),
  composerContext: document.querySelector("#composerContext"),
  raceName: document.querySelector("#raceName"),
  raceCode: document.querySelector("#raceCode"),
  raceRound: document.querySelector("#raceRound"),
  sessionLabel: document.querySelector("#sessionLabel"),
  sessionTime: document.querySelector("#sessionTime"),
  modelDisclosure: document.querySelector("#modelDisclosure"),
  modelStatusTitle: document.querySelector("#modelStatusTitle"),
  modelStatusDetail: document.querySelector("#modelStatusDetail"),
  runtimeNote: document.querySelector("#runtimeNote"),
  send: document.querySelector("#sendButton"),
  count: document.querySelector("#characterCount"),
  jumpLatest: document.querySelector("#jumpLatest"),
  backdrop: document.querySelector("#drawerBackdrop"),
  page: document.querySelector("#pageShell"),
  hero: document.querySelector("#hero"),
  feedbackPanel: document.querySelector("#feedbackPanel"),
  feedbackForm: document.querySelector("#feedbackForm"),
  feedbackFields: document.querySelector("#feedbackFields"),
  closeFeedback: document.querySelector("#closeFeedbackButton"),
  feedbackIssues: document.querySelector("#feedbackIssues"),
  feedbackCommon: document.querySelector("#feedbackCommonCategories"),
  feedbackMore: document.querySelector("#feedbackMoreCategories"),
  feedbackCategoryCount: document.querySelector("#feedbackCategoryCount"),
  feedbackComment: document.querySelector("#feedbackComment"),
  feedbackExpected: document.querySelector("#feedbackExpected"),
  feedbackConsent: document.querySelector("#feedbackConsent"),
  feedbackContextConsent: document.querySelector("#feedbackContextConsent"),
  feedbackContextPreview: document.querySelector("#feedbackContextPreview"),
  feedbackPromptPreview: document.querySelector("#feedbackPromptPreview"),
  feedbackAnswerPreview: document.querySelector("#feedbackAnswerPreview"),
  feedbackMetadataPreview: document.querySelector("#feedbackMetadataPreview"),
  feedbackStatus: document.querySelector("#feedbackStatus"),
  feedbackSubmit: document.querySelector("#feedbackSubmit"),
  feedbackSubmitNote: document.querySelector("#feedbackSubmitNote"),
};

let currentTrace = DEFAULT_TRACE;
let contextEnabled = false;
let contextDismissed = false;
let messageCounter = 0;
let companionApiUrl = DEFAULT_WORKER_URL;
let companionStatus = null;
let selectedMode = "free";
let generatingMode = null;
let conversationHistories = { free: [], grounded: [] };
let requestEpoch = 0;
let activeRequest = null;
let retryableFailure = null;
let isGenerating = false;
let followLatest = true;
let drawerTrigger = null;
let drawerCloseTimer = null;
let activeDialog = null;
let activeFeedback = null;
const welcomeMessage = els.messages.querySelector(".welcome-message");

function containsChinese(value) {
  return /[\u3400-\u9fff]/.test(value);
}


function createFeedbackSnapshot({ prompt = "", text = "", translation = "", history = [], engine = "welcome", mode = "free", answerKind = "social", trace = DEFAULT_TRACE, metadata = {}, latencyMs = null } = {}) {
  const sourceIds = (trace.sources || []).map((source) => source.id);
  const ids = (key, pattern, max) => [...new Set(metadata[key] || sourceIds.filter((id) => pattern.test(id)))].slice(0, max);
  return Object.freeze({
    prompt: prompt.slice(0, MAX_PROMPT_CHARS),
    answer_en: text.slice(0, MAX_HISTORY_CHARS),
    answer_zh: translation.slice(0, MAX_HISTORY_CHARS),
    history: Object.freeze(history.slice(-4).map((item) => Object.freeze({ role: item.role, content: item.content.slice(0, MAX_HISTORY_CHARS) }))),
    engine,
    mode,
    answer_kind: answerKind,
    model: String(metadata.model || "").slice(0, 80),
    route: String(trace.route || "").slice(0, 80),
    style_card_id: String(metadata.style_card_id || "").slice(0, 40),
    package_version: String(metadata.package_version || "").slice(0, 40),
    source_hash: String(metadata.source_hash || "").slice(0, 80),
    facts_only: mode === "grounded",
    app_version: APP_VERSION,
    knowledge_fact_ids: Object.freeze(ids("knowledge_fact_ids", /^KF-/, 4)),
    rumor_item_ids: Object.freeze(ids("rumor_item_ids", /^RM-/, 1)),
    judgment_rule_ids: Object.freeze((metadata.judgment_rule_ids || []).slice(0, 1)),
    evidence_ids: Object.freeze(ids("evidence_ids", /^EV-/, 8)),
    public_source_ids: Object.freeze(ids("public_source_ids", /^LIVE-/, 4)),
    latency_ms: Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs)) : null,
  });
}

function attachFeedback(article, snapshot) {
  if (!article.querySelector(".message-mode")) {
    const label = document.createElement("p");
    label.className = "message-mode";
    label.dataset.kind = snapshot.answer_kind;
    label.textContent = `${MODE_LABELS[snapshot.mode]} · ${snapshot.engine === "welcome" ? "开场文案" : ANSWER_KIND_LABELS[snapshot.answer_kind]}`;
    article.querySelector(".message-copy").prepend(label);
  }
  const actions = article.querySelector(".answer-actions") || document.createElement("div");
  actions.className = "answer-actions";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "answer-feedback";
  button.textContent = "反馈";
  button.setAttribute("aria-label", "反馈这条回复");
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-controls", "feedbackPanel");
  const record = {
    messageId: crypto.randomUUID(), feedbackId: crypto.randomUUID(), snapshot, button,
    draft: { rating: "negative", categories: [], comment: "", expected: "", consent: false, includeContext: false },
    payload: null, state: "draft", status: "", receipt: null,
  };
  article.dataset.messageId = record.messageId;
  button.addEventListener("click", () => openFeedback(record, button));
  actions.append(button);
  article.querySelector(".message-copy").append(actions);
}

function addMessage(role, text, translation = "", trace = null, engine = "", feedbackSnapshot = null) {
  const article = document.createElement("article");
  article.className = `message ${role === "user" ? "user-message" : "assistant-message"}`;

  const meta = document.createElement("div");
  meta.className = "message-meta";
  const speaker = document.createElement("span");
  speaker.textContent = role === "user" ? "YOU" : "81 / COMPANION";
  meta.append(speaker);
  if (engine) {
    const engineLabel = document.createElement("span");
    engineLabel.className = "message-engine";
    engineLabel.textContent = engine === "deepseek" ? "DEEPSEEK · 模型生成" : "静态开场 · 非模型生成";
    meta.append(engineLabel);
  }

  const copy = document.createElement("div");
  copy.className = "message-copy";
  const main = document.createElement("p");
  main.className = "english";
  main.textContent = text;
  copy.append(main);

  if (translation) {
    const translated = document.createElement("p");
    translated.className = "translation";
    const label = document.createElement("span");
    label.textContent = "中文";
    translated.append(label, document.createTextNode(` ${translation}`));
    copy.append(translated);
  }

  if (role === "assistant") {
    const actions = document.createElement("div");
    actions.className = "answer-actions";
    const why = document.createElement("button");
    why.type = "button";
    why.textContent = "这条回答的依据";
    why.addEventListener("click", () => {
      renderTrace(trace || DEFAULT_TRACE);
      setPanel(true, why);
    });
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "复制";
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText([text, translation && `中文：${translation}`].filter(Boolean).join("\n\n"));
        copyButton.textContent = "已复制";
        setTimeout(() => { copyButton.textContent = "复制"; }, 1200);
      } catch (_) {
        copyButton.textContent = "请选中文字复制";
      }
    });
    actions.append(why, copyButton);
    copy.append(actions);
  }

  article.append(meta, copy);
  if (role === "assistant") attachFeedback(article, feedbackSnapshot || createFeedbackSnapshot({ text, translation, engine: engine || "deepseek", trace: trace || DEFAULT_TRACE }));
  els.messages.append(article);
  if (role === "user") scrollToLatest(false);
  else if (followLatest) scrollToLatest();
  else els.jumpLatest.hidden = false;
  messageCounter += 1;
}

function renderTrace(trace) {
  currentTrace = trace;
  els.routeBadge.textContent = trace.route.toUpperCase();
  els.domainTrace.textContent = trace.domain;
  els.factTrace.textContent = trace.fact;
  els.styleTrace.textContent = trace.style;
  els.styleNote.textContent = trace.styleNote;

  els.evidenceList.replaceChildren();
  if (!trace.sources.length) {
    const empty = document.createElement("p");
    empty.className = "rail-note";
    empty.textContent = "这条回答没有关联公开来源；不应据此推断额外事实。";
    els.evidenceList.append(empty);
    return;
  }

  trace.sources.forEach((source) => {
    const link = document.createElement("a");
    try {
      const sourceUrl = new URL(source.url);
      if (sourceUrl.protocol !== "https:") return;
      link.href = sourceUrl.href;
    } catch (_) { return; }
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const mark = document.createElement("span");
    mark.className = "source-mark";
    mark.textContent = source.mark;
    const detail = document.createElement("span");
    const id = document.createElement("strong");
    id.textContent = source.id;
    const label = document.createElement("small");
    label.textContent = source.label;
    detail.append(id, label);
    const arrow = document.createElement("i");
    arrow.textContent = "↗";
    link.append(mark, detail, arrow);
    els.evidenceList.append(link);
  });
}

function setPanel(open, trigger = els.panelButton) {
  if (open) showDialog(els.panel, els.closePanel, trigger);
  else if (activeDialog === els.panel) closeDialog();
}

function showDialog(panel, firstFocus, trigger) {
  clearTimeout(drawerCloseTimer);
  if (activeFeedback && activeDialog === els.feedbackPanel) saveFeedbackDraft();
  for (const other of [els.panel, els.feedbackPanel]) {
    if (other !== panel) { other.classList.remove("is-open"); other.hidden = true; other.inert = true; }
  }
  activeDialog = panel;
  drawerTrigger = trigger;
  els.panelButton.setAttribute("aria-expanded", String(panel === els.panel));
  panel.hidden = false;
  panel.inert = false;
  els.backdrop.hidden = false;
  els.page.inert = true;
  requestAnimationFrame(() => {
    if (activeDialog !== panel) return;
    panel.classList.add("is-open");
    els.backdrop.classList.add("is-open");
    firstFocus.focus({ preventScroll: true });
  });
}

function closeDialog() {
  const panel = activeDialog;
  if (!panel) return;
  if (panel === els.feedbackPanel) saveFeedbackDraft();
  clearTimeout(drawerCloseTimer);
  activeDialog = null;
  panel.classList.remove("is-open");
  els.backdrop.classList.remove("is-open");
  els.panelButton.setAttribute("aria-expanded", "false");
  els.page.inert = false;
  panel.inert = true;
  if (drawerTrigger?.isConnected) drawerTrigger.focus({ preventScroll: true });
  else els.input.focus({ preventScroll: true });
  drawerCloseTimer = setTimeout(() => {
    panel.hidden = true;
    els.backdrop.hidden = true;
  }, reducedMotion.matches ? 0 : 400);
}

function saveFeedbackDraft() {
  if (!activeFeedback || activeFeedback.payload) return;
  activeFeedback.draft = {
    rating: els.feedbackForm.querySelector('input[name="feedbackRating"]:checked')?.value || "negative",
    categories: [...els.feedbackIssues.querySelectorAll("input:checked")].map((input) => input.value),
    comment: els.feedbackComment.value,
    expected: els.feedbackExpected.value,
    consent: els.feedbackConsent.checked,
    includeContext: els.feedbackContextConsent.checked,
  };
}

function updateFeedbackSelection() {
  const positive = els.feedbackForm.querySelector('input[name="feedbackRating"]:checked')?.value === "positive";
  els.feedbackIssues.hidden = positive;
  const chosen = [...els.feedbackIssues.querySelectorAll("input:checked")];
  els.feedbackCategoryCount.textContent = `已选 ${chosen.length} / 4`;
  els.feedbackIssues.querySelectorAll("input").forEach((input) => { input.disabled = !input.checked && chosen.length >= 4; });
  const includeContext = els.feedbackContextConsent.checked;
  els.feedbackContextPreview.hidden = !includeContext;
  const draftReady = els.feedbackConsent.checked && (positive || chosen.length > 0);
  const pending = activeFeedback?.state === "pending";
  const submitted = activeFeedback?.state === "submitted";
  els.feedbackFields.disabled = Boolean(activeFeedback?.payload);
  els.feedbackSubmit.disabled = pending || submitted || (!activeFeedback?.payload && !draftReady);
  els.feedbackSubmit.textContent = pending ? "正在提交…" : submitted ? "反馈已收到 ✓" : activeFeedback?.payload ? "重试提交 ↗" : "提交反馈 ↗";
  els.feedbackSubmitNote.textContent = submitted ? "感谢你帮我们磨好这一句。" : activeFeedback?.payload ? "重试只发送同一份内容，不重复收集。" : !els.feedbackConsent.checked ? "需要你的明确同意。" : !draftReady ? "请至少选择一种问题。" : "只提交你看到的这些内容。";
  els.feedbackForm.setAttribute("aria-busy", String(pending));
}

function feedbackStatus(record, text, kind = "") {
  record.status = text;
  record.statusKind = kind;
  if (activeFeedback !== record) return;
  els.feedbackStatus.textContent = text;
  els.feedbackStatus.dataset.kind = kind;
  updateFeedbackSelection();
}

function openFeedback(record, trigger) {
  if (activeDialog === els.feedbackPanel) saveFeedbackDraft();
  activeFeedback = record;
  const draft = record.draft;
  els.feedbackForm.querySelectorAll('input[name="feedbackRating"]').forEach((input) => { input.checked = input.value === draft.rating; });
  els.feedbackIssues.querySelectorAll("input").forEach((input) => { input.checked = draft.categories.includes(input.value); });
  els.feedbackComment.value = draft.comment;
  els.feedbackExpected.value = draft.expected;
  els.feedbackConsent.checked = draft.consent;
  els.feedbackContextConsent.checked = draft.includeContext;
  els.feedbackContextConsent.disabled = !record.snapshot.history.length;
  els.feedbackPromptPreview.textContent = record.snapshot.prompt || "（固定欢迎语，没有用户提问）";
  els.feedbackAnswerPreview.textContent = [record.snapshot.answer_en, record.snapshot.answer_zh].filter(Boolean).join("\n\n");
  const snapshot = record.snapshot;
  els.feedbackMetadataPreview.textContent = [
    `生成方式：${snapshot.engine} · 路由：${snapshot.route}`,
    `模式：${MODE_LABELS[snapshot.mode]} · 回答性质：${ANSWER_KIND_LABELS[snapshot.answer_kind]}`,
    `模型：${snapshot.model || "无（固定文案）"} · Skill：${snapshot.package_version || "无模型版本"}`,
    `风格卡：${snapshot.style_card_id || "无"} · 强依据：${snapshot.facts_only ? "是" : "否"}`,
    `事实 / 谣言 / 规则 / 证据 / 本次公开来源：${[...snapshot.knowledge_fact_ids, ...snapshot.rumor_item_ids, ...snapshot.judgment_rule_ids, ...snapshot.evidence_ids, ...snapshot.public_source_ids].join(", ") || "无"}`,
    `版本：${snapshot.app_version} · 耗时：${snapshot.latency_ms === null ? "无" : `${snapshot.latency_ms} ms`}`,
    `来源版本校验：${snapshot.source_hash || "无"}`,
    "仅提交上方文字；单条回复与上下文分别最多 900 字。",
  ].join("\n");
  els.feedbackContextPreview.replaceChildren();
  record.snapshot.history.forEach((item) => {
    const label = document.createElement("strong");
    label.textContent = item.role === "user" ? "你" : "Companion";
    const copy = document.createElement("p");
    copy.textContent = item.content;
    els.feedbackContextPreview.append(label, copy);
  });
  els.feedbackPanel.querySelectorAll("details").forEach((detail) => { detail.open = false; });
  els.feedbackPanel.scrollTop = 0;
  feedbackStatus(record, record.status, record.statusKind);
  showDialog(els.feedbackPanel, els.closeFeedback, trigger);
}

async function submitFeedback(event) {
  event.preventDefault();
  const record = activeFeedback;
  if (!record || activeDialog !== els.feedbackPanel || record.state === "pending" || record.state === "submitted") return;
  saveFeedbackDraft();
  if (!record.payload) {
    const draft = record.draft;
    if (!draft.consent || (draft.rating === "negative" && !draft.categories.length)) return;
    record.payload = JSON.stringify({
      feedback_id: record.feedbackId,
      message_id: record.messageId,
      rating: draft.rating,
      categories: draft.rating === "negative" ? draft.categories.slice(0, 4) : [],
      comment: draft.comment.trim().slice(0, 1000),
      expected_reply: draft.expected.trim().slice(0, 1000),
      consent: true,
      include_context: draft.includeContext,
      snapshot: { ...record.snapshot, history: draft.includeContext ? record.snapshot.history : [] },
    });
  }
  record.state = "pending";
  feedbackStatus(record, "正在安全提交，请稍等。尚未确认保存。");
  try {
    const response = await fetch(`${companionApiUrl}/companion/feedback`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: record.payload, signal: AbortSignal.timeout(15000),
    });
    const receipt = await response.json().catch(() => null);
    if (!response.ok || receipt?.accepted !== true || receipt.feedback_id !== record.feedbackId) {
      const messages = {
        400: "反馈格式未通过校验，请保留本页并告知产品团队。",
        409: "反馈编号发生冲突，尚未确认保存，请告知产品团队。",
        429: "提交较频繁，请稍后重试。",
        503: "反馈服务暂不可用，请稍后重试。",
      };
      throw new Error(messages[response.status] || "服务尚未确认保存，请稍后重试。");
    }
    record.state = "submitted";
    record.receipt = receipt;
    record.button.textContent = "已反馈 ✓";
    record.button.setAttribute("aria-label", "查看这条回复的反馈回执");
    feedbackStatus(record, `反馈已收到。回执：${receipt.feedback_id}。反馈保留 90 天，到期后每日清理。`, "success");
  } catch (error) {
    record.state = "error";
    const message = error?.name === "TimeoutError" || error?.name === "AbortError" || error instanceof TypeError
      ? "网络未确认保存结果。可重试同一份反馈，不会重复记录。"
      : error.message;
    feedbackStatus(record, message, "error");
  }
}

function scrollToLatest(smooth = true) {
  followLatest = true;
  els.jumpLatest.hidden = true;
  requestAnimationFrame(() => els.messages.scrollTo({ top: els.messages.scrollHeight, behavior: smooth && !reducedMotion.matches ? "smooth" : "instant" }));
}

function setGenerating(value) {
  isGenerating = value;
  els.typing.hidden = !value;
  document.body.classList.toggle("is-generating", value);
  els.form.setAttribute("aria-busy", String(value));
  els.promptList.querySelectorAll("button").forEach((button) => { button.disabled = value; });
  els.send.disabled = value || !els.input.value.trim();
  if (retryableFailure) retryableFailure.button.disabled = value || retryableFailure.retryable === false;
  updateModeUi();
}

function updateModeUi(announced = false) {
  els.modeButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.companionMode === selectedMode)));
  els.modeDescription.textContent = selectedMode === "free"
    ? "同样检索公开资料；想法与反应可以演绎，不代表本人事实。"
    : "使用相同的资料检索；只说本次来源能支持的内容。";
  els.drawerModeSummary.textContent = `当前选择：${MODE_LABELS[selectedMode]}。两种模式共享人物知识与公开资料检索，区别是允许演绎还是必须有依据。从下一条回复生效；上下文彼此独立，旧回复保持原模式。`;
  els.modeStatus.textContent = isGenerating && generatingMode !== selectedMode
    ? `正在生成的回复仍是「${MODE_LABELS[generatingMode]}」；下一条切换。`
    : announced ? `已切换，下条生效 · ${MODE_LABELS[selectedMode]}有独立上下文。` : "两种模式上下文独立 · 旧回复不会改变";
}

function selectMode(mode) {
  if (!(mode in MODE_LABELS) || selectedMode === mode) return;
  selectedMode = mode;
  updateModeUi(true);
}

function resizeInput() {
  els.count.textContent = `${els.input.value.length} / ${MAX_PROMPT_CHARS}`;
  els.count.classList.toggle("is-limit", els.input.value.length >= MAX_PROMPT_CHARS);
  els.send.disabled = isGenerating || !els.input.value.trim();
  if (!els.input.value) {
    els.input.style.height = "";
    return;
  }
  els.input.style.height = "auto";
  els.input.style.height = `${Math.min(els.input.scrollHeight, 110)}px`;
}

function syncViewportHeight() {
  const height = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty("--companion-viewport-height", `${Math.round(height)}px`);
}

function setModelState(state, status = companionStatus) {
  const packageLabel = status?.package_version ? `人物知识包 v${status.package_version}` : "人物知识包";
  els.modelDisclosure.dataset.state = state;
  if (state === "ready") {
    els.modelStatusTitle.textContent = "DeepSeek 已配置";
    els.modelStatusDetail.textContent = "发送后由模型生成；连接未验证。非本人、非官方。";
    els.runtimeNote.textContent = `${packageLabel} · ${status?.model || "DeepSeek"} · 服务配置可用，模型生成尚未验证。`;
    return;
  }
  if (state === "online") {
    const model = status?.model || "DeepSeek";
    els.modelStatusTitle.textContent = "DeepSeek 已连接";
    els.modelStatusDetail.textContent = "非官方风格演绎，不代表本人、McLaren 或 F1。";
    els.runtimeNote.replaceChildren(
      document.createTextNode(`${packageLabel} · ${model}`),
      document.createElement("br"),
      document.createTextNode("两种模式共享资料检索；人物表达受公开材料与领域边界约束。"),
    );
    return;
  }
  if (state === "error") {
    els.modelStatusTitle.textContent = "模型服务暂不可用";
    els.modelStatusDetail.textContent = "未生成角色回复。可重试；不会使用预写回答代替。";
    els.runtimeNote.replaceChildren(
      document.createTextNode(`${packageLabel} · 模型服务异常`),
      document.createElement("br"),
      document.createTextNode("服务异常提示不是角色回复，不会写入对话上下文。"),
    );
    return;
  }
  els.modelStatusTitle.textContent = "正在连接 DeepSeek…";
  els.modelStatusDetail.textContent = "非官方风格演绎，不代表本人、McLaren 或 F1。";
}

async function loadCompanionConfig() {
  try {
    const configResponse = await fetch("../data/runtime-config.json", { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (configResponse.ok) {
      const config = await configResponse.json();
      if (typeof config.analytics_url === "string" && config.analytics_url.startsWith("https://")) {
        companionApiUrl = config.analytics_url.replace(/\/+$/, "");
      }
    }
  } catch (_) {
    // The public Worker URL remains the default.
  }

  try {
    const statusResponse = await fetch(`${companionApiUrl}/companion/status`, { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!statusResponse.ok) throw new Error(String(statusResponse.status));
    companionStatus = await statusResponse.json();
    if (!companionStatus.online) throw new Error("model offline");
    if (!messageCounter) setModelState("ready", companionStatus);
  } catch (_) {
    if (!messageCounter) setModelState("error");
  }
}

function modelTrace(payload) {
  const facts = [...new Set([...(payload.knowledge_fact_ids || []), ...(payload.rumor_item_ids || []), ...(payload.public_source_ids || [])])];
  const liveSources = (payload.sources || []).filter((source) => /^LIVE-/.test(source.id || ""));
  for (const source of liveSources) if (!facts.includes(source.id)) facts.push(source.id);
  const retrievalKeys = ["retrieved_knowledge_fact_ids", "retrieved_rumor_item_ids", "retrieved_public_source_ids"];
  const retrievalSummary = retrievalKeys.some((key) => Array.isArray(payload[key]))
    ? `本次检索：人物事实 ${payload.retrieved_knowledge_fact_ids?.length || 0} 项、传闻台账 ${payload.retrieved_rumor_item_ids?.length || 0} 项、公开来源 ${payload.retrieved_public_source_ids?.length || 0} 项。检索到不等于回答采用；下方只展示本条引用的来源。`
    : "";
  const styleId = payload.style_card_id || "SC-06";
  return {
    route: payload.route || "unrelated_general",
    domain: ROUTE_LABELS[payload.route] || "Distilled domain route",
    fact: payload.answer_kind === "fictional" ? `角色演绎 · 不是本人事实，也不是原话${facts.length ? `；关联来源：${facts.join(" · ")}` : ""}` : facts.length ? facts.join(" · ") : payload.answer_kind === "social" ? "社交表达，无需事实来源" : payload.answer_kind === "insufficient" ? "本次可用来源不足" : "这条回答没有关联事实来源",
    style: `${styleId} · ${payload.answer_kind === "boundary" ? "模型生成的边界答复" : "DeepSeek constrained generation"}`,
    styleNote: [payload.notes || "模型按蒸馏约束生成；关联来源不等于逐条独立核验。", retrievalSummary].filter(Boolean).join("\n"),
    sources: (payload.sources || []).map((source) => ({
      mark: source.publisher === "@OscarPiastri" ? "X" : String(source.publisher || "SRC").slice(0, 4).toUpperCase(),
      id: source.id,
      label: source.label,
      url: source.url,
    })),
  };
}

async function requestModelResponse(prompt, mode, signal, history, surfaceContext) {
  const response = await fetch(`${companionApiUrl}/companion/chat`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: prompt,
      history,
      mode,
      facts_only: mode === "grounded",
      candidate_mode: true,
      disclosure_shown: true,
      surface_context: surfaceContext,
    }),
  });
  if (!response.ok) {
    const error = new Error("Companion service request failed");
    error.status = response.status;
    // Only copy bounded, allowlisted diagnostics. The response may be an HTML
    // proxy error or contain private provider details; never render its message.
    try {
      const failure = await response.json();
      if (["COMPANION_UPSTREAM_FAILED", "COMPANION_TIMEOUT", "COMPANION_INVALID_RESPONSE", "COMPANION_VALIDATION_FAILED", "COMPANION_INTERNAL_ERROR", "COMPANION_MODEL_UNAVAILABLE", "COMPANION_GENERATION_FAILED"].includes(failure?.error_code)) error.errorCode = failure.error_code;
      if (typeof failure?.request_id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(failure.request_id)) error.requestId = failure.request_id.toLowerCase();
      if (typeof failure?.retryable === "boolean") error.retryable = failure.retryable;
    } catch (bodyError) {
      if (bodyError?.name === "AbortError" || bodyError?.name === "TimeoutError") throw bodyError;
      // Missing / non-JSON error bodies still have a usable HTTP status.
    }
    throw error;
  }
  let payload;
  try {
    payload = await response.json();
    if (payload.engine !== "deepseek" || typeof payload.model !== "string" || !payload.model.trim() || typeof payload.answer_en !== "string" || !payload.answer_en.trim()) throw new Error("Missing model response");
    if (payload.answer_zh != null && typeof payload.answer_zh !== "string") throw new Error("Unexpected translation");
    if (payload.mode !== mode || !Object.hasOwn(ANSWER_KIND_LABELS, payload.answer_kind)) throw new Error("Unexpected mode or answer kind");
    if (mode === "grounded" && payload.answer_kind === "fictional") throw new Error("Grounded response cannot be fictional");
  } catch (bodyError) {
    if (bodyError?.name === "AbortError" || bodyError?.name === "TimeoutError") throw bodyError;
    const error = new Error("Companion response validation failed");
    error.serviceReason = "invalid_response";
    throw error;
  }
  return {
    mode: payload.mode,
    answerKind: payload.answer_kind,
    model: payload.model,
    generationKind: "deepseek",
    en: payload.answer_en,
    zh: payload.answer_zh || "",
    trace: modelTrace(payload),
    metadata: payload,
  };
}

function serviceErrorDescription(error) {
  const retryHint = error?.retryable === false ? "需要维护者检查后再试。" : "请重试。";
  const retryLaterHint = error?.retryable === false ? retryHint : "请稍后重试。";
  const timeoutHint = `等待模型响应超时。${error?.retryable === false ? retryHint : "可以重试这条消息。"}`;
  if (error?.name === "AbortError" || error?.name === "TimeoutError" || error?.status === 504) return timeoutHint;
  if (error?.status === 429) return `请求较多，模型暂时无法响应。${retryLaterHint}`;
  if (error?.name === "TypeError") return "暂时无法连接模型服务。请检查网络后重试。";
  if (error?.serviceReason === "invalid_response") return `模型服务返回的内容未通过校验，因此没有显示为角色回复。${retryHint}`;
  switch (error?.errorCode) {
    case "COMPANION_TIMEOUT": return timeoutHint;
    case "COMPANION_INVALID_RESPONSE": return `模型返回格式不完整，这次没有生成可显示的回答。${retryHint}`;
    case "COMPANION_VALIDATION_FAILED": return `模型已返回内容，但未通过回答校验，因此没有显示为角色回复。${retryHint}`;
    case "COMPANION_UPSTREAM_FAILED": return `模型接口调用未成功，这次没有生成回答。${retryLaterHint}`;
    case "COMPANION_MODEL_UNAVAILABLE": return "模型连接尚未就绪，需要维护者检查服务配置。";
    case "COMPANION_INTERNAL_ERROR": return `对话服务处理请求时出现异常，这次没有生成回答。${retryLaterHint}`;
  }
  return `模型服务暂时异常，这次没有生成回答。${retryLaterHint}`;
}

function expireRetryableFailure() {
  if (!retryableFailure) return;
  retryableFailure.button.disabled = true;
  retryableFailure.button.textContent = "重试已结束";
  retryableFailure.note.textContent = "已开始新的请求。如仍想问这条消息，请重新发送。";
  retryableFailure = null;
}

function showServiceError(error, request, existing = null) {
  let record = existing;
  if (!record) {
    const article = document.createElement("article");
    article.className = "message system-message";
    article.dataset.mode = request.mode;
    article.setAttribute("aria-label", "系统服务异常，不是角色回复");
    const meta = document.createElement("div");
    meta.className = "message-meta";
    const speaker = document.createElement("span");
    speaker.textContent = "SYSTEM";
    const label = document.createElement("span");
    label.className = "message-engine";
    label.textContent = `服务提示 · ${MODE_LABELS[request.mode]}`;
    meta.append(speaker, label);
    const copy = document.createElement("div");
    copy.className = "message-copy";
    const title = document.createElement("p");
    title.className = "service-error-title";
    title.textContent = "这次没有生成回答";
    const detail = document.createElement("p");
    detail.className = "service-error-detail";
    detail.setAttribute("role", "status");
    detail.setAttribute("aria-atomic", "true");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "service-retry";
    const note = document.createElement("p");
    note.className = "service-error-note";
    copy.append(title, detail, button, note);
    article.append(meta, copy);
    record = { request, article, detail, button, note };
    button.addEventListener("click", () => submitPrompt(request.prompt, record));
    els.messages.append(article);
  }
  record.retryable = error?.retryable !== false;
  const requestId = typeof error?.requestId === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(error.requestId) ? error.requestId.toLowerCase() : "";
  record.article.dataset.requestId = requestId;
  record.detail.textContent = serviceErrorDescription(error);
  record.button.textContent = record.retryable ? `重试这条 · ${MODE_LABELS[request.mode]}` : "需要维护者处理";
  record.button.disabled = isGenerating || !record.retryable;
  record.note.textContent = (record.retryable ? "沿用本条发送时的模式与上下文；不会重复添加你的消息。" : "此类问题需要服务端处理，暂不提供原样重试。") + (requestId ? ` 排查编号：${requestId.slice(0, 8)}` : "");
  retryableFailure = record;
  if (followLatest) scrollToLatest();
  else els.jumpLatest.hidden = false;
  return record;
}

async function submitPrompt(rawPrompt, retryRecord = null) {
  const prompt = rawPrompt.trim().slice(0, MAX_PROMPT_CHARS);
  if (!prompt || isGenerating || (retryRecord && (retryRecord !== retryableFailure || retryRecord.retryable === false))) return;
  if (!retryRecord) expireRetryableFailure();
  const requestMode = retryRecord?.request.mode || selectedMode;
  const request = retryRecord?.request || Object.freeze({
    prompt,
    mode: requestMode,
    history: Object.freeze(conversationHistories[requestMode].slice(-MAX_HISTORY_ITEMS).map((item) => Object.freeze({ role: item.role, content: item.content.slice(0, MAX_HISTORY_CHARS) }))),
    surfaceContext: contextEnabled ? Object.freeze({ race: els.raceName.textContent, session: els.sessionLabel.textContent, local_time: els.sessionTime.textContent }) : null,
  });
  generatingMode = requestMode;
  const epoch = ++requestEpoch;
  const controller = new AbortController();
  activeRequest = controller;
  const timeout = setTimeout(() => controller.abort(), 55000);
  followLatest = true;
  document.body.classList.add("has-conversation");
  if (!retryRecord) {
    addMessage("user", prompt);
    els.input.value = "";
  } else {
    retryRecord.button.textContent = "正在重试…";
    retryRecord.detail.textContent = "正在重新请求模型，本条仍使用发送时的模式与上下文。";
  }
  resizeInput();
  setGenerating(true);
  // Pin the sent message synchronously at the next frame. A smooth initial
  // scroll can emit intermediate scroll events before an instant service reply,
  // incorrectly marking the user as reading history instead of following along.
  scrollToLatest(false);

  const requestHistory = request.history;
  const requestStarted = performance.now();
  let response;
  try {
    response = await requestModelResponse(prompt, requestMode, controller.signal, requestHistory, request.surfaceContext);
    if (epoch !== requestEpoch) return;
    companionStatus = { ...(companionStatus || {}), online: true, model: response.model, package_version: response.metadata.package_version, source_hash: response.metadata.source_hash };
    setModelState("online", companionStatus);
  } catch (error) {
    if (epoch !== requestEpoch) return;
    companionStatus = { ...(companionStatus || {}), online: false };
    setModelState("error");
    showServiceError(error, request, retryRecord);
    return;
  } finally {
    clearTimeout(timeout);
    if (epoch === requestEpoch) {
      activeRequest = null;
      generatingMode = null;
      setGenerating(false);
    }
  }
  if (epoch !== requestEpoch) return;
  if (retryRecord) {
    retryRecord.article.remove();
    retryableFailure = null;
  }
  const useZh = containsChinese(prompt);
  const text = response.en;
  const translation = useZh ? response.zh : "";
  const engine = response.generationKind;
  const feedbackSnapshot = createFeedbackSnapshot({
    prompt,
    text,
    translation,
    history: requestHistory,
    engine, mode: requestMode, answerKind: response.answerKind, trace: response.trace, metadata: response.metadata,
    latencyMs: performance.now() - requestStarted,
  });
  addMessage("assistant", text, translation, response.trace, engine, feedbackSnapshot);
  renderTrace(response.trace);
  conversationHistories[requestMode].push(
    { role: "user", content: prompt },
    { role: "assistant", content: [text, translation && `中文：${translation}`].filter(Boolean).join("\n").slice(0, MAX_HISTORY_CHARS) },
  );
  conversationHistories[requestMode] = conversationHistories[requestMode].slice(-MAX_HISTORY_ITEMS);
}

function resetConversation() {
  closeDialog();
  requestEpoch += 1;
  expireRetryableFailure();
  activeRequest?.abort();
  activeRequest = null;
  generatingMode = null;
  setGenerating(false);
  document.body.classList.remove("has-conversation");
  els.messages.replaceChildren(welcomeMessage);
  messageCounter = 0;
  conversationHistories = { free: [], grounded: [] };
  els.input.value = "";
  resizeInput();
  scrollToLatest(false);
  renderTrace(DEFAULT_TRACE);
  els.input.focus();
}

function formatSessionTime(iso) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date) + " CST";
}

async function loadRaceContext() {
  try {
    const response = await fetch("../data/calendar.json", { cache: "no-store", signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    const race = data.next_race;
    if (!race) throw new Error("Calendar unavailable");
    els.raceName.textContent = race.name;
    els.raceCode.textContent = race.country_code || "F1";
    els.raceRound.textContent = `ROUND ${race.round} · ${(race.locality || race.country_code || "F1").toUpperCase()}`;
    const sessions = Object.entries(race.sessions || {}).map(([key, value]) => ({ key, value, date: new Date(value) })).filter((session) => Number.isFinite(session.date.getTime())).sort((a, b) => a.date - b.date);
    const next = sessions.find((session) => session.date.getTime() >= Date.now());
    if (next) {
      const labels = { practice_1: "PRACTICE 1", practice_2: "PRACTICE 2", practice_3: "PRACTICE 3", sprint_qualifying: "SPRINT QUALI", sprint: "SPRINT", qualifying: "QUALIFYING", race: "RACE" };
      els.sessionLabel.textContent = labels[next.key] || next.key.toUpperCase();
      els.sessionTime.textContent = formatSessionTime(next.value);
      els.composerContext.textContent = `${race.name.replace(" Grand Prix", " GP")} · ${(labels[next.key] || next.key).replace("PRACTICE", "FP")}`;
      if (!contextDismissed) {
        contextEnabled = true;
        els.clearContext.parentElement.hidden = false;
      }
    } else {
      els.sessionLabel.textContent = "赛历暂无后续赛段";
    }
  } catch (_) {
    els.raceName.textContent = "赛历暂不可用";
    els.sessionLabel.textContent = "仍可自由聊天";
  }
}

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitPrompt(els.input.value);
});

els.input.addEventListener("input", resizeInput);
els.input.addEventListener("focus", () => {
  window.setTimeout(() => {
    syncViewportHeight();
    if (followLatest) scrollToLatest(false);
  }, 120);
});
els.input.addEventListener("keydown", (event) => {
  if (!event.isComposing && (event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    els.form.requestSubmit();
  }
});

els.promptList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-prompt]");
  if (button) submitPrompt(button.dataset.prompt);
});

els.reset.addEventListener("click", resetConversation);
els.panelButton.addEventListener("click", () => setPanel(!els.panel.classList.contains("is-open")));
els.closePanel.addEventListener("click", () => setPanel(false));
els.backdrop.addEventListener("click", closeDialog);
els.closeFeedback.addEventListener("click", closeDialog);
els.feedbackForm.addEventListener("submit", submitFeedback);
els.feedbackForm.addEventListener("change", () => { saveFeedbackDraft(); updateFeedbackSelection(); });
els.feedbackForm.addEventListener("input", saveFeedbackDraft);
els.jumpLatest.addEventListener("click", () => scrollToLatest());
els.messages.addEventListener("scroll", () => {
  followLatest = els.messages.scrollHeight - els.messages.clientHeight - els.messages.scrollTop < 80;
  if (followLatest) els.jumpLatest.hidden = true;
}, { passive: true });
document.addEventListener("keydown", (event) => {
  if (!activeDialog) return;
  if (event.key === "Escape") { event.preventDefault(); closeDialog(); }
  if (event.key === "Tab") {
    const targets = [...activeDialog.querySelectorAll("button, a[href], input, textarea, summary, [tabindex='0']")].filter((el) => !el.matches(":disabled") && el.getClientRects().length);
    const first = targets[0];
    const last = targets.at(-1);
    if (!targets.length) { event.preventDefault(); activeDialog.focus(); }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === activeDialog)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});
els.evidenceToggle.addEventListener("click", () => {
  const hidden = els.evidenceList.hidden;
  els.evidenceList.hidden = !hidden;
  els.evidenceToggle.textContent = hidden ? "收起" : "展开";
  els.evidenceToggle.setAttribute("aria-expanded", String(hidden));
});
els.clearContext.addEventListener("click", () => {
  contextEnabled = false;
  contextDismissed = true;
  els.clearContext.parentElement.hidden = true;
});
els.modeButtons.forEach((button) => button.addEventListener("click", () => selectMode(button.dataset.companionMode)));
// A mode switch applies prospectively, never to an in-flight request or an old reply.
els.hero.addEventListener("pointermove", (event) => {
  if (reducedMotion.matches || event.pointerType !== "mouse" || window.innerWidth <= 800) return;
  const rect = els.hero.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width - .5;
  const y = (event.clientY - rect.top) / rect.height - .5;
  els.hero.style.setProperty("--parallax-x", `${x * 12}px`);
  els.hero.style.setProperty("--parallax-y", `${y * 9}px`);
  els.hero.style.setProperty("--parallax-rotate", `${x * 5}deg`);
}, { passive: true });
els.hero.addEventListener("pointerleave", () => {
  ["--parallax-x", "--parallax-y", "--parallax-rotate"].forEach((key) => els.hero.style.removeProperty(key));
});

window.addEventListener("resize", syncViewportHeight);
window.visualViewport?.addEventListener("resize", syncViewportHeight);

FEEDBACK_CATEGORIES.forEach(([id, label], index) => {
  const option = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.name = "feedbackCategory";
  input.value = id;
  const copy = document.createElement("span");
  copy.textContent = label;
  option.append(input, copy);
  (index < 6 ? els.feedbackCommon : els.feedbackMore).append(option);
});
attachFeedback(welcomeMessage, createFeedbackSnapshot({
  text: "A race. A rumour.\nOr just a good result.",
  translation: "聊一场比赛，核验一条传闻，\n或者，单纯为一个好结果高兴。",
}));
syncViewportHeight();
updateModeUi();
resizeInput();
loadCompanionConfig();
loadRaceContext();
renderTrace(DEFAULT_TRACE);
