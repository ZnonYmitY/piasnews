import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

// Exercise the real browser request/snapshot functions without a browser or live API.
// Keeping these functions in the script also preserves the small static-site build.
const source = readFileSync(new URL("../../public/companion/app.js", import.meta.url), "utf8");
function segment(start, end) { return source.slice(source.indexOf(start), source.indexOf(end)); }
const functions = [
  segment("function createFeedbackSnapshot(", "function attachFeedback("),
  segment("function updateModeUi(", "function resizeInput("),
  segment("function modelTrace(", "async function requestModelResponse("),
  segment("async function requestModelResponse(", "function formatSessionTime("),
].join("\n");

class Element {
  constructor(tag = "div") { this.tag = tag; this.children = []; this.dataset = {}; this.listeners = {}; this.textContent = ""; this.disabled = false; }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  replaceChildren(...children) { this.children = []; this.append(...children); }
  setAttribute(key, value) { this[key] = value; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); }
  focus() {}
}

function harness() {
  const pending = [];
  const posts = [];
  const messages = [];
  const modelStates = [];
  const scrollCalls = [];
  const buttons = ["free", "grounded"].map((mode) => ({ dataset: { companionMode: mode }, setAttribute(key, value) { this[key] = value; } }));
  const context = {
    MAX_PROMPT_CHARS: 500, MAX_HISTORY_ITEMS: 8, MAX_HISTORY_CHARS: 900, APP_VERSION: "20260910-model-only-1",
    MODE_LABELS: { free: "自由演绎", grounded: "强依据" },
    ANSWER_KIND_LABELS: { fictional: "角色演绎", evidence: "有来源的事实", social: "轻松聊天", boundary: "边界答复", insufficient: "依据不足" },
    ROUTE_LABELS: { fan_light: "Fan conversation", public_fact: "Public fact", unrelated_general: "Outside scope" },
    DEFAULT_TRACE: { route: "fan_light", sources: [] },
    selectedMode: "free", generatingMode: null, conversationHistories: { free: [], grounded: [] },
    requestEpoch: 0, activeRequest: null, retryableFailure: null, isGenerating: false, followLatest: false, contextEnabled: false, messageCounter: 0,
    companionApiUrl: "https://example.invalid", companionStatus: { online: true, model: "previous-model" },
    els: { input: Object.assign(new Element("textarea"), { value: "" }), messages: new Element(), jumpLatest: {}, modeButtons: buttons, modeDescription: {}, modeStatus: {}, drawerModeSummary: {}, modelDisclosure: { dataset: { state: "ready" } }, raceName: { textContent: "Race before send" }, sessionLabel: { textContent: "Session before send" }, sessionTime: { textContent: "Time before send" } },
    document: { body: { classList: { add() {}, remove() {} } }, createElement(tag) { return new Element(tag); } },
    welcomeMessage: new Element(), closeDialog() {},
    AbortController, setTimeout, clearTimeout, performance,
    addMessage(...args) { messages.push(args); }, containsChinese(value) { return /[\u3400-\u9fff]/.test(value); },
    resizeInput() {}, scrollToLatest(smooth = true) { scrollCalls.push(smooth); }, renderTrace() {},
    fetch(_url, options) { posts.push(JSON.parse(options.body)); return new Promise((resolve) => pending.push(resolve)); },
  };
  context.setGenerating = (value) => { context.isGenerating = value; if (context.retryableFailure) context.retryableFailure.button.disabled = value || context.retryableFailure.retryable === false; context.updateModeUi(); };
  context.setModelState = (state) => { modelStates.push(state); context.els.modelDisclosure.dataset.state = state; };
  vm.createContext(context);
  vm.runInContext(functions, context);
  const respond = (overrides = {}) => pending.shift()({ ok: true, json: async () => ({
    engine: "deepseek", model: "deepseek-test", mode: posts.at(-1).mode, answer_kind: "fictional",
    answer_en: "One step at a time.", answer_zh: "一次处理一步。", route: "fan_light", style_card_id: "SC-05",
    package_version: "0.4.0", source_hash: "snapshot-hash", sources: [], public_source_ids: [], ...overrides,
  }) });
  const fail = (status = 503, payload) => pending.shift()({ ok: false, status, json: async () => payload });
  return { context, pending, posts, messages, modelStates, scrollCalls, respond, fail };
}

