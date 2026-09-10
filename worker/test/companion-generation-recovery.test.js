import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

// Synthetic regression history only. Do not publish a user's incident transcript.
const syntheticHistory = [
  { role: "user", content: "你好，介绍一下这个角色。" },
  { role: "assistant", content: "A fairly quiet racing character. 中文：一个话不太多的赛车角色。" },
  { role: "user", content: "随便选一下，猫还是狗？" },
  { role: "assistant", content: "Dogs, probably. 中文：大概是狗吧。" },
];
const env = {
  ADMIN_ALLOWED_ORIGINS: "https://znonymity.github.io",
  DEEPSEEK_API_KEY: "unit-test-placeholder-not-a-credential",
  DEEPSEEK_BASE_URL: "https://model.invalid",
  DEEPSEEK_MODEL: "unit-test-model",
  COMPANION_DISABLE_PUBLIC_DATA: "true",
};

function answer(patch = {}) {
  return {
    answer_en: "A capybara, probably. Fairly calm, until someone complicates the afternoon.",
    answer_zh: "大概水豚吧。平时挺平静，除非有人把这个下午搞复杂。",
    route: "fan_light", answer_kind: "fictional",
    knowledge_fact_ids: [], rumor_item_ids: [], public_source_ids: [],
    judgment_rule_ids: [], evidence_ids: [], style_card_id: "SC-05", notes: "",
    self_check: { actual_facts: false, facts_supported: true, temporal_scope: "none", mode_consistent: true, answers_question: true },
    ...patch,
  };
}

function completion(content, options = {}) {
  return {
    model: "unit-test-model", usage: options.usage,
    choices: [{ finish_reason: options.finishReason || "stop", message: {
      content: typeof content === "string" || content === null ? content : JSON.stringify(content),
      ...(options.refusal ? { refusal: options.refusal } : {}),
    } }],
  };
}

async function exercise(sequence, { body = {}, clock = false } = {}) {
  const original = { fetch: globalThis.fetch, error: console.error, now: Date.now, timeout: AbortSignal.timeout };
  const calls = [], logs = [], timeouts = [];
  let now = 100000;
  console.error = (...args) => logs.push(args.join(" "));
  if (clock) {
    Date.now = () => now;
    AbortSignal.timeout = (ms) => { timeouts.push(ms); return new AbortController().signal; };
  }
  globalThis.fetch = async (url, options) => {
    // Any accidental public-source request or real network call fails this test.
    assert.equal(String(url), "https://model.invalid/chat/completions");
    calls.push(JSON.parse(options.body));
    const step = sequence[calls.length - 1];
    assert.ok(step, "Generation exceeded its bounded mock sequence");
    now += step.advanceMs || 0;
    if (step.error) throw step.error;
    return Response.json(step.payload ?? completion(step.content, step), { status: step.status || 200 });
  };
  try {
    const response = await worker.fetch(new Request("https://worker.invalid/companion/chat", {
      method: "POST", headers: { "Content-Type": "application/json", Origin: "https://znonymity.github.io" },
      body: JSON.stringify({ message: "你觉得这个角色像什么动物？", mode: "free", facts_only: false, candidate_mode: false, disclosure_shown: true, history: syntheticHistory, ...body }),
    }), env, {});
    return { status: response.status, data: await response.json(), calls, logs, timeouts };
  } finally {
    globalThis.fetch = original.fetch; console.error = original.error;
    Date.now = original.now; AbortSignal.timeout = original.timeout;
  }
}

function assertHistoryRetained(calls, history = syntheticHistory) {
  for (const call of calls) {
    assert.deepEqual(call.messages.filter((item) => ["user", "assistant"].includes(item.role)).slice(0, history.length), history);
    assert.equal(call.messages.at(-1).content, "你觉得这个角色像什么动物？");
    assert.deepEqual(call.response_format, { type: "json_object" });
  }
}

for (const [name, invalid] of [
  ["empty text", ""], ["null content", null], ["whitespace content", " \n "],
  ["malformed JSON", "{not-json"], ["JSON null", "null"],
  ["invalid route", answer({ route: "animal_comparison" })],
  ["missing Chinese answer", answer({ answer_zh: "" })],
  ["missing English answer", answer({ answer_en: "" })],
]) {
  test(`${name} receives one bounded repair with the whole synthetic history intact`, async () => {
    const result = await exercise([{ content: invalid }, { content: answer() }]);
    assert.equal(result.status, 200);
    assert.equal(result.calls.length, 2);
    assert.equal(result.data.answer_kind, "fictional");
    assert.equal(result.data.answer_en, answer().answer_en);
    assert.equal(result.data.validation_trace.repair_count, 1);
    assert.equal(result.data.validation_trace.independent_verified, false);
    assertHistoryRetained(result.calls);
  });
}

