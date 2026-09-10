import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { makeOfflineResponse } from "../../public/companion/offline-response.js";

// Exercise the real browser request/snapshot functions without a browser or live API.
// Keeping these functions in the script also preserves the small static-site build.
const source = readFileSync(new URL("../../public/companion/app.js", import.meta.url), "utf8");
function segment(start, end) { return source.slice(source.indexOf(start), source.indexOf(end)); }
const functions = [
  segment("function createFeedbackSnapshot(", "function attachFeedback("),
  segment("function updateModeUi(", "function resizeInput("),
  segment("function modelTrace(", "async function requestModelResponse("),
  segment("async function requestModelResponse(", "function resetConversation("),
].join("\n");

function harness() {
  const pending = [];
  const posts = [];
  const messages = [];
  const modelStates = [];
  const scrollCalls = [];
  const buttons = ["free", "grounded"].map((mode) => ({ dataset: { companionMode: mode }, setAttribute(key, value) { this[key] = value; } }));
  const context = {
    MAX_PROMPT_CHARS: 500, MAX_HISTORY_ITEMS: 8, MAX_HISTORY_CHARS: 900, APP_VERSION: "20260910-modes-1",
    MODE_LABELS: { free: "自由演绎", grounded: "强依据" },
    ANSWER_KIND_LABELS: { fictional: "角色演绎", evidence: "有来源的事实", social: "轻松聊天", boundary: "边界答复", insufficient: "依据不足" },
    ROUTE_LABELS: { fan_light: "Fan conversation", public_fact: "Public fact", unrelated_general: "Outside scope" },
    DEFAULT_TRACE: { route: "fan_light", sources: [] },
    selectedMode: "free", generatingMode: null, conversationHistories: { free: [], grounded: [] },
    requestEpoch: 0, activeRequest: null, isGenerating: false, followLatest: false, contextEnabled: false,
    companionApiUrl: "https://example.invalid", companionStatus: { online: true, model: "previous-model" },
    els: { input: { value: "" }, modeButtons: buttons, modeDescription: {}, modeStatus: {}, drawerModeSummary: {}, modelDisclosure: { dataset: { state: "ready" } } },
    document: { body: { classList: { add() {} } } },
    AbortController, setTimeout, clearTimeout, performance,
    addMessage(...args) { messages.push(args); }, containsChinese(value) { return /[\u3400-\u9fff]/.test(value); },
    resizeInput() {}, scrollToLatest(smooth = true) { scrollCalls.push(smooth); }, renderTrace() {},
    fetch(_url, options) { posts.push(JSON.parse(options.body)); return new Promise((resolve) => pending.push(resolve)); },
    makeOfflineResponse() { throw new Error("Unexpected fallback"); },
  };
  context.setGenerating = (value) => { context.isGenerating = value; context.updateModeUi(); };
  context.setModelState = (state) => { modelStates.push(state); context.els.modelDisclosure.dataset.state = state; };
  vm.createContext(context);
  vm.runInContext(functions, context);
  const respond = (overrides = {}) => pending.shift()({ ok: true, json: async () => ({
    engine: "deepseek", model: "deepseek-test", mode: posts.at(-1).mode, answer_kind: "fictional",
    answer_en: "One step at a time.", answer_zh: "一次处理一步。", route: "fan_light", style_card_id: "SC-05",
    package_version: "0.4.0", source_hash: "snapshot-hash", sources: [], public_source_ids: [], ...overrides,
  }) });
  return { context, pending, posts, messages, modelStates, scrollCalls, respond };
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

test("a server boundary keeps the chosen mode without falsely verifying a model connection", async () => {
  const h = harness();
  const previous = h.context.companionStatus;
  const result = h.context.submitPrompt("帮我写Python代码");
  h.respond({ engine: "boundary", model: null, answer_kind: "boundary", route: "unrelated_general", fallback_id: "FB-01" });
  await result;
  assert.deepEqual(h.modelStates, []);
  assert.equal(h.context.companionStatus, previous);
  assert.equal(h.messages[1][4], "boundary");
  assert.equal(h.messages[1][5].mode, "free");
  assert.equal(h.messages[1][5].model, "");
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

test("a fast offline failure still uses the sending mode after the user switches", async () => {
  const h = harness();
  h.context.makeOfflineResponse = makeOfflineResponse;
  h.context.fetch = async (_url, options) => { h.posts.push(JSON.parse(options.body)); throw new TypeError("Offline test"); };
  const first = h.context.submitPrompt("你在想什么");
  h.context.selectMode("grounded");
  await first;
  assert.equal(h.messages[1][4], "fallback");
  assert.equal(h.messages[1][5].mode, "free");
  assert.equal(h.messages[1][5].answer_kind, "fictional");
  assert.equal(h.context.conversationHistories.free.length, 2);
  assert.equal(h.context.conversationHistories.grounded.length, 0);
  const second = h.context.submitPrompt("你在想什么");
  await second;
  assert.equal(h.messages[3][5].mode, "grounded");
  assert.equal(h.messages[3][5].answer_kind, "insufficient");
  assert.deepEqual(h.posts[1].history, []);
  assert.equal(h.scrollCalls.at(-1), false);
});

test("grounded mode refuses an inconsistent fictional API payload and falls back to an evidence gap", async () => {
  const h = harness();
  h.context.makeOfflineResponse = makeOfflineResponse;
  h.context.selectMode("grounded");
  const turn = h.context.submitPrompt("你在想什么");
  h.respond({ mode: "grounded", answer_kind: "fictional" });
  await turn;
  assert.equal(h.messages[1][4], "fallback");
  assert.equal(h.messages[1][5].mode, "grounded");
  assert.equal(h.messages[1][5].answer_kind, "insufficient");
  assert.match(h.messages[1][1], /verified public source/);
});

test("HTML exposes the two modes, removes the old hidden switch and versions assets consistently", () => {
  const html = readFileSync(new URL("../../public/companion/index.html", import.meta.url), "utf8");
  const offline = readFileSync(new URL("../../public/companion/offline-response.js", import.meta.url), "utf8");
  assert.match(html, /data-companion-mode="free" aria-pressed="true"/);
  assert.match(html, /data-companion-mode="grounded" aria-pressed="false"/);
  assert.doesNotMatch(html, /factsOnlyToggle/);
  for (const text of [html, source, offline]) assert.doesNotMatch(text, /20260910-scope-2|20260908-feedback-1/);
  assert.match(html, /styles\.css\?v=20260910-modes-1/);
  assert.match(source, /把演绎当真实私事/);
});