test("switching mode during generation keeps the request, feedback and history in the original mode", async () => {
  const h = harness();
  const first = h.context.submitPrompt("你在想什么");
  assert.equal(h.posts[0].mode, "free");
  assert.equal(h.posts[0].facts_only, false);
  h.context.selectMode("grounded");
  assert.match(h.context.els.modeStatus.textContent, /仍是「自由演绎」/);
  h.respond();
  await first;
  assert.equal(h.messages[1][5].mode, "free");
  assert.equal(h.messages[1][5].answer_kind, "fictional");
  assert.equal(h.messages[1][5].facts_only, false);
  assert.equal(h.context.conversationHistories.free.length, 2);
  assert.equal(h.context.conversationHistories.grounded.length, 0);

  const second = h.context.submitPrompt("为什么是81");
  assert.equal(h.posts[1].mode, "grounded");
  assert.equal(h.posts[1].facts_only, true);
  assert.deepEqual(h.posts[1].history, []);
  h.respond({ answer_kind: "insufficient", route: "insufficient_current_fact" });
  await second;
  assert.equal(h.messages[3][5].mode, "grounded");
  assert.equal(h.messages[3][5].answer_kind, "insufficient");
  assert.equal(h.context.conversationHistories.grounded.length, 2);

  h.context.selectMode("free");
  const third = h.context.submitPrompt("继续");
  assert.equal(h.posts[2].history.length, 2);
  assert.equal(h.posts[2].history[0].content, "你在想什么");
  assert.ok(h.posts[2].history.every((item) => !item.content.includes("为什么是81")));
  h.respond();
  await third;
  assert.equal(h.messages[1][5].mode, "free", "the old reply snapshot remains unchanged");
});

test("LIVE-only evidence appears in the trace and immutable feedback metadata", async () => {
  const h = harness();
  h.context.selectMode("grounded");
  const liveId = "LIVE-aabbccddeeff0011";
  const result = h.context.submitPrompt("最近有什么新闻");
  h.respond({ mode: "grounded", answer_kind: "evidence", route: "public_fact", public_source_ids: [liveId], sources: [{ id: liveId, label: "Current public update", publisher: "Official", url: "https://example.com/update" }] });
  await result;
  const snapshot = h.messages[1][5];
  assert.equal(snapshot.mode, "grounded");
  assert.equal(snapshot.facts_only, true);
  assert.equal(snapshot.answer_kind, "evidence");
  assert.deepEqual([...snapshot.public_source_ids], [liveId]);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.public_source_ids));
  assert.match(h.messages[1][3].fact, /LIVE-aabbccddeeff0011/);
  assert.doesNotMatch(h.messages[1][3].fact, /No stored fact selected/);
});

test("a model-generated boundary is honestly labeled as model generation", async () => {
  const h = harness();
  const result = h.context.submitPrompt("帮我写Python代码");
  h.respond({ answer_kind: "boundary", route: "unrelated_general", fallback_id: "FB-01" });
  await result;
  assert.deepEqual(h.modelStates, ["online"]);
  assert.equal(h.messages[1][4], "deepseek");
  assert.equal(h.messages[1][5].mode, "free");
  assert.equal(h.messages[1][5].model, "deepseek-test");
  assert.equal(h.messages[1][5].answer_kind, "boundary");
  assert.match(h.messages[1][3].style, /模型生成的边界答复/);
  assert.doesNotMatch(h.messages[1][3].style, /固定/);
});