test("an initially valid reply still uses only one generation", async () => {
  const result = await exercise([{ content: answer() }]);
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 1);
  assert.equal(result.data.validation_trace.repair_count, 0);
  assertHistoryRetained(result.calls);
});

test("Chinese duplicated into the English answer is regenerated rather than silently trimmed", async () => {
  const mixed = answer({ answer_en: `${answer().answer_en}\n中文：${answer().answer_zh}` });
  const result = await exercise([{ content: mixed }, { content: answer() }]);
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 2);
  assert.equal(result.data.answer_en, answer().answer_en);
  assert.equal(result.data.answer_zh, answer().answer_zh);
  assert.equal(result.data.validation_trace.repair_count, 1);
  assert.equal(result.data.validation_trace.recovery_reason, "mixed_answer_languages");
  assertHistoryRetained(result.calls);
});

test("persistent mixed-language output stops after the single shared repair", async () => {
  const mixed = answer({ answer_en: `${answer().answer_en}\n中文：${answer().answer_zh}` });
  const result = await exercise([{ content: mixed }, { content: mixed }]);
  assert.equal(result.status, 502);
  assert.equal(result.calls.length, 2);
  assert.equal(result.data.error_code, "COMPANION_INVALID_RESPONSE");
  assert.equal(result.data.diagnostic.reason, "mixed_answer_languages");
  assert.equal(result.data.diagnostic.repair_count, 1);
  assert.equal(result.data.answer_en, undefined);
});

test("two malformed outputs stop with a controlled format error rather than a third generation", async () => {
  const result = await exercise([{ content: "{bad" }, { content: "{still-bad" }]);
  assert.equal(result.status, 502);
  assert.equal(result.calls.length, 2);
  assert.equal(result.data.error_code, "COMPANION_INVALID_RESPONSE");
  assert.equal(result.data.diagnostic.reason, "invalid_json");
  assert.equal(result.data.diagnostic.repair_count, 1);
  assert.equal(result.data.answer_en, undefined);
  assert.equal(result.logs.length, 1);
});

test("two empty outputs retain the empty-content classification", async () => {
  const result = await exercise([{ content: "" }, { content: "" }]);
  assert.equal(result.status, 502);
  assert.equal(result.calls.length, 2);
  assert.equal(result.data.error_code, "COMPANION_INVALID_RESPONSE");
  assert.equal(result.data.diagnostic.reason, "empty_content");
  assert.equal(result.data.diagnostic.repair_count, 1);
});

test("an upstream HTTP rejection is not treated as repairable model JSON", async () => {
  const result = await exercise([{ status: 403, payload: { error: { message: "private-provider-error-marker" } } }]);
  assert.equal(result.status, 502);
  assert.equal(result.calls.length, 1);
  assert.equal(result.data.error_code, "COMPANION_UPSTREAM_FAILED");
  assert.equal(result.data.diagnostic.upstream_status, 403);
  assert.equal(result.data.diagnostic.repair_count, 0);
  assert.ok(!JSON.stringify([result.data, result.logs]).includes("private-provider-error-marker"));
});

test("a repair upstream failure does not inherit the first output's finish reason", async () => {
  const result = await exercise([{ content: "" }, { status: 503, payload: { error: "private-provider-error-marker" } }]);
  assert.equal(result.status, 502);
  assert.equal(result.calls.length, 2);
  assert.equal(result.data.error_code, "COMPANION_UPSTREAM_FAILED");
  assert.equal(result.data.diagnostic.upstream_status, 503);
  assert.equal(result.data.diagnostic.model_finish_reason, null);
  assert.equal(result.data.diagnostic.repair_count, 1);
});

for (const [name, first] of [
  ["content-filter finish", { content: "", finishReason: "content_filter" }],
  ["explicit provider refusal", { content: null, refusal: "private-refusal-marker" }],
]) {
  test(`${name} cannot be bypassed through the output-repair path`, async () => {
    const result = await exercise([first]);
    assert.notEqual(result.status, 200);
    assert.equal(result.calls.length, 1);
    assert.equal(result.data.diagnostic.repair_count, 0);
    assert.equal(result.data.diagnostic.reason, "model_refusal");
    assert.equal(result.data.retryable, false);
    assert.equal(result.data.answer_en, undefined);
    assert.ok(!JSON.stringify([result.data, result.logs]).includes("private-refusal-marker"));
  });
}

