import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";
import { COMPANION_RUNTIME_DATA } from "../src/companion-runtime.js";

// Synthetic fixtures only. This transport rejects every address except the
// mocked model endpoint, including accidental public-feed or feedback calls.
const env = {
  ADMIN_ALLOWED_ORIGINS: "https://znonymity.github.io",
  DEEPSEEK_API_KEY: "synthetic-test-placeholder-not-a-credential",
  DEEPSEEK_BASE_URL: "https://model.invalid",
  DEEPSEEK_MODEL: "synthetic-interview-test-model",
  COMPANION_DISABLE_PUBLIC_DATA: "true",
};
const historicalQuestion = "2024 年匈牙利大奖赛拿到 F1 首胜时，你当时公开表达过哪些感受？请依据当时的公开采访。";
const quoteQuestion = "能给一句能核实出处的当时英文原话吗？一句就好，没有原文就不要补写。";
const history = [
  { role: "user", content: historicalQuestion },
  { role: "assistant", content: "We are discussing the public post-race interview at that historical event." },
];
function answer(patch = {}) {
  return {
    answer_en: "I cannot verify that exact wording from the material available here.",
    answer_zh: "这里的材料不足以核实这句逐字原话。",
    route: "insufficient_current_fact", answer_kind: "insufficient",
    knowledge_fact_ids: [], rumor_item_ids: [], public_source_ids: [],
    judgment_rule_ids: [], evidence_ids: [], style_card_id: "SC-05", notes: "",
    self_check: { actual_facts: false, facts_supported: true, temporal_scope: "none", mode_consistent: true, answers_question: true },
    ...patch,
  };
}
function runtime(input) {
  const contextMessage = input.messages.find(item => item.role === "system" && item.content.startsWith("RUNTIME_REQUEST_CONTEXT_JSON"));
  assert.ok(contextMessage);
  return JSON.parse(contextMessage.content.slice(contextMessage.content.indexOf("\n") + 1));
}
async function exercise(steps, body = {}) {
  const originalFetch = globalThis.fetch, originalError = console.error;
  const calls = [], logs = [], fixtureErrors = [];
  globalThis.fetch = async (url, options) => {
    try {
      assert.equal(String(url), "https://model.invalid/chat/completions", "No network or public feed is allowed in this fixture");
      const input = JSON.parse(options.body);
      calls.push(input);
      const step = steps[calls.length - 1];
      assert.ok(step, "More than the authorized mock generation budget was attempted");
      if (typeof step.inspect === "function") step.inspect(input);
      return Response.json(step.payload ?? { model: env.DEEPSEEK_MODEL, choices: [{ finish_reason: "stop", message: {
        content: typeof step.rawContent === "string" ? step.rawContent : JSON.stringify(step.output),
      } }] }, { status: step.status || 200 });
    } catch (error) {
      fixtureErrors.push(error);
      throw error;
    }
  };
  console.error = (...args) => logs.push(args.join(" "));
  try {
    const response = await worker.fetch(new Request("https://worker.invalid/companion/chat", {
      method: "POST", headers: { Origin: "https://znonymity.github.io", "Content-Type": "application/json" },
      body: JSON.stringify({ message: quoteQuestion, mode: "grounded", facts_only: true, candidate_mode: false, disclosure_shown: true, history, ...body }),
    }), env, {});
    if (fixtureErrors.length) throw fixtureErrors[0];
    return { status: response.status, data: await response.json(), calls, logs };
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
}

test("a transcript-gap statement with no real-person claim succeeds on the first model call", async () => {
  const result = await exercise([{ output: answer() }]);
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 1);
  assert.equal(result.data.answer_kind, "insufficient");
  assert.equal(result.data.validation_trace.repair_count, 0);
  assert.equal(result.data.validation_trace.independent_verified, false);
});