test("fast responses after a mode switch begin with instant scrolling, not a cancellable smooth scroll", async () => {
  const h = harness();
  for (const mode of ["free", "grounded"]) {
    h.context.selectMode(mode);
    const turn = h.context.submitPrompt("你在想什么");
    assert.equal(h.scrollCalls.at(-1), false, "sending must not start a smooth animation before a fast reply");
    h.respond({ answer_kind: mode === "free" ? "fictional" : "insufficient" });
    await turn;
    assert.equal(h.context.followLatest, true);
  }
  assert.match(source, /if \(role === "user"\) scrollToLatest\(false\);/);
  assert.match(source, /else if \(followLatest\) scrollToLatest\(\);/, "assistant responses still respect a user reading history");
});

test("a failed request shows only a system notice and retry preserves its original mode, context and question", async () => {
  const h = harness();
  h.context.contextEnabled = true;
  h.context.conversationHistories.free.push({ role: "user", content: "先聊聊" }, { role: "assistant", content: "Earlier model answer" });
  const first = h.context.submitPrompt("喜欢猫还是喜欢狗");
  h.context.selectMode("grounded");
  h.fail();
  await first;
  assert.equal(h.messages.length, 1, "only the user message, no fake Oscar reply");
  assert.equal(h.context.conversationHistories.free.length, 2);
  assert.equal(h.context.conversationHistories.grounded.length, 0);
  const failure = h.context.retryableFailure;
  assert.equal(failure.article.className, "message system-message");
  assert.equal(failure.article.children[0].children[0].textContent, "SYSTEM");
  assert.equal(failure.request.mode, "free");
  assert.equal(failure.button.disabled, false);
  h.context.els.raceName.textContent = "Changed race";
  h.context.els.input.value = "draft of a new question";
  const retry = failure.button.listeners.click();
  assert.deepEqual(h.posts[1], h.posts[0]);
  assert.equal(failure.button.disabled, true);
  assert.match(h.context.els.modeStatus.textContent, /仍是「自由演绎」/);
  h.respond();
  await retry;
  assert.equal(h.messages.length, 2, "retry does not add a duplicate user bubble");
  assert.equal(h.messages[1][5].mode, "free");
  assert.equal(h.messages[1][5].engine, "deepseek");
  assert.equal(h.messages[1][5].prompt, "喜欢猫还是喜欢狗");
  assert.equal(h.messages[1][5].history.length, 2);
  assert.equal(h.context.els.messages.children.length, 0, "successful retry removes the stale service notice");
  assert.equal(h.context.els.input.value, "draft of a new question");
  assert.equal(h.context.conversationHistories.free.length, 4);
  assert.equal(h.context.conversationHistories.grounded.length, 0);
  assert.equal(h.context.retryableFailure, null);
});

test("invalid API payloads show a service validation error, never a generated evidence-gap template", async () => {
  for (const overrides of [
    { mode: "grounded", answer_kind: "fictional" },
    { engine: "boundary", model: null },
    { engine: "fallback" },
    { mode: "free" },
    { model: "" },
    { answer_en: "  " },
    { answer_zh: { unsafe: "not a string" } },
  ]) {
    const h = harness();
    h.context.selectMode("grounded");
    const turn = h.context.submitPrompt("你在想什么");
    h.respond({ answer_kind: "insufficient", ...overrides });
    await turn;
    assert.equal(h.messages.length, 1);
    assert.equal(h.context.conversationHistories.grounded.length, 0);
    assert.equal(h.context.retryableFailure.request.mode, "grounded");
    assert.match(h.context.retryableFailure.detail.textContent, /未通过校验/);
    assert.deepEqual(h.modelStates, ["error"]);
  }
});

