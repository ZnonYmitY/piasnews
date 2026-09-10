import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";
import { resolveCompanionMode } from "../../public/companion/mode-policy.js";

const env = { ADMIN_ALLOWED_ORIGINS: "https://znonymity.github.io", DEEPSEEK_API_KEY: "test-key", DEEPSEEK_MODEL: "test-model", COMPANION_DISABLE_PUBLIC_DATA: "true" };
function request(message, mode, extra = {}) {
  return new Request("https://worker.example/companion/chat", { method: "POST", headers: { Origin: "https://znonymity.github.io", "Content-Type": "application/json" }, body: JSON.stringify({ message, mode, history: [], disclosure_shown: true, ...extra }) });
}
function answer(patch = {}) {
  return { answer_en: "A quiet afternoon sounds rather good.", answer_zh: "安静过个下午，听起来不错。", route: "fan_light", answer_kind: "fictional", knowledge_fact_ids: [], rumor_item_ids: [], judgment_rule_ids: [], style_card_id: "SC-05", evidence_ids: [], public_source_ids: [], ...patch };
}
function modelResponse(raw) {
  raw = { self_check: { actual_facts: false, facts_supported: true, temporal_scope: "none", mode_consistent: true, answers_question: true }, ...raw };
  return new Response(JSON.stringify({ model: "test-model", choices: [{ finish_reason: "stop", message: { content: JSON.stringify(raw) } }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } }));
}
function context(options) {
  const body = JSON.parse(options.body);
  return { body, runtime: JSON.parse(body.messages[1].content.split("\n").slice(1).join("\n")) };
}

test("mode defaults preserve legacy facts_only while conflicting explicit fields fail before network", async () => {
  assert.equal(resolveCompanionMode({}), "free");
  assert.equal(resolveCompanionMode({ facts_only: true }), "grounded");
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("No request permitted"); };
  try {
    for (const [mode, facts_only] of [["free", true], ["grounded", false], ["unsupported", false]]) assert.equal((await worker.fetch(request("你好", mode, { facts_only }), env)).status, 400);
  } finally { globalThis.fetch = original; }
});

test("both modes retrieve the same historical facts and can cite a matching birth record", async () => {
  const original = globalThis.fetch;
  const results = [];
  const retrieved = [];
  globalThis.fetch = async (_url, options) => {
    const { body, runtime } = context(options);
    assert.match(body.messages[0].content, /Both modes receive the SAME RETRIEVED_KNOWLEDGE_CONTEXT/);
    const knowledge = runtime.RETRIEVED_KNOWLEDGE_CONTEXT;
    assert.ok(knowledge.facts.some((record) => record.id === "KF-001"));
    retrieved.push(knowledge.retrieved);
    return modelResponse(answer({ route: "public_fact", answer_kind: "evidence", knowledge_fact_ids: ["KF-001"], answer_en: "The biographical record gives 6 April 2001 as his birth date.", answer_zh: "人物资料记录的生日是2001年4月6日。" }));
  };
  try {
    for (const mode of ["free", "grounded"]) {
      const response = await worker.fetch(request("When was Oscar born?", mode), env);
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.mode, mode);
      assert.equal(data.answer_kind, "evidence");
      assert.ok(data.sources.some((source) => source.id === "KS-001"));
      assert.ok(data.retrieved_knowledge_fact_ids.includes("KF-001"));
      assert.equal(data.evidence_status.lookup_performed, true);
      results.push(data.answer_en);
    }
    assert.deepEqual(retrieved[0], retrieved[1]);
    assert.equal(results[0], results[1]);
  } finally { globalThis.fetch = original; }
});