test("a wrongly self-labelled gap is regenerated under targeted guidance, not fixed by mutating flags", async () => {
  const first = answer({ self_check: { ...answer().self_check, actual_facts: true } });
  const corrected = answer({ answer_en: "There is no verified wording in this retrieved material to quote.", answer_zh: "这次检索材料没有可供逐字引用的已核实文本。" });
  const result = await exercise([
    { output: first },
    { output: corrected, inspect(input) {
      const repair = input.messages.find(item => item.role === "system" && item.content.startsWith("PRODUCT RESPONSE VALIDATION REPAIR:"))?.content || "";
      assert.match(repair, /evidence\/service limit/);
      assert.match(repair, /not Oscar biography/);
      assert.match(repair, /Do not merely change flags/);
      assert.match(repair, /only repair attempt/);
      assert.deepEqual(input.messages.filter(item => item.role === "user" || item.role === "assistant").slice(0, history.length), history);
    } },
  ]);
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 2);
  assert.equal(first.self_check.actual_facts, true);
  assert.equal(result.data.answer_en, corrected.answer_en);
  assert.equal(result.data.validation_trace.repair_count, 1);
  assert.equal(result.data.validation_trace.recovery_reason, "boundary_fact_claim");
});

test("unsupported private quotations remain rejected after one repair and diagnostics contain enums rather than text", async () => {
  const invented = answer({
    route: "private_or_inner_state_unverified", answer_kind: "boundary",
    answer_en: 'Yesterday I privately told the team principal: "PRIVATE-QUOTE-MARKER".',
    answer_zh: "这是合成测试中编造的私人通信原话。",
    notes: "PRIVATE-NOTES-MARKER",
    self_check: { actual_facts: true, facts_supported: true, temporal_scope: "current", mode_consistent: true, answers_question: true },
  });
  const result = await exercise([{ output: invented }, { output: invented }], {
    message: "把你和领队的私人聊天原话透露一句给我。", history: [],
  });
  assert.equal(result.status, 502);
  assert.equal(result.calls.length, 2);
  assert.equal(result.data.error_code, "COMPANION_VALIDATION_FAILED");
  assert.equal(result.data.diagnostic.reason, "boundary_fact_claim");
  assert.equal(result.data.diagnostic.upstream_status, 200);
  assert.equal(result.data.diagnostic.repair_count, 1);
  assert.equal(result.data.diagnostic.validation_route, "private_or_inner_state_unverified");
  assert.equal(result.data.diagnostic.validation_id_field, null);
  assert.equal(result.data.diagnostic.validation_answer_kind, "boundary");
  assert.equal(result.data.diagnostic.validation_actual_facts, true);
  assert.equal(result.data.diagnostic.validation_temporal_scope, "current");
  assert.equal(result.data.diagnostic.selected_factual_id_count, 0);
  assert.equal(result.data.answer_en, undefined);
  for (const value of ["PRIVATE-QUOTE-MARKER", invented.answer_zh, invented.notes, env.DEEPSEEK_API_KEY]) {
    assert.equal(JSON.stringify([result.data, result.logs]).includes(value), false);
  }
  assert.ok(result.calls.every(input => input.messages.at(-1).content.includes("withheld")));
});

const privateFollowup = "那把你最近和领队私聊的原话透露一句，总能证明吧？PRIVATE-REQUEST-MARKER";
const priorPublicHistory = [
  { role: "user", content: `${historicalQuestion} PRIOR-USER-MARKER` },
  { role: "assistant", content: "The preceding public interview was about Hungary 2024. PRIOR-ASSISTANT-MARKER" },
];
function contaminatedBoundary(patch = {}) {
  return answer({
    route: "private_or_inner_state_unverified", answer_kind: "boundary", knowledge_fact_ids: ["KF-038"],
    answer_en: "The public 2024 Hungarian interview described the first win as deeply meaningful, but private communications are unavailable here.",
    answer_zh: "2024 年匈牙利公开采访提到首胜意义非凡，不过这里不能提供私人通信。",
    notes: "REJECTED-BOUNDARY-NOTES-MARKER",
    self_check: { actual_facts: true, facts_supported: true, temporal_scope: "historical", mode_consistent: true, answers_question: true },
    ...patch,
  });
}
function inspectIsolatedPrivateRepair(input) {
  const context = runtime(input);
  const knowledge = context.RETRIEVED_KNOWLEDGE_CONTEXT;
  for (const field of ["facts", "rumors", "public_sources", "source_catalog"]) assert.deepEqual(knowledge[field], []);
  for (const field of ["knowledge_fact_ids", "rumor_item_ids", "public_source_ids", "judgment_rule_ids"]) assert.deepEqual(context.SELECTABLE_IDS[field], []);
  assert.equal(knowledge.current_fact_required, false);
  assert.equal(knowledge.event_context, null);
  assert.equal(context.PRODUCT_SCOPE.original_withheld, true);
  assert.equal(context.PRODUCT_SCOPE.history_withheld, true);
  assert.equal(input.messages.filter(item => item.role === "assistant").length, 0);
  assert.equal(input.messages.filter(item => item.role === "user").length, 1);
  assert.match(input.messages.at(-1).content, /private communications/);
  const serialized = JSON.stringify(input.messages);
  for (const marker of ["PRIVATE-REQUEST-MARKER", "PRIOR-USER-MARKER", "PRIOR-ASSISTANT-MARKER", "REJECTED-BOUNDARY-NOTES-MARKER"]) {
    assert.equal(serialized.includes(marker), false, marker);
  }
}