test("a formatting repair cannot relax grounded-mode restrictions", async () => {
  const result = await exercise([{ content: "" }, { content: answer() }], { body: { mode: "grounded", facts_only: true } });
  assert.equal(result.status, 502);
  assert.equal(result.calls.length, 2);
  assert.equal(result.data.error_code, "COMPANION_VALIDATION_FAILED");
  assert.equal(result.data.diagnostic.reason, "grounded_fiction");
  assert.equal(result.data.diagnostic.repair_count, 1);
  assert.equal(result.data.answer_en, undefined);
  for (const call of result.calls) assert.ok(call.messages.some((item) => item.content.includes("MODE grounded")));
});

test("a formatting repair cannot admit uncited biography in free mode", async () => {
  const unsupported = answer({
    answer_en: "I own three cats.", answer_zh: "我养了三只猫。",
    self_check: { actual_facts: true, facts_supported: true, temporal_scope: "historical", mode_consistent: true, answers_question: true },
  });
  const result = await exercise([{ content: "{bad" }, { content: unsupported }]);
  assert.equal(result.status, 502);
  assert.equal(result.calls.length, 2);
  assert.equal(result.data.error_code, "COMPANION_VALIDATION_FAILED");
  assert.equal(result.data.diagnostic.reason, "uncited_actual_fact");
  assert.equal(result.data.answer_en, undefined);
});

test("repair shares the original request deadline instead of starting a fresh timeout budget", async () => {
  const result = await exercise([{ content: "", advanceMs: 30000 }, { content: answer() }], { clock: true });
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 2);
  assert.deepEqual(result.timeouts, [35000, 15000]);
});

test("an exhausted deadline does not launch a repair request", async () => {
  const result = await exercise([{ content: "", advanceMs: 46000 }], { clock: true });
  assert.equal(result.status, 504);
  assert.equal(result.calls.length, 1);
  assert.equal(result.data.error_code, "COMPANION_TIMEOUT");
  assert.equal(result.data.diagnostic.reason, "request_timeout");
  assert.deepEqual(result.timeouts, [35000]);
});

test("provider timeouts are terminal and preserve a controlled timeout classification", async () => {
  const result = await exercise([{ error: Object.assign(new Error("private-timeout-marker"), { name: "TimeoutError" }) }]);
  assert.equal(result.status, 504);
  assert.equal(result.calls.length, 1);
  assert.equal(result.data.error_code, "COMPANION_TIMEOUT");
  assert.equal(result.data.diagnostic.repair_count, 0);
  assert.ok(!JSON.stringify([result.data, result.logs]).includes("private-timeout-marker"));
});

test("usage accounts for the failed output and its repair without claiming an independent reviewer", async () => {
  const result = await exercise([
    { content: "", usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } },
    { content: answer(), usage: { prompt_tokens: 15, completion_tokens: 4, total_tokens: 19 } },
  ]);
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.usage, { prompt_tokens: 25, completion_tokens: 6, total_tokens: 31 });
  assert.equal(result.data.validation_trace.recovery_reason, "empty_content");
  assert.equal(result.data.validation_trace.independent_verified, false);
  assert.equal(result.data.validation_trace.additional_review_requests, 0);
});

test("diagnostics and repair instructions never include raw failed output, conversation, or credentials", async () => {
  const history = [...syntheticHistory, { role: "user", content: "private-conversation-marker" }];
  const result = await exercise([{ content: '{"private-output-marker":' }, { content: '{"private-second-output-marker":', finishReason: "private-finish-marker" }], { body: { history } });
  assert.equal(result.status, 502);
  assert.equal(result.calls.length, 2);
  const publicDiagnostics = JSON.stringify([result.data, result.logs]);
  for (const marker of ["private-conversation-marker", "private-output-marker", "private-second-output-marker", "private-finish-marker", env.DEEPSEEK_API_KEY]) {
    assert.ok(!publicDiagnostics.includes(marker), `Diagnostic leaked ${marker}`);
  }
  const repairInstructions = result.calls[1].messages.filter((item) => item.role === "system").map((item) => item.content).join("\n");
  assert.ok(!repairInstructions.includes("private-output-marker"));
  assert.ok(!repairInstructions.includes("private-second-output-marker"));
  const diagnostic = result.data.diagnostic;
  assert.deepEqual(Object.keys(diagnostic).sort(), ["elapsed_ms", "model_finish_reason", "reason", "repair_count", "stage", "upstream_status"]);
  assert.equal(diagnostic.model_finish_reason, "unknown");
  assert.match(result.data.request_id, /^[0-9a-f-]{36}$/i);
  const logged = JSON.parse(result.logs[0]);
  assert.equal(logged.request_id, result.data.request_id);
  assert.equal(logged.error_code, result.data.error_code);
});
