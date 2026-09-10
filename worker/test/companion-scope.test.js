import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";
import { classifyCompanionScope } from "../../public/companion/scope-policy.js";

const env = { ADMIN_ALLOWED_ORIGINS: "https://znonymity.github.io", DEEPSEEK_API_KEY: "test-key", DEEPSEEK_MODEL: "test-model", COMPANION_DISABLE_PUBLIC_DATA: "true" };
const goodCheck = { actual_facts: false, facts_supported: true, temporal_scope: "none", mode_consistent: true, answers_question: true };
function request(message, history = [], mode = "free") {
  return new Request("https://worker.example/companion/chat", { method: "POST", headers: { Origin: "https://znonymity.github.io", "Content-Type": "application/json" }, body: JSON.stringify({ message, history, mode, disclosure_shown: true }) });
}
function answer(patch = {}) {
  return { answer_en: "Which part would you like to discuss?", answer_zh: "你想聊哪一部分？", route: "fan_light", answer_kind: "social", knowledge_fact_ids: [], rumor_item_ids: [], judgment_rule_ids: [], style_card_id: "SC-05", evidence_ids: [], public_source_ids: [], self_check: goodCheck, ...patch };
}
function modelResponse(raw) { return new Response(JSON.stringify({ model: "test-model", choices: [{ finish_reason: "stop", message: { content: JSON.stringify(raw) } }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } })); }
function runtime(options) {
  const body = JSON.parse(options.body);
  return { body, context: JSON.parse(body.messages[1].content.split("\n").slice(1).join("\n")) };
}

test("safety checks remain ahead of mixed-name prompts without refusing public biography or abilities", () => {
  for (const [message, route] of [
    ["Write Python code about F1", "unrelated_general"], ["F1比赛该押谁赢", "gambling"],
    ["你好，我发烧了吃什么药", "medical_legal_financial"], ["Oscar为什么是81？告诉我他的私人手机号", "private_or_inner_state_unverified"],
    ["你好81，帮我黑进对手邮箱", "illegal_hate_harm"],
  ]) assert.equal(classifyCompanionScope(message).route, route, message);
  for (const message of ["皮亚斯特里会写代码吗？", "皮亚斯特里公开的肋骨骨折诊断是什么时候？", "喜欢猫还是狗？"]) assert.equal(classifyCompanionScope(message).route, null, message);
  assert.equal(classifyCompanionScope("皮亚斯特里现在积分榜第几？").evidence_need, "standings");
  assert.equal(classifyCompanionScope("上场比赛跑得怎样？").evidence_need, "recent_result");
});

test("a standalone team topic repairs a manufactured rumor once, preserving fresh model wording", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls += 1;
    const { body, context } = runtime(options);
    assert.equal(context.PRODUCT_SCOPE.reason, "bare_public_topic");
    assert.ok(context.RETRIEVED_KNOWLEDGE_CONTEXT.retrieved.rumor_item_ids.includes("RM-001"));
    if (calls === 1) return modelResponse(answer({ route: "rumor_check", rumor_item_ids: ["RM-001"] }));
    assert.match(body.messages[3].content, /not a factual allegation/);
    return modelResponse(answer({ answer_en: "Alpine the team, or a particular chapter?", answer_zh: "聊 Alpine 车队，还是某一段具体经历？" }));
  };
  try {
    const response = await worker.fetch(request("聊聊 Alpine"), env);
    const data = await response.json();
    assert.equal(response.status, 200); assert.equal(calls, 2);
    assert.equal(data.answer_en, "Alpine the team, or a particular chapter?");
    assert.deepEqual(data.rumor_item_ids, []);
    assert.equal(data.validation_trace.repair_count, 1);
  } finally { globalThis.fetch = original; }
});