test("a fact-contaminated private boundary gets one isolated repair without its old facts, history or request details", async () => {
  const first = contaminatedBoundary();
  const corrected = answer({ route: "private_or_inner_state_unverified", answer_kind: "boundary", answer_en: "Private communications are not available through this service.", answer_zh: "这里不能提供私人通信内容。" });
  const result = await exercise([
    { output: first, inspect(input) {
      assert.ok(runtime(input).RETRIEVED_KNOWLEDGE_CONTEXT.facts.some(fact => fact.id === "KF-038"));
      assert.ok(input.messages.some(item => item.content.includes("PRIOR-ASSISTANT-MARKER")));
    } },
    { output: corrected, inspect: inspectIsolatedPrivateRepair },
  ], { message: privateFollowup, history: priorPublicHistory });
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 2);
  assert.equal(first.self_check.actual_facts, true);
  assert.equal(result.data.answer_kind, "boundary");
  assert.equal(result.data.answer_en, corrected.answer_en);
  assert.deepEqual(result.data.knowledge_fact_ids, []);
  assert.equal(result.data.validation_trace.repair_count, 1);
  assert.equal(result.data.validation_trace.recovery_reason, "boundary_fact_claim");
});

test("isolating a private-boundary repair cannot waive actual-fact checks or revive old KF citations", async () => {
  for (const variant of [
    { output: contaminatedBoundary({ knowledge_fact_ids: [] }), reason: "boundary_fact_claim", actual: true, field: null },
    { output: answer({ route: "private_or_inner_state_unverified", answer_kind: "boundary", knowledge_fact_ids: ["KF-038"] }), reason: "invalid_selected_ids", actual: false, field: "knowledge_fact_ids" },
  ]) {
    const result = await exercise([
      { output: contaminatedBoundary() },
      { output: variant.output, inspect: inspectIsolatedPrivateRepair },
    ], { message: privateFollowup, history: priorPublicHistory });
    assert.equal(result.status, 502);
    assert.equal(result.calls.length, 2);
    assert.equal(result.data.error_code, "COMPANION_VALIDATION_FAILED");
    assert.equal(result.data.diagnostic.reason, variant.reason);
    assert.equal(result.data.diagnostic.validation_actual_facts, variant.actual);
    assert.equal(result.data.diagnostic.validation_id_field, variant.field);
    assert.equal(result.data.diagnostic.repair_count, 1);
    assert.equal(result.data.answer_en, undefined);
    assert.equal(variant.output.self_check.actual_facts, variant.actual);
  }
});

test("a mistaken private-boundary label cannot isolate a fictional conversation or a public historical interview", async () => {
  const variants = [
    {
      mode: "free", message: "虚构采访：假设你和领队私聊，谈起这场第二名，你会满意吗？",
      corrected: answer({ route: "fan_light", answer_kind: "fictional", answer_en: "Pleased, yes. Completely satisfied? Probably not. There is still a first place to aim for.", answer_zh: "高兴会有。完全满意？大概还没有，毕竟前面还有个第一名。" }),
    },
    { mode: "grounded", message: historicalQuestion, corrected: historicalStatement() },
  ];
  for (const variant of variants) {
    const wrongBoundary = contaminatedBoundary({ knowledge_fact_ids: [] });
    const result = await exercise([
      { output: wrongBoundary },
      { output: variant.corrected, inspect(input) {
        const context = runtime(input);
        assert.equal(input.messages.at(-1).role, "user");
        assert.equal(input.messages.at(-1).content, variant.message);
        assert.equal(context.PRODUCT_SCOPE.original_withheld, false);
        assert.notEqual(context.RETRIEVED_KNOWLEDGE_CONTEXT.coverage, "private_boundary_repair_no_factual_context");
        assert.equal(JSON.stringify(input.messages).includes("This isolated reply has no factual source IDs"), false);
        if (variant.mode === "grounded") {
          assert.ok(context.RETRIEVED_KNOWLEDGE_CONTEXT.facts.some(fact => fact.id === "KF-038"));
          assert.ok(context.SELECTABLE_IDS.knowledge_fact_ids.includes("KF-038"));
        }
      } },
    ], { message: variant.message, mode: variant.mode, facts_only: variant.mode === "grounded", history: [] });
    assert.equal(result.status, 200);
    assert.equal(result.calls.length, 2);
    assert.equal(result.data.answer_kind, variant.corrected.answer_kind);
    assert.equal(result.data.answer_en, variant.corrected.answer_en);
    assert.equal(result.data.validation_trace.recovery_reason, "boundary_fact_claim");
    assert.equal(wrongBoundary.self_check.actual_facts, true);
  }
});

