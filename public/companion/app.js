import { makeOfflineResponse } from "./offline-response.js?v=20260910-scope-1";

const DEFAULT_WORKER_URL = "https://piasnews-review.znonymity-piasnews.workers.dev";
const MAX_HISTORY_ITEMS = 8;
const MAX_HISTORY_CHARS = 900;
const MAX_PROMPT_CHARS = 500;
const APP_VERSION = "20260910-scope-1";
const FEEDBACK_CATEGORIES = [
  ["off_persona", "不像 Oscar"], ["unnatural", "太机械 / 不自然"],
  ["fact_error", "事实不对"], ["irrelevant", "答非所问"],
  ["over_refusal", "不该拒绝却拒绝"], ["context_loss", "没接住上下文"],
  ["boundary_miss", "该收住却越界"], ["invented_private", "编造私事 / 想法"],
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
  factsOnly: document.querySelector("#factsOnlyToggle"),
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
let conversationHistory = [];
let requestEpoch = 0;
let activeRequest = null;
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


function createFeedbackSnapshot({ prompt = "", text = "", translation = "", history = [], engine = "welcome", factsOnly = false, trace = DEFAULT_TRACE, metadata = {}, latencyMs = null } = {}) {
  const sourceIds = (trace.sources || []).map((source) => source.id);
  const ids = (key, pattern, max) => [...new Set(metadata[key] || sourceIds.filter((id) => pattern.test(id)))].slice(0, max);
  return Object.freeze({
    prompt: prompt.slice(0, MAX_PROMPT_CHARS),
    answer_en: text.slice(0, MAX_HISTORY_CHARS),
    answer_zh: translation.slice(0, MAX_HISTORY_CHARS),
    history: Object.freeze(history.slice(-4).map((item) => Object.freeze({ role: item.role, content: item.content.slice(0, MAX_HISTORY_CHARS) }))),
    engine,
    model: String(metadata.model || "").slice(0, 80),
    route: String(trace.route || "").slice(0, 80),
    style_card_id: String(metadata.style_card_id || (engine === "fallback" ? trace.style.match(/SC-\d+/)?.[0] : "") || "").slice(0, 40),
    package_version: String(metadata.package_version || "").slice(0, 40),
    source_hash: String(metadata.source_hash || "").slice(0, 80),
    facts_only: Boolean(factsOnly),
    app_version: APP_VERSION,
    knowledge_fact_ids: Object.freeze(ids("knowledge_fact_ids", /^KF-/, 4)),
    rumor_item_ids: Object.freeze(ids("rumor_item_ids", /^RM-/, 1)),
    judgment_rule_ids: Object.freeze((metadata.judgment_rule_ids || []).slice(0, 1)),
    evidence_ids: Object.freeze(ids("evidence_ids", /^EV-/, 8)),
    latency_ms: Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs)) : null,
  });
}