test("network, timeout, rate-limit and upstream failures never enter model history or expose raw errors", async () => {
  for (const error of [Object.assign(new Error("private upstream details"), { status: 429 }), Object.assign(new Error("private upstream details"), { status: 503 }), Object.assign(new Error("private upstream details"), { status: 504 }), new TypeError("private network details"), Object.assign(new Error("private timeout details"), { name: "AbortError" })]) {
    const h = harness();
    h.context.fetch = async () => { throw error; };
    await h.context.submitPrompt("你好");
    assert.equal(h.messages.length, 1);
    assert.equal(h.context.conversationHistories.free.length, 0);
    assert.equal(h.context.isGenerating, false);
    assert.equal(h.context.activeRequest, null);
    assert.equal(h.context.retryableFailure.button.disabled, false);
    assert.doesNotMatch(h.context.retryableFailure.detail.textContent, /private/);
    assert.equal(h.context.companionStatus.online, false);
  }
});

test("server failure codes give safe, distinct diagnostics and a validated short request ID", async () => {
  const cases = [
    [502, "COMPANION_UPSTREAM_FAILED", /接口调用未成功/],
    [502, "COMPANION_TIMEOUT", /响应超时/],
    [502, "COMPANION_INVALID_RESPONSE", /格式不完整/],
    [502, "COMPANION_VALIDATION_FAILED", /未通过回答校验/],
    [500, "COMPANION_INTERNAL_ERROR", /处理请求时出现异常/],
    [503, "COMPANION_MODEL_UNAVAILABLE", /检查服务配置/],
    [502, "COMPANION_GENERATION_FAILED", /模型服务暂时异常/],
  ];
  for (const [status, errorCode, expected] of cases) {
    const h = harness();
    const turn = h.context.submitPrompt("你觉得自己最像什么动物");
    h.fail(status, { error_code: errorCode, request_id: "84966B41-0F69-41B1-931C-8E8F3092E4D7", retryable: true, error: "private provider details", message: "private model output" });
    await turn;
    const failure = h.context.retryableFailure;
    assert.match(failure.detail.textContent, expected);
    assert.match(failure.note.textContent, /排查编号：84966b41/);
    assert.equal(failure.article.dataset.requestId, "84966b41-0f69-41b1-931c-8e8f3092e4d7");
    assert.doesNotMatch(failure.detail.textContent + failure.note.textContent, /private|8E8F3092E4D7/i);
    assert.equal(h.messages.length, 1);
    assert.equal(h.context.conversationHistories.free.length, 0);
  }
});

test("unknown codes, malformed IDs and non-JSON proxy failures never expose arbitrary server content", async () => {
  for (const payload of [
    { error_code: "<script>private</script>", request_id: "private-key", error: "private failure", retryable: "false" },
    { error_code: {}, request_id: ["84966b41-0f69-41b1-931c-8e8f3092e4d7"] },
    null,
  ]) {
    const h = harness();
    const turn = h.context.submitPrompt("你好");
    h.fail(502, payload); await turn;
    const failure = h.context.retryableFailure;
    assert.match(failure.detail.textContent, /模型服务暂时异常/);
    assert.equal(failure.article.dataset.requestId, "");
    assert.doesNotMatch(failure.note.textContent + failure.detail.textContent, /private|script|排查编号/);
    assert.equal(failure.button.disabled, false, "untrusted non-boolean retryability is ignored");
  }
  const h = harness();
  const turn = h.context.submitPrompt("你好");
  h.pending.shift()({ ok: false, status: 503, json: async () => { throw new SyntaxError("private HTML proxy response"); } });
  await turn;
  assert.match(h.context.retryableFailure.detail.textContent, /模型服务暂时异常/);
  assert.doesNotMatch(h.context.retryableFailure.detail.textContent, /private|HTML/);
});