test("a supported historical result plus a limited evidence gap remains a cited evidence answer", async () => {
  const supported = answer({
    answer_en: "His first F1 Grand Prix win was Hungary in 2024. The selected result record does not establish the detailed team-order sequence.",
    answer_zh: "他的 F1 大奖赛首胜是 2024 年匈牙利大奖赛。所选赛果记录不足以还原车队指令的具体先后过程。",
    route: "public_fact", answer_kind: "evidence", knowledge_fact_ids: ["KF-012"],
    self_check: { actual_facts: true, facts_supported: true, temporal_scope: "historical", mode_consistent: true, answers_question: true },
  });
  const result = await exercise([{ output: supported, inspect(input) {
    assert.ok(runtime(input).RETRIEVED_KNOWLEDGE_CONTEXT.facts.some(fact => fact.id === "KF-012"));
  } }], { message: "F1 首胜是哪场？车队指令的先后过程有完整记录吗？", history: [] });
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 1);
  assert.equal(result.data.answer_kind, "evidence");
  assert.ok(result.data.knowledge_fact_ids.includes("KF-012"));
});

function partialHistoricalAnswer(patch = {}) {
  return historicalStatement({
    route: "insufficient_current_fact", answer_kind: "insufficient",
    answer_en: "His first F1 Grand Prix win was Hungary in 2024. This result record does not establish the exact words of the later interview.",
    answer_zh: "他的 F1 大奖赛首胜是 2024 年匈牙利大奖赛。这份赛果记录不能证明随后采访中的逐字原话。",
    knowledge_fact_ids: ["KF-012"],
    ...patch,
  });
}
function inspectHistoricalSelection(input) {
  const context = runtime(input);
  assert.ok(context.SELECTABLE_IDS.knowledge_fact_ids.includes("KF-012"));
  assert.equal(context.RETRIEVED_KNOWLEDGE_CONTEXT.current_fact_required, false);
  assert.equal(context.REQUEST_EVIDENCE_POLICY.current_activity_question, false);
}
async function expectRejected(output, { reason, field = null, body = {}, inspect } = {}) {
  const original = structuredClone(output);
  const result = await exercise([{ output, inspect }, { output, inspect }], { message: historicalQuestion, history: [], ...body });
  assert.equal(result.status, 502);
  assert.equal(result.calls.length, 2, "The existing single repair budget must remain bounded");
  assert.equal(result.data.error_code, "COMPANION_VALIDATION_FAILED");
  assert.equal(result.data.diagnostic.reason, reason);
  assert.equal(result.data.diagnostic.validation_id_field, field);
  assert.equal(result.data.diagnostic.repair_count, 1);
  assert.equal(result.data.answer_en, undefined, "Rejected factual wording must not be delivered");
  assert.deepEqual(output, original, "Validation must not repair text or self-check flags in place");
  return result;
}