function attachFeedback(article, snapshot) {
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
    engineLabel.textContent = {
      deepseek: "DEEPSEEK · 模型生成",
      boundary: feedbackSnapshot?.model ? "边界答复 · 模型分流" : "边界答复 · 服务端判定",
      ledger: "谣言台账 · 固定答复",
      fallback: "规则兜底 · 非模型生成",
    }[engine] || "规则兜底 · 非模型生成";
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
  if (role === "assistant") attachFeedback(article, feedbackSnapshot || createFeedbackSnapshot({ text, translation, engine: engine || "fallback", trace: trace || DEFAULT_TRACE }));
  els.messages.append(article);
  if (role === "user" || followLatest) scrollToLatest();
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
    `模型：${snapshot.model || "无（固定文案）"} · Skill：${snapshot.package_version || "无模型版本"}`,
    `风格卡：${snapshot.style_card_id || "无"} · 仅事实：${snapshot.facts_only ? "是" : "否"}`,
    `事实 / 谣言 / 规则 / 证据：${[...snapshot.knowledge_fact_ids, ...snapshot.rumor_item_ids, ...snapshot.judgment_rule_ids, ...snapshot.evidence_ids].join(", ") || "无"}`,
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
  els.modelDisclosure.dataset.state = state;
  if (state === "boundary") {
    els.modelStatusTitle.textContent = "边界答复 · 本轮未调用模型";
    els.modelStatusDetail.textContent = "服务端直接判定边界；这条回复不代表模型连接验证。";
    els.runtimeNote.textContent = "Skill v0.4.0 · 固定边界答复 · 本轮没有调用 DeepSeek。";
    return;
  }
  if (state === "ready") {
    els.modelStatusTitle.textContent = "DeepSeek 已配置";
    els.modelStatusDetail.textContent = "发送后验证连接 · 非官方风格演绎，不代表本人。";
    els.runtimeNote.textContent = `Skill v0.4.0 · ${status?.model || "DeepSeek"} · 服务配置可用，模型生成尚未验证。`;
    return;
  }
  if (state === "online") {
    const model = status?.model || "DeepSeek";
    els.modelStatusTitle.textContent = "DeepSeek 已连接";
    els.modelStatusDetail.textContent = "非官方风格演绎，不代表本人、McLaren 或 F1。";
    els.runtimeNote.replaceChildren(
      document.createTextNode(`Skill v0.4.0 · ${model}`),
      document.createElement("br"),
      document.createTextNode("人物表达受公开材料与领域边界约束。"),
    );
    return;
  }
  if (state === "fallback") {
    els.modelStatusTitle.textContent = "模型暂不可用 · 规则兜底";
    els.modelStatusDetail.textContent = "兜底回答会逐条标注；仍可继续聊天重试模型。";
    els.runtimeNote.replaceChildren(
      document.createTextNode("Skill v0.4.0 · fallback active"),
      document.createElement("br"),
      document.createTextNode("规则兜底不是模型生成，也不是实时事实核验。"),
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
    if (!messageCounter) setModelState("fallback");
  }
}

function modelTrace(payload) {
  const facts = [...(payload.knowledge_fact_ids || []), ...(payload.rumor_item_ids || [])];
  const styleId = payload.style_card_id || "SC-06";
  return {
    route: payload.route || "unrelated_general",
    domain: ROUTE_LABELS[payload.route] || "Distilled domain route",
    fact: facts.length ? facts.join(" · ") : "No stored fact selected",
    style: `${styleId} · ${payload.fallback_id ? "固定边界答复" : payload.route === "rumor_check" && payload.rumor_item_ids?.length ? "谣言台账答复" : "DeepSeek constrained generation"}`,
    styleNote: payload.notes || "模型按蒸馏约束生成；关联来源不等于逐条独立核验。",
    sources: (payload.sources || []).map((source) => ({
      mark: source.publisher === "@OscarPiastri" ? "X" : String(source.publisher || "SRC").slice(0, 4).toUpperCase(),
      id: source.id,
      label: source.label,
      url: source.url,
    })),
  };
}

async function requestModelResponse(prompt, factsOnly, signal, history) {
  const response = await fetch(`${companionApiUrl}/companion/chat`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: prompt,
      history,
      facts_only: factsOnly,
      candidate_mode: true,
      disclosure_shown: true,
      surface_context: contextEnabled ? {
        race: els.raceName.textContent,
        session: els.sessionLabel.textContent,
        local_time: els.sessionTime.textContent,
      } : null,
    }),
  });
  if (!response.ok) throw new Error(`Companion API ${response.status}`);
  const payload = await response.json();
  if (!["deepseek", "boundary"].includes(payload.engine) || typeof payload.answer_en !== "string") {
    throw new Error("Unexpected Companion response");
  }
  return {
    model: payload.model,
    modelInvoked: payload.engine === "deepseek",
    generationKind: payload.engine === "boundary" || payload.fallback_id ? "boundary" : payload.route === "rumor_check" && payload.rumor_item_ids?.length ? "ledger" : "deepseek",
    en: payload.answer_en,
    zh: payload.answer_zh || "",
    singleLanguage: false,
    trace: modelTrace(payload),
    metadata: payload,
  };
}