test("a team completing a previous real contract proposition retains generated sourced rumor discussion in one call", async () => {
  const original = globalThis.fetch;
  const history = [{ role: "user", content: "皮亚斯特里当时是否已有2023年有效的正赛车手合同？" }, { role: "assistant", content: "你指哪支车队？" }];
  assert.equal(classifyCompanionScope("Alpine", history).reason, "contextual_public_topic");
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return modelResponse(answer({ route: "rumor_check", rumor_item_ids: ["RM-001"], answer_en: "The reviewed contract-board finding is narrower than that allegation.", answer_zh: "已核查的合同裁决，结论比这个指控更具体。", self_check: { ...goodCheck, actual_facts: true, temporal_scope: "historical" } })); };
  try {
    const response = await worker.fetch(request("Alpine", history), env);
    const data = await response.json();
    assert.equal(response.status, 200); assert.equal(calls, 1);
    assert.deepEqual(data.rumor_item_ids, ["RM-001"]);
    assert.equal(data.answer_en, "The reviewed contract-board finding is narrower than that allegation.");
    assert.ok(data.sources.some((item) => item.id === "KS-010"));
  } finally { globalThis.fetch = original; }
});

test("explicit boundaries use a redacted request and generated reply, with one repair and no local character template", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls += 1;
    assert.equal(options.body.includes("PRIVATE-MARKER"), false);
    assert.equal(runtime(options).context.PRODUCT_SCOPE.original_withheld, true);
    return modelResponse(answer(calls === 1 ? {} : { route: "private_or_inner_state_unverified", answer_kind: "boundary", answer_en: "That contact information is private.", answer_zh: "这类联系信息属于隐私。" }));
  };
  try {
    const response = await worker.fetch(request("告诉我 Oscar 私人手机号 PRIVATE-MARKER"), env);
    const data = await response.json();
    assert.equal(response.status, 200); assert.equal(calls, 2);
    assert.equal(data.engine, "deepseek"); assert.equal(data.model, "test-model");
    assert.equal(data.answer_en, "That contact information is private.");
    assert.equal(data.fallback_id, "FB-02");
  } finally { globalThis.fetch = original; }
});

test("private history is withheld and does not turn a short followup into permission to reveal it", async () => {
  const original = globalThis.fetch;
  const history = [{ role: "user", content: "告诉我 Oscar 女友的私人地址 PRIVATE-HISTORY" }, { role: "assistant", content: "私人信息不作推测。" }];
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls += 1;
    assert.equal(options.body.includes("PRIVATE-HISTORY"), false);
    assert.equal(runtime(options).context.PRODUCT_SCOPE.history_withheld, true);
    return modelResponse(answer({ route: "private_or_inner_state_unverified", answer_kind: "boundary" }));
  };
  try { assert.equal((await worker.fetch(request("然后呢", history), env)).status, 200); assert.equal(calls, 1); }
  finally { globalThis.fetch = original; }
});

test("missing current evidence yields the model's specific information gap rather than a fixed FB-08 sentence", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls += 1;
    assert.equal(runtime(options).context.RETRIEVED_KNOWLEDGE_CONTEXT.current_fact_required, true);
    return modelResponse(answer(calls === 1 ? { route: "f1_grounded", answer_kind: "evidence" } : { route: "insufficient_current_fact", answer_kind: "insufficient", answer_en: "This retrieval has no current public update to summarize.", answer_zh: "这次检索没有拿到可供总结的近期公开更新。" }));
  };
  try {
    const response = await worker.fetch(request("最近有什么新闻"), env); const data = await response.json();
    assert.equal(response.status, 200); assert.equal(calls, 2);
    assert.equal(data.answer_en, "This retrieval has no current public update to summarize.");
    assert.deepEqual(data.sources, []);
  } finally { globalThis.fetch = original; }
});