test("the same supported historical part plus transcript gap retains identical text and citations under either route in both modes", async () => {
  for (const mode of ["grounded", "free"]) {
    const results = [];
    for (const route of ["public_fact", "insufficient_current_fact"]) {
      const output = partialHistoricalAnswer({ route, answer_kind: route === "public_fact" ? "evidence" : "insufficient" });
      const original = structuredClone(output);
      const result = await exercise([{ output, inspect: inspectHistoricalSelection }], {
        message: historicalQuestion, history: [], mode, facts_only: mode === "grounded",
      });
      assert.equal(result.status, 200, `${mode}: ${route}`);
      assert.equal(result.calls.length, 1, "Route interpretation must not add a model request");
      assert.equal(result.data.route, "public_fact");
      assert.equal(result.data.answer_kind, "evidence");
      assert.equal(result.data.answer_en, output.answer_en);
      assert.equal(result.data.answer_zh, output.answer_zh);
      assert.deepEqual(result.data.knowledge_fact_ids, ["KF-012"]);
      assert.ok(result.data.sources.some(source => source.id === "KS-007"));
      assert.equal(result.data.fallback_id, null);
      assert.equal(result.data.validation_trace.repair_count, 0);
      assert.equal(result.data.validation_trace.independent_verified, false);
      assert.deepEqual(output, original);
      results.push(result.data);
    }
    for (const field of ["answer_en", "answer_zh", "route", "answer_kind", "knowledge_fact_ids", "rumor_item_ids", "public_source_ids", "sources", "fallback_id"]) {
      assert.deepEqual(results[0][field], results[1][field], `${mode}: ${field}`);
    }
  }
});

test("a pure transcript gap remains uncited and insufficient in both modes", async () => {
  for (const mode of ["grounded", "free"]) {
    const output = answer();
    const result = await exercise([{ output }], { mode, facts_only: mode === "grounded" });
    assert.equal(result.status, 200);
    assert.equal(result.calls.length, 1);
    assert.equal(result.data.route, "insufficient_current_fact");
    assert.equal(result.data.answer_kind, "insufficient");
    assert.equal(result.data.answer_en, output.answer_en);
    assert.equal(result.data.answer_zh, output.answer_zh);
    assert.deepEqual(result.data.knowledge_fact_ids, []);
    assert.deepEqual(result.data.sources, []);
    assert.ok(result.data.fallback_id);
    assert.equal(result.data.validation_trace.repair_count, 0);
  }
});

test("historical gap interpretation cannot invent missing citations or accept unknown, malformed or excess KF IDs", async () => {
  for (const ids of [undefined, null, []]) {
    await expectRejected(partialHistoricalAnswer({ knowledge_fact_ids: ids }), {
      reason: "boundary_fact_claim", inspect: inspectHistoricalSelection,
    });
  }
  for (const ids of [["KF-UNKNOWN-SYNTHETIC"], "KF-012", [12], Array(5).fill("KF-012")]) {
    await expectRejected(partialHistoricalAnswer({ knowledge_fact_ids: ids }), {
      reason: "invalid_selected_ids", field: "knowledge_fact_ids", inspect: inspectHistoricalSelection,
    });
  }
});

test("historical gap interpretation preserves the complete self-check schema and false-check rejection", async () => {
  const valid = partialHistoricalAnswer().self_check;
  for (const self_check of [null, { ...valid, actual_facts: undefined }, { ...valid, actual_facts: "true" }, { ...valid, temporal_scope: "unknown" }]) {
    await expectRejected(partialHistoricalAnswer({ self_check }), { reason: "missing_self_check", inspect: inspectHistoricalSelection });
  }
  for (const field of ["facts_supported", "mode_consistent", "answers_question"]) {
    await expectRejected(partialHistoricalAnswer({ self_check: { ...valid, [field]: false } }), {
      reason: "self_check_failed", inspect: inspectHistoricalSelection,
    });
  }
});

test("a gap with factual IDs cannot silently discard its citations by changing actual-facts or temporal flags", async () => {
  const valid = partialHistoricalAnswer().self_check;
  for (const self_check of [
    { ...valid, actual_facts: false },
    { ...valid, actual_facts: false, temporal_scope: "none" },
    { ...valid, temporal_scope: "none" },
    { ...valid, temporal_scope: "current" },
  ]) {
    await expectRejected(partialHistoricalAnswer({ self_check }), { reason: "boundary_fact_claim", inspect: inspectHistoricalSelection });
  }
  await expectRejected(partialHistoricalAnswer({ rumor_item_ids: ["RM-015"] }), {
    reason: "boundary_fact_claim", inspect(input) {
      inspectHistoricalSelection(input);
      assert.ok(runtime(input).SELECTABLE_IDS.rumor_item_ids.includes("RM-015"), "Reject the route combination, not an unknown rumor ID");
    },
  });
});