test("rate limits and local timeouts take priority over conflicting error bodies", async () => {
  for (const [status, expected] of [[429, /请求较多/], [504, /响应超时/]]) {
    const h = harness();
    const turn = h.context.submitPrompt("你好");
    h.fail(status, { error_code: "COMPANION_VALIDATION_FAILED" }); await turn;
    assert.match(h.context.retryableFailure.detail.textContent, expected);
  }
  for (const ok of [true, false]) {
    const h = harness();
    const turn = h.context.submitPrompt("你好");
    h.pending.shift()({ ok, status: ok ? 200 : 502, json: async () => { throw Object.assign(new Error("private body timeout"), { name: "AbortError" }); } });
    await turn;
    assert.match(h.context.retryableFailure.detail.textContent, /响应超时/);
    assert.doesNotMatch(h.context.retryableFailure.detail.textContent, /校验|private/);
  }
});

test("non-retryable failures remain disabled after generation ends and cannot send an identical request", async () => {
  const h = harness();
  h.context.conversationHistories.free.push({ role: "user", content: "Earlier question" }, { role: "assistant", content: "Earlier answer" });
  const turn = h.context.submitPrompt("你好");
  h.fail(503, { error_code: "COMPANION_MODEL_UNAVAILABLE", retryable: false }); await turn;
  const failure = h.context.retryableFailure;
  assert.equal(failure.button.disabled, true);
  assert.equal(failure.button.textContent, "需要维护者处理");
  assert.match(failure.note.textContent, /暂不提供原样重试/);
  await failure.button.listeners.click();
  assert.equal(h.posts.length, 1);
  assert.equal(h.context.conversationHistories.free.length, 2);
  assert.match(source, /retryableFailure\.button\.disabled = value \|\| retryableFailure\.retryable === false/);
  for (const errorCode of ["COMPANION_UPSTREAM_FAILED", "COMPANION_TIMEOUT", "COMPANION_INVALID_RESPONSE", "COMPANION_VALIDATION_FAILED", "COMPANION_INTERNAL_ERROR", "COMPANION_GENERATION_FAILED"]) {
    const copy = h.context.serviceErrorDescription({ errorCode, retryable: false });
    assert.match(copy, /需要维护者检查/);
    assert.doesNotMatch(copy, /请重试|请稍后重试|可以重试/);
  }
});

test("retry replaces the diagnostic ID while preserving the original multi-turn snapshot", async () => {
  const h = harness();
  h.context.conversationHistories.free.push({ role: "user", content: "喜欢猫还是喜欢狗" }, { role: "assistant", content: "Earlier complete bilingual answer" });
  const turn = h.context.submitPrompt("你觉得自己最像什么动物");
  h.fail(502, { error_code: "COMPANION_VALIDATION_FAILED", request_id: "11111111-1111-4111-8111-111111111111", retryable: true }); await turn;
  const failure = h.context.retryableFailure;
  h.context.selectMode("grounded");
  const retry = failure.button.listeners.click();
  assert.deepEqual(h.posts[1], h.posts[0]);
  h.fail(502, { error_code: "COMPANION_INVALID_RESPONSE", request_id: "22222222-2222-4222-8222-222222222222", retryable: true }); await retry;
  assert.equal(h.context.retryableFailure, failure);
  assert.match(failure.note.textContent, /排查编号：22222222/);
  assert.doesNotMatch(failure.note.textContent, /11111111/);
  assert.equal(h.context.els.messages.children.length, 1);
  assert.equal(h.messages.length, 1);
});

test("a repeated retry failure updates the same system notice and never duplicates the question", async () => {
  const h = harness();
  const first = h.context.submitPrompt("你好"); h.fail(429); await first;
  const failure = h.context.retryableFailure;
  assert.match(failure.detail.textContent, /请求较多/);
  const retry = failure.button.listeners.click(); h.fail(504); await retry;
  assert.equal(h.context.retryableFailure, failure);
  assert.equal(h.context.els.messages.children.length, 1);
  assert.equal(h.messages.length, 1);
  assert.match(failure.detail.textContent, /超时/);
  assert.equal(failure.button.disabled, false);
});