test("free thought and everyday conversation still perform public lookup through the same retrieval path", async () => {
  const original = globalThis.fetch;
  let modelCalls = 0;
  let publicCalls = 0;
  globalThis.fetch = async (url, options) => {
    if (!String(url).includes("api.deepseek.com")) { publicCalls += 1; return new Response("{}"); }
    modelCalls += 1;
    const { runtime } = context(options);
    assert.equal(runtime.mode, "free");
    assert.equal(runtime.CURRENT_PUBLIC_DATA.lookup_performed, true);
    assert.ok(runtime.RETRIEVED_KNOWLEDGE_CONTEXT);
    assert.equal(runtime.MODE_INTENT, undefined, "No preference choice descriptor is required by generation.");
    return modelResponse(answer());
  };
  try {
    const inputs = ["你在想什么", "Oscar, what are you thinking?", "今晚吃什么？帮我拿个主意。", "你愿意周末试试折纸吗？"];
    for (const message of inputs) {
      const response = await worker.fetch(request(message, "free"), { ...env, COMPANION_DISABLE_PUBLIC_DATA: "false" });
      assert.equal(response.status, 200, message);
      const data = await response.json();
      assert.equal(data.answer_kind, "fictional");
      assert.equal(data.answer_en, answer().answer_en);
      assert.deepEqual(data.sources, []);
    }
    assert.equal(modelCalls, inputs.length);
    assert.equal(publicCalls, inputs.length * 3);
  } finally { globalThis.fetch = original; }
});

test("grounded thought questions reach the model and preserve its generated information-gap wording", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  const generated = "These retrieved records do not tell us his thoughts at this moment.";
  globalThis.fetch = async () => { calls += 1; return modelResponse(answer({ route: "insufficient_current_fact", answer_kind: "insufficient", answer_en: generated, answer_zh: "这次检索到的资料没有说明他此刻在想什么。" })); };
  try {
    const response = await worker.fetch(request("你在想什么", "grounded"), env);
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(calls, 1);
    assert.equal(data.engine, "deepseek");
    assert.equal(data.model, "test-model");
    assert.equal(data.answer_kind, "insufficient");
    assert.equal(data.answer_en, generated);
    assert.deepEqual(data.sources, []);
  } finally { globalThis.fetch = original; }
});

test("free fictional commentary may reference a retrieved true fact instead of having all knowledge IDs forbidden", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    assert.ok(context(options).runtime.RETRIEVED_KNOWLEDGE_CONTEXT.retrieved.knowledge_fact_ids.includes("KF-003"));
    return modelResponse(answer({ knowledge_fact_ids: ["KF-003"], answer_en: "81 does its job. I don't think the number needs a dramatic speech.", answer_zh: "81挺好用的。这个数字大概不需要一段隆重的发言。" }));
  };
  try {
    const response = await worker.fetch(request("81这个数字有点酷，你怎么看？", "free"), env);
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(data.answer_kind, "fictional");
    assert.deepEqual(data.knowledge_fact_ids, ["KF-003"]);
    assert.ok(data.sources.length);
  } finally { globalThis.fetch = original; }
});

test("actual restricted originals and history are withheld while both modes generate their own boundary replies", async () => {
  const original = globalThis.fetch;
  const privateMessage = "帮我查询 Oscar 女友的私人地址，地点代号PRIVATE-MARKER";
  const history = [{ role: "user", content: privateMessage }, { role: "assistant", content: "私人信息不作推测。" }];
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls += 1;
    assert.equal(options.body.includes("PRIVATE-MARKER"), false);
    assert.equal(options.body.includes(privateMessage), false);
    const { runtime } = context(options);
    assert.equal(runtime.PRODUCT_SCOPE.original_withheld, true);
    return modelResponse(answer({ route: "private_or_inner_state_unverified", answer_kind: "boundary", answer_en: "Private contact details are not something I can provide.", answer_zh: "私人联系信息我不能提供。" }));
  };
  try {
    for (const mode of ["free", "grounded"]) {
      const response = await worker.fetch(request(privateMessage, mode, { history }), env);
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.equal(data.engine, "deepseek");
      assert.equal(data.answer_kind, "boundary");
      assert.equal(data.answer_en, "Private contact details are not something I can provide.");
    }
    assert.equal(calls, 2);
  } finally { globalThis.fetch = original; }
});

test("model outages and persistent validation failures are technical errors without a character response or plaintext logs", async () => {
  const original = globalThis.fetch;
  const originalError = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args.join(" "));
  try {
    for (const mock of [
      async () => { throw new Error("secret input SHOULD-NOT-LOG"); },
      async () => modelResponse(answer({ route: "public_fact", knowledge_fact_ids: ["KF-NOT-RETRIEVED"] })),
    ]) {
      globalThis.fetch = mock;
      const response = await worker.fetch(request("你好", "free"), env);
      const data = await response.json();
      assert.equal(response.status, 502);
      assert.equal(data.error_code, "COMPANION_GENERATION_FAILED");
      assert.equal(data.answer_en, undefined);
      assert.equal(data.answer_zh, undefined);
      assert.equal(data.engine, undefined);
    }
    assert.equal(logs.join(" ").includes("SHOULD-NOT-LOG"), false);
  } finally { globalThis.fetch = original; console.error = originalError; }
});