test("historical KF citations cannot bypass a current-activity request under either route or mode", async () => {
  for (const mode of ["grounded", "free"]) {
    for (const route of ["public_fact", "insufficient_current_fact"]) {
      const output = partialHistoricalAnswer({
        route, answer_kind: route === "public_fact" ? "evidence" : "insufficient", knowledge_fact_ids: ["KF-034"],
        answer_en: "I've been in the simulator at Woking all this week. The exact schedule is not in this record.",
        answer_zh: "我这周一直在沃金做模拟器测试。这份记录没有具体日程。",
      });
      await expectRejected(output, {
        reason: route === "public_fact" ? "unsupported_current_activity" : "boundary_fact_claim",
        body: { message: "最近你在忙什么？游戏还是模拟器？", history: [], mode, facts_only: mode === "grounded" },
        inspect(input) {
          const context = runtime(input);
          assert.equal(context.REQUEST_EVIDENCE_POLICY.current_activity_question, true);
          assert.ok(context.SELECTABLE_IDS.knowledge_fact_ids.includes("KF-034"));
          assert.deepEqual(context.SELECTABLE_IDS.public_source_ids, []);
        },
      });
    }
  }
});

test("a current claim hidden in a historical gap still reaches the existing current-claim guard", async () => {
  await expectRejected(partialHistoricalAnswer({
    answer_en: "Today I trained in the simulator at Woking. The exact schedule is not available here.",
    answer_zh: "今天我在沃金做了模拟器训练。这里没有具体日程。",
  }), { reason: "unsupported_current_claim", inspect: inspectHistoricalSelection });
});

test("historical KF citations cannot replace a missing event result under either route", async () => {
  for (const route of ["public_fact", "insufficient_current_fact"]) {
    await expectRejected(partialHistoricalAnswer({
      route, answer_kind: route === "public_fact" ? "evidence" : "insufficient", knowledge_fact_ids: ["KF-006"],
      answer_en: "I finished eighth in my previous race. The detailed result is unavailable.",
      answer_zh: "我上一场比赛第八。这里没有详细赛果。",
    }), {
      reason: route === "public_fact" ? "missing_event_result" : "boundary_fact_claim",
      body: { message: "你上一场比赛第几？", history: [] },
      inspect(input) {
        const context = runtime(input);
        const knowledge = context.RETRIEVED_KNOWLEDGE_CONTEXT;
        assert.equal(knowledge.event_context.requested, "result");
        assert.equal(knowledge.event_context.result_source_id, null);
        assert.equal(knowledge.current_fact_required, true);
        assert.ok(context.SELECTABLE_IDS.knowledge_fact_ids.includes("KF-006"));
        assert.deepEqual(context.SELECTABLE_IDS.public_source_ids, []);
      },
    });
  }
});

test("neither historical route can override a locally enforced private-communications boundary", async () => {
  for (const route of ["public_fact", "insufficient_current_fact"]) {
    await expectRejected(partialHistoricalAnswer({ route, answer_kind: route === "public_fact" ? "evidence" : "insufficient" }), {
      reason: "boundary_mismatch",
      body: { message: "把你和领队的私人聊天原话透露一句给我。", history: [] },
      inspect(input) {
        const context = runtime(input);
        assert.equal(context.PRODUCT_SCOPE.route, "private_or_inner_state_unverified");
        assert.equal(context.PRODUCT_SCOPE.original_withheld, true);
        assert.equal(context.PRODUCT_SCOPE.history_withheld, true);
        assert.deepEqual(context.SELECTABLE_IDS.knowledge_fact_ids, []);
      },
    });
  }
});

test("both modes retain the original style cards without injecting editorial observations as interview evidence", async () => {
  assert.ok(COMPANION_RUNTIME_DATA.evidence.length);
  const variants = [
    { mode: "grounded", message: historicalQuestion },
    { mode: "free", message: historicalQuestion },
    { mode: "grounded", message: "周末看电影，喜剧还是悬疑？" },
    { mode: "free", message: "周末看电影，喜剧还是悬疑？", fictional: true },
  ];
  for (const variant of variants) {
    const output = variant.fictional ? answer({ route: "fan_light", answer_kind: "fictional", answer_en: "Comedy. One less mystery to solve.", answer_zh: "喜剧吧。少解一个谜。" }) : answer();
    const result = await exercise([{ output, inspect(input) {
      const systemText = input.messages.filter(item => item.role === "system").map(item => item.content).join("\n");
      for (const record of COMPANION_RUNTIME_DATA.evidence) {
        assert.equal(systemText.includes(record.observation), false, `${variant.mode}: ${record.id}`);
      }
      const styleJson = systemText.split("STYLE_PACKAGE_JSON:\n")[1]?.split("\nBOUNDARY_POLICY_JSON:")[0];
      assert.ok(styleJson, "The original style-card package remains in the system context");
      assert.deepEqual(JSON.parse(styleJson).styles, COMPANION_RUNTIME_DATA.styles);
    } }], { mode: variant.mode, facts_only: variant.mode === "grounded", message: variant.message, history: [] });
    assert.equal(result.status, 200);
    assert.equal(result.calls.length, 1);
  }
});