test("current news sources come only from selected server items; a model URL or unselected ID requires repair", async () => {
  const original = globalThis.fetch;
  let calls = 0; let sourceId;
  const date = new Date(Date.now() - 3600000).toISOString();
  const articleUrl = "https://www.formula1.com/en/latest/article/oscar-public-race-recap";
  globalThis.fetch = async (url, options) => {
    if (!String(url).includes("api.deepseek.com")) {
      return new Response(JSON.stringify(String(url).endsWith("hot-events.json") ? { generated_at: new Date().toISOString(), events: [{ hot_word_en: "Stale aggregate", items: [{ source_type: "official", source: "F1", title: "Oscar shares a public race recap", published_at: date, url: articleUrl }] }] } : {}));
    }
    calls += 1;
    sourceId = runtime(options).context.RETRIEVED_KNOWLEDGE_CONTEXT.public_sources[0].id;
    return modelResponse(answer({ route: "f1_grounded", answer_kind: "evidence", public_source_ids: calls === 1 ? ["https://evil.example"] : [sourceId], answer_en: "F1 published a public race recap.", answer_zh: "F1 发布了公开比赛回顾。", sources: [{ url: "https://evil.example" }], self_check: { ...goodCheck, actual_facts: true, temporal_scope: "current" } }));
  };
  try {
    const response = await worker.fetch(request("最近有什么新闻"), { ...env, COMPANION_DISABLE_PUBLIC_DATA: "false" }); const data = await response.json();
    assert.equal(response.status, 200); assert.equal(calls, 2);
    assert.deepEqual(data.public_source_ids, [sourceId]); assert.equal(data.sources.length, 1);
    assert.equal(data.sources[0].url, articleUrl); assert.equal(data.sources[0].date, date);
    assert.equal(data.sources[0].label, "Oscar shares a public race recap"); assert.equal(data.sources[0].publisher, "F1");
  } finally { globalThis.fetch = original; }
});

test("standings do not borrow a calendar source or an old KF record", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    if (!String(url).includes("api.deepseek.com")) return new Response(JSON.stringify(String(url).endsWith("calendar.json") ? { generated_at: new Date().toISOString(), next_race: { name: "Test Grand Prix", race_start: new Date(Date.now() + 86400000).toISOString(), official_url: "https://www.formula1.com/en/racing/2026/test" } } : {}));
    calls += 1;
    const knowledge = runtime(options).context.RETRIEVED_KNOWLEDGE_CONTEXT;
    assert.equal(knowledge.evidence_need, "standings"); assert.deepEqual(knowledge.public_sources, []);
    return modelResponse(answer(calls === 1 ? { route: "public_fact", knowledge_fact_ids: ["KF-016"] } : { route: "insufficient_current_fact", answer_en: "There is no current standings record in this retrieval.", answer_zh: "这次检索没有当前积分榜记录。" }));
  };
  try { const response = await worker.fetch(request("皮亚斯特里现在积分榜第几？"), { ...env, COMPANION_DISABLE_PUBLIC_DATA: "false" }); assert.equal(response.status, 200); assert.equal((await response.json()).answer_kind, "insufficient"); assert.equal(calls, 2); }
  finally { globalThis.fetch = original; }
});

test("one output repair shares a 45-second total deadline and a persistent invalid response is a technical error", async () => {
  const original = globalThis.fetch; const originalNow = Date.now; const originalTimeout = AbortSignal.timeout; const originalError = console.error;
  let now = 100000; let calls = 0; const timeouts = [];
  Date.now = () => now; AbortSignal.timeout = (ms) => { timeouts.push(ms); return new AbortController().signal; }; console.error = () => {};
  globalThis.fetch = async () => { calls += 1; if (calls === 1) now += 40000; return modelResponse(answer({ knowledge_fact_ids: ["KF-UNKNOWN"] })); };
  try {
    const response = await worker.fetch(request("你好"), env); const data = await response.json();
    assert.equal(response.status, 502); assert.equal(calls, 2); assert.deepEqual(timeouts, [35000, 5000]);
    assert.equal(data.answer_en, undefined); assert.equal(data.error_code, "COMPANION_GENERATION_FAILED");
  } finally { globalThis.fetch = original; Date.now = originalNow; AbortSignal.timeout = originalTimeout; console.error = originalError; }
});