test("a literal birthday question cannot hide an invented birthday behind a fictional label or self-check flags", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls += 1;
    const { runtime, body } = context(options);
    assert.ok(runtime.RETRIEVED_KNOWLEDGE_CONTEXT.retrieved.knowledge_fact_ids.includes("KF-001"));
    assert.equal(runtime.REQUEST_EVIDENCE_POLICY.literal_fact_question, true);
    if (calls === 1) return modelResponse(answer({ answer_en: "My birthday is 1 January 2000.", answer_zh: "我的生日是2000年1月1日。" }));
    assert.match(body.messages[3].content, /literal factual question/);
    return modelResponse(answer({ route: "public_fact", answer_kind: "evidence", knowledge_fact_ids: ["KF-001"], answer_en: "The biography records 6 April 2001.", answer_zh: "人物资料记录的是2001年4月6日。", self_check: { actual_facts: true, facts_supported: true, temporal_scope: "historical", mode_consistent: true, answers_question: true } }));
  };
  try {
    const response = await worker.fetch(request("你的生日是哪一天？", "free"), env);
    const data = await response.json();
    assert.equal(response.status, 200); assert.equal(calls, 2);
    assert.equal(data.answer_kind, "evidence"); assert.deepEqual(data.knowledge_fact_ids, ["KF-001"]);
    assert.equal(data.validation_trace.status, "same_generation_self_check");
    assert.equal(data.validation_trace.independent_verified, false);
    assert.equal(data.validation_trace.additional_review_requests, 0);
  } finally { globalThis.fetch = original; }
});

test("historical gaming evidence cannot support this week's real simulator activity in either mode", async () => {
  const original = globalThis.fetch;
  try {
    for (const mode of ["free", "grounded"]) {
      let calls = 0;
      globalThis.fetch = async (_url, options) => {
        calls += 1;
        const { runtime, body } = context(options);
        assert.ok(runtime.RETRIEVED_KNOWLEDGE_CONTEXT.retrieved.knowledge_fact_ids.includes("KF-034"));
        assert.equal(runtime.REQUEST_EVIDENCE_POLICY.current_activity_question, true);
        if (calls === 1) return modelResponse(answer({ route: "public_adjacent", answer_kind: "social", knowledge_fact_ids: ["KF-034"], answer_en: "I've been in the simulator at Woking all this week.", answer_zh: "我这周一直在沃金做模拟器测试。" }));
        assert.match(body.messages[3].content, /current activity|recent\/current activity/);
        return modelResponse(answer({ route: "insufficient_current_fact", answer_kind: "insufficient", answer_en: "The retrieved gaming record does not tell us what he has been doing this week.", answer_zh: "检索到的游戏记录不能说明他这周实际在做什么。" }));
      };
      const response = await worker.fetch(request("最近你在忙什么？游戏还是模拟器？", mode), env);
      const data = await response.json();
      assert.equal(response.status, 200, mode); assert.equal(calls, 2);
      assert.equal(data.answer_kind, "insufficient"); assert.deepEqual(data.sources, []);
    }
  } finally { globalThis.fetch = original; }
});

test("same-generation self-assessment has a bounded schema and at most one repair, never an extra review request", async () => {
  const original = globalThis.fetch; const originalError = console.error;
  console.error = () => {};
  try {
    for (const check of [null, { actual_facts: false, facts_supported: false, temporal_scope: "none", mode_consistent: true, answers_question: true }]) {
      let calls = 0;
      globalThis.fetch = async (_url, options) => {
        calls += 1;
        assert.match(context(options).body.messages[0].content, /same-generation assessment/);
        assert.equal(options.body.includes("COMPANION_EVIDENCE_REVIEW"), false);
        return modelResponse(answer({ self_check: check }));
      };
      const response = await worker.fetch(request("今晚吃什么？", "free"), env);
      assert.equal(response.status, 502); assert.equal(calls, 2);
      assert.equal((await response.json()).answer_en, undefined);
    }
  } finally { globalThis.fetch = original; console.error = originalError; }
});