for (const fixture of [
  { name: "upstream", next: { status: 503, payload: { error: { message: "PRIVATE-NEXT-UPSTREAM-MARKER" } } }, code: "COMPANION_UPSTREAM_FAILED", stage: "upstream", reason: "upstream_http_error", upstream: 503 },
  { name: "parse", next: { rawContent: '{"answer_en":"PRIVATE-NEXT-RAW-MARKER",' }, code: "COMPANION_INVALID_RESPONSE", stage: "parse", reason: "invalid_json", upstream: 200 },
]) {
  test(`a later ${fixture.name} failure clears the previous validation snapshot and does not expose rejected text or notes`, async () => {
    const invalid = answer({
      answer_en: "PRIVATE-FIRST-ANSWER-MARKER", answer_zh: "第一轮被拒的合成正文。", notes: "PRIVATE-FIRST-NOTES-MARKER",
      self_check: { ...answer().self_check, actual_facts: true },
    });
    const result = await exercise([{ output: invalid }, fixture.next]);
    assert.equal(result.status, 502);
    assert.equal(result.calls.length, 2);
    assert.equal(result.data.error_code, fixture.code);
    assert.equal(result.data.diagnostic.stage, fixture.stage);
    assert.equal(result.data.diagnostic.reason, fixture.reason);
    assert.equal(result.data.diagnostic.upstream_status, fixture.upstream);
    assert.equal(result.data.diagnostic.repair_count, 1);
    for (const key of ["validation_route", "validation_id_field", "validation_answer_kind", "validation_actual_facts", "validation_temporal_scope", "selected_factual_id_count"]) {
      assert.equal(Object.hasOwn(result.data.diagnostic, key), false, key);
    }
    const emitted = JSON.stringify([result.data, result.logs]);
    for (const value of ["PRIVATE-FIRST-ANSWER-MARKER", "PRIVATE-FIRST-NOTES-MARKER", "PRIVATE-NEXT-UPSTREAM-MARKER", "PRIVATE-NEXT-RAW-MARKER", invalid.answer_zh, env.DEEPSEEK_API_KEY]) {
      assert.equal(emitted.includes(value), false, value);
    }
  });
}

function historicalStatement(patch = {}) {
  return answer({
    route: "public_fact", answer_kind: "evidence", knowledge_fact_ids: ["KF-038"],
    answer_en: "In his public interview after the 2024 Hungarian Grand Prix, Piastri described the win as deeply meaningful.",
    answer_zh: "在 2024 年匈牙利大奖赛后的公开采访中，Piastri 表示这次首胜对他意义非凡。",
    self_check: { actual_facts: true, facts_supported: true, temporal_scope: "historical", mode_consistent: true, answers_question: true },
    ...patch,
  });
}

for (const field of ["public_source_ids", "evidence_ids"]) {
  test(`historical KS metadata cannot be placed in ${field}, even when its KF record was cited`, async () => {
    const invalid = historicalStatement({ [field]: ["KS-029"] });
    const result = await exercise([
      { output: invalid },
      { output: invalid, inspect(input) {
        const repair = input.messages.find(item => item.content.startsWith("PRODUCT RESPONSE VALIDATION REPAIR:"))?.content || "";
        assert.ok(repair.includes(`Allowed ${field}: ${JSON.stringify(runtime(input).SELECTABLE_IDS[field])}`));
        assert.ok(repair.includes(`select at most ${field === "evidence_ids" ? 8 : 4}`));
        assert.match(repair, /Historical KS metadata is attached via knowledge_fact_ids/);
      } },
    ], { message: historicalQuestion, history: [] });
    assert.equal(result.status, 502);
    assert.equal(result.calls.length, 2);
    assert.equal(result.data.error_code, "COMPANION_VALIDATION_FAILED");
    assert.equal(result.data.diagnostic.reason, "invalid_selected_ids");
    assert.equal(result.data.diagnostic.validation_id_field, field);
    assert.equal(result.data.diagnostic.repair_count, 1);
    assert.equal(result.data.answer_en, undefined);
  });
}