test("sending a new question expires the old retry so it cannot overwrite a newer conversational context", async () => {
  const h = harness();
  const first = h.context.submitPrompt("第一个问题"); h.fail(); await first;
  const oldFailure = h.context.retryableFailure;
  const next = h.context.submitPrompt("新的问题");
  assert.equal(oldFailure.button.disabled, true);
  assert.match(oldFailure.note.textContent, /重新发送/);
  h.respond(); await next;
  await oldFailure.button.listeners.click();
  assert.equal(h.posts.length, 2);
  assert.equal(h.context.conversationHistories.free[0].content, "新的问题");
});

test("reset cancels a pending retry and ignores its eventual response", async () => {
  const h = harness();
  const first = h.context.submitPrompt("你好"); h.fail(); await first;
  const record = h.context.retryableFailure;
  const retry = record.button.listeners.click();
  const signal = h.context.activeRequest.signal;
  h.context.resetConversation();
  assert.equal(signal.aborted, true);
  assert.equal(h.context.retryableFailure, null);
  h.respond(); await retry;
  assert.equal(h.messages.length, 1);
  assert.equal(h.context.conversationHistories.free.length, 0);
  assert.equal(h.context.els.messages.children[0], h.context.welcomeMessage);
  assert.equal(h.context.isGenerating, false);
});

test("free-mode facts and mixed fictional responses keep cited public knowledge visible", async () => {
  for (const kind of ["evidence", "fictional"]) {
    const h = harness();
    const turn = h.context.submitPrompt("喜欢什么宠物，公开说过吗");
    h.respond({ answer_kind: kind, knowledge_fact_ids: ["KF-001"], public_source_ids: ["LIVE-aabbccddeeff0011"] });
    await turn;
    assert.equal(h.messages[1][5].mode, "free");
    assert.match(h.messages[1][3].fact, /KF-001/);
    assert.match(h.messages[1][3].fact, /LIVE-aabbccddeeff0011/);
    assert.equal(h.messages[1][5].facts_only, false);
  }
});

test("retrieved context is distinguished from facts actually cited in the answer", async () => {
  const h = harness();
  const turn = h.context.submitPrompt("喜欢猫还是喜欢狗");
  h.respond({ retrieved_knowledge_fact_ids: ["KF-001", "KF-002"], retrieved_rumor_item_ids: ["RM-001"], retrieved_public_source_ids: ["LIVE-aabbccddeeff0011"], knowledge_fact_ids: [], public_source_ids: [] });
  await turn;
  const trace = h.messages[1][3];
  assert.match(trace.styleNote, /人物事实 2 项、传闻台账 1 项、公开来源 1 项/);
  assert.match(trace.styleNote, /检索到不等于回答采用/);
  assert.doesNotMatch(trace.fact, /KF-001|RM-001|LIVE-/);
  assert.equal(h.messages[1][5].knowledge_fact_ids.length, 0);
  assert.equal(h.messages[1][5].public_source_ids.length, 0);
});

test("chat assets are versioned together and no keyword response module is loaded or called", () => {
  const html = readFileSync(new URL("../../public/companion/index.html", import.meta.url), "utf8");
  assert.match(html, /data-companion-mode="free" aria-pressed="true"/);
  assert.match(html, /data-companion-mode="grounded" aria-pressed="false"/);
  assert.doesNotMatch(html, /factsOnlyToggle/);
  for (const text of [html, source]) {
    assert.doesNotMatch(text, /20260910-preferences-1|offline-response|preference-policy|makeOfflineResponse|规则兜底/);
    assert.match(text, /20260912-shared-context-1/);
  }
  assert.match(html, /styles\.css\?v=20260912-shared-context-1/);
  assert.doesNotMatch(source, /Skill v0\.4\.0/);
  assert.match(source, /package_version: response\.metadata\.package_version/);
  assert.match(html, /共享人物知识与公开资料检索/);
  assert.match(source, /不会使用预写回答代替/);
  assert.match(source, /把演绎当真实私事/);
  assert.doesNotMatch(segment("function showServiceError(", "async function submitPrompt("), /attachFeedback|createFeedbackSnapshot|conversationHistories/);
});