async function submitPrompt(rawPrompt) {
  const prompt = rawPrompt.trim().slice(0, MAX_PROMPT_CHARS);
  if (!prompt || isGenerating) return;
  const epoch = ++requestEpoch;
  const controller = new AbortController();
  activeRequest = controller;
  const timeout = setTimeout(() => controller.abort(), 55000);
  followLatest = true;
  document.body.classList.add("has-conversation");
  addMessage("user", prompt);
  els.input.value = "";
  resizeInput();
  setGenerating(true);
  scrollToLatest();

  const factsOnly = els.factsOnly.checked;
  const requestHistory = conversationHistory.slice(-MAX_HISTORY_ITEMS).map((item) => ({ role: item.role, content: item.content.slice(0, MAX_HISTORY_CHARS) }));
  const requestContextEnabled = contextEnabled;
  const requestStarted = performance.now();
  let response;
  let usedApi = false;
  try {
    response = await requestModelResponse(prompt, factsOnly, controller.signal, requestHistory);
    if (epoch !== requestEpoch) return;
    usedApi = true;
    if (response.modelInvoked) {
      companionStatus = { ...(companionStatus || {}), online: true, model: response.model };
      setModelState("online", companionStatus);
    } else if (els.modelDisclosure.dataset.state === "connecting") {
      setModelState("boundary");
    }
  } catch (_) {
    if (epoch !== requestEpoch) return;
    response = makeOfflineResponse(prompt, { factsOnly, history: requestHistory, contextEnabled: requestContextEnabled });
    response.trace = {
      ...response.trace,
      styleNote: `${response.trace.styleNote} Model unavailable; deterministic fallback used.`,
    };
    setModelState("fallback");
  } finally {
    clearTimeout(timeout);
  }
  if (epoch !== requestEpoch) return;
  activeRequest = null;
  setGenerating(false);
  const useZh = containsChinese(prompt);
  const text = response.singleLanguage && useZh
    ? response.zh
    : (factsOnly && response.factsEn ? response.factsEn : response.en);
  const translation = response.singleLanguage
    ? ""
    : (useZh ? (factsOnly && response.factsZh ? response.factsZh : response.zh) : "");
  const engine = usedApi ? response.generationKind : "fallback";
  const feedbackSnapshot = createFeedbackSnapshot({
    prompt,
    text: response.singleLanguage && useZh ? "" : text,
    translation: response.singleLanguage && useZh ? text : translation,
    history: requestHistory,
    engine, factsOnly, trace: response.trace, metadata: response.metadata,
    latencyMs: performance.now() - requestStarted,
  });
  addMessage("assistant", text, translation, response.trace, engine, feedbackSnapshot);
  renderTrace(response.trace);
  conversationHistory.push(
    { role: "user", content: prompt },
    { role: "assistant", content: [text, translation && `中文：${translation}`].filter(Boolean).join("\n").slice(0, MAX_HISTORY_CHARS) },
  );
  conversationHistory = conversationHistory.slice(-MAX_HISTORY_ITEMS);
  if (!usedApi) companionStatus = { ...(companionStatus || {}), online: false };
}

function resetConversation() {
  closeDialog();
  requestEpoch += 1;
  activeRequest?.abort();
  activeRequest = null;
  setGenerating(false);
  document.body.classList.remove("has-conversation");
  els.messages.replaceChildren(welcomeMessage);
  messageCounter = 0;
  conversationHistory = [];
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
// Facts-only applies prospectively: never rewrite the trace of an existing answer.
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
resizeInput();
loadCompanionConfig();
loadRaceContext();
renderTrace(DEFAULT_TRACE);