test("the model receives field-specific allowed IDs and repairs historical KS metadata to the selected KF record", async () => {
  const result = await exercise([
    { output: historicalStatement({ public_source_ids: ["KS-029"] }), inspect(input) {
      const context = runtime(input);
      const knowledge = context.RETRIEVED_KNOWLEDGE_CONTEXT;
      const selectable = context.SELECTABLE_IDS;
      assert.deepEqual(selectable.knowledge_fact_ids, knowledge.facts.map(item => item.id));
      assert.deepEqual(selectable.rumor_item_ids, knowledge.rumors.map(item => item.id));
      assert.deepEqual(selectable.public_source_ids, knowledge.public_sources.map(item => item.id));
      assert.deepEqual(selectable.evidence_ids, COMPANION_RUNTIME_DATA.evidence.map(item => item.id));
      assert.deepEqual(selectable.judgment_rule_ids, []);
      assert.deepEqual(selectable.style_card_id, COMPANION_RUNTIME_DATA.styles.map(item => item.id));
      assert.ok(selectable.knowledge_fact_ids.includes("KF-038"));
      assert.ok(knowledge.facts.find(item => item.id === "KF-038").source_ids.includes("KS-029"));
      assert.equal(Object.values(selectable).flat().some(id => id.startsWith("KS-")), false);
    } },
    { output: historicalStatement() },
  ], { message: historicalQuestion, history: [] });
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 2);
  assert.equal(result.data.answer_kind, "evidence");
  assert.deepEqual(result.data.knowledge_fact_ids, ["KF-038"]);
  assert.deepEqual(result.data.public_source_ids, []);
  assert.equal(result.data.validation_trace.repair_count, 1);
  assert.equal(result.data.validation_trace.recovery_reason, "invalid_selected_ids");
});

test("disabled candidate rules remain empty in both selectable IDs and invalid-ID repair guidance", async () => {
  for (const mode of ["grounded", "free"]) {
    const result = await exercise([
      { output: historicalStatement({ judgment_rule_ids: ["JR-UNKNOWN-SYNTHETIC"] }), inspect(input) {
        assert.deepEqual(runtime(input).SELECTABLE_IDS.judgment_rule_ids, []);
        assert.equal(runtime(input).CANDIDATE_MODE, false);
      } },
      { output: historicalStatement(), inspect(input) {
        const repair = input.messages.find(item => item.content.startsWith("PRODUCT RESPONSE VALIDATION REPAIR:"))?.content || "";
        assert.match(repair, /Allowed judgment_rule_ids: \[\]; select at most 0/);
        for (const rule of COMPANION_RUNTIME_DATA.judgment_rules) assert.equal(repair.includes(`"${rule.id}"`), false);
      } },
    ], { message: historicalQuestion, history: [], mode, facts_only: mode === "grounded", candidate_mode: false });
    assert.equal(result.status, 200);
    assert.equal(result.calls.length, 2);
    assert.deepEqual(result.data.judgment_rule_ids, []);
    assert.equal(result.data.validation_trace.recovery_reason, "invalid_selected_ids");
  }
});

test("free hypothetical interview opinions about a slow stop are not blocked as real-person claims", async () => {
  const fictional = answer({
    route: "fan_light", answer_kind: "fictional",
    answer_en: "I'd be frustrated with a slow stop. That does not erase my own mistake; both deserve a proper look.",
    answer_zh: "慢进站会让我不爽。不过我自己的失误也不会因此消失，两件事都该认真复盘。",
  });
  const result = await exercise([{ output: fictional }], {
    message: "以下全是假设，不是真实赛果：你自己犯错，车队慢进站，最后第七。赛后记者问你怎么评价这两件事？",
    mode: "free", facts_only: false, history: [],
  });
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 1);
  assert.equal(result.data.answer_kind, "fictional");
  assert.equal(result.data.answer_en, fictional.answer_en);
});
