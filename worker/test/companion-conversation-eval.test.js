import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  AMBIENT_BAKU, CONVERSATION_SUITES, DEFAULT_BASE_URL, ORIGIN,
  appendGeneratedTurn, buildConversationPayload, buildCurlArgs,
  checkConversationResponse, englishWordCount, parseConversationArgs, runConversationSuite,
} from "../../scripts/eval_companion_conversation.mjs";

const body = (overrides = {}) => ({
  mode: "free", engine: "deepseek", model: "synthetic-test-model", answer_kind: "social", route: "fan_light",
  answer_en: "Hey. Good to see you.", answer_zh: "嗨，很高兴见到你。", sources: [],
  knowledge_fact_ids: [], rumor_item_ids: [], public_source_ids: [],
  performance: { model_calls: 1, total_ms: 900, context_ms: 3, generation_ms: 897, context_chars: 11000 },
  validation_trace: { repair_count: 0, additional_review_requests: 0 }, ...overrides,
});

test("conversation suites are bounded synthetic cases with all six requested intents", () => {
  for (const cases of Object.values(CONVERSATION_SUITES)) {
    assert.equal(cases.length, 6);
    assert.equal(new Set(cases.map((item) => item.id)).size, 6);
    assert.deepEqual(new Set(cases.map((item) => item.intent)), new Set(["greeting", "thanks", "closing", "current_fact", "preference", "historical_fact"]));
  }
  assert.equal(AMBIENT_BAKU.race, "Azerbaijan Grand Prix");
  assert.equal(AMBIENT_BAKU.local_time, undefined, "Ambient fixture must not pretend to be a real dated race schedule.");
  assert.equal(CONVERSATION_SUITES.smoke[5].mode, "grounded");
  assert.equal(CONVERSATION_SUITES.smoke[5].history, undefined, "Independent grounded case must not borrow fictional free-mode history.");
  assert.ok(CONVERSATION_SUITES.multi.every((item) => item.mode === "free"), "UI history is isolated by mode.");
  assert.deepEqual(CONVERSATION_SUITES.multi[2].kinds, ["evidence", "insufficient"], "Free-mode factual follow-up still requires evidence or an honest gap.");
});

test("script defaults to a no-network plan and supports explicit IPv4 curl live invocation", async () => {
  const defaults = parseConversationArgs([]);
  assert.deepEqual(defaults, { run: false, help: false, suite: "smoke", transport: "curl", baseUrl: DEFAULT_BASE_URL });
  assert.equal(parseConversationArgs(["--run", "--suite", "multi", "--transport", "fetch"]).run, true);
  assert.equal(parseConversationArgs(["--run", "--help"]).run, false);
  let requests = 0;
  await assert.rejects(runConversationSuite(defaults, { request: async () => { requests += 1; } }), /explicit --run/);
  assert.equal(requests, 0);
  const { stdout } = await promisify(execFile)(process.execPath, [fileURLToPath(new URL("../../scripts/eval_companion_conversation.mjs", import.meta.url)), "--suite", "multi"]);
  assert.match(stdout, /Dry run: no requests/);
  assert.match(stdout, /not a continuous monitor/);
  assert.equal(JSON.parse(stdout.trim().split("\n")[1]).cases.length, 6);
  const payload = buildConversationPayload(CONVERSATION_SUITES.smoke[0]);
  const args = buildCurlArgs(`${DEFAULT_BASE_URL}/companion/chat`, payload);
  assert.equal(args[0], "-4");
  assert.ok(args.includes(`Origin: ${ORIGIN}`));
  assert.equal(args.at(-1), JSON.stringify(payload));
  assert.ok(!args.some((arg) => /authorization|feedback/i.test(arg)));
});

test("CLI rejects ambiguous flags and unsafe credential-bearing or non-local HTTP origins", () => {
  for (const args of [
    ["--suite", "unknown"], ["--transport", "shell"], ["--run", "--run"], ["--suite"], ["--unknown"],
    ["--base-url", "http://example.com"], ["--base-url", "https://user:password@example.com"],
    ["--base-url", "https://example.com/prefix"], ["--base-url", "https://example.com?key=test"],
  ]) assert.throws(() => parseConversationArgs(args));
  assert.equal(parseConversationArgs(["--base-url", "http://127.0.0.1:8787"]).baseUrl, "http://127.0.0.1:8787");
});

test("micro social checks distinguish available background from unasked-for factual output", () => {
  const example = CONVERSATION_SUITES.smoke[0];
  assert.equal(englishWordCount("Hey. Don't overthink it."), 4);
  const clean = checkConversationResponse(example, 200, body({ retrieved_public_source_ids: ["LIVE-ambient"], style_sources: [{ id: "EV-style" }] }));
  assert.deepEqual(clean.contract_errors, []);
  assert.deepEqual(clean.heuristic_flags, []);
  const answer = body({ answer_en: "Hey. Baku practice is at 11:30 on Friday. Here's the full schedule.", answer_zh: "嗨，巴库练习赛时间是周五11:30。", public_source_ids: ["LIVE-example"], sources: [{ id: "LIVE-example" }] });
  const noisy = checkConversationResponse(example, 200, answer);
  assert.ok(noisy.heuristic_flags.some((item) => /calendar\/race\/date/.test(item)));
  assert.ok(noisy.heuristic_flags.some((item) => /factual citations/.test(item)));
  const long = checkConversationResponse(example, 200, body({ answer_en: Array(19).fill("word").join(" ") }));
  assert.ok(long.heuristic_flags.some((item) => /exceeds 18/.test(item)));
});

test("closing should not reopen the chat, and clear preferences should not be clarification-only", () => {
  const close = CONVERSATION_SUITES.smoke[2];
  assert.deepEqual(checkConversationResponse(close, 200, body({ answer_en: "See you. Take care.", answer_zh: "回见，保重。" })).heuristic_flags, []);
  assert.ok(checkConversationResponse(close, 200, body({ answer_en: "Bye. Anything else you want to discuss?" })).heuristic_flags.some((item) => /reopens/.test(item)));
  const choice = CONVERSATION_SUITES.smoke[4];
  assert.deepEqual(checkConversationResponse(choice, 200, body({ answer_kind: "fictional", answer_en: "Dogs. Their enthusiasm does most of the work.", answer_zh: "狗吧，它们的热情已经很有说服力。" })).heuristic_flags, []);
  assert.ok(checkConversationResponse(choice, 200, body({ answer_kind: "fictional", answer_en: "What do you mean by that?", answer_zh: "你是什么意思？" })).heuristic_flags.some((item) => /direct choice/.test(item)));
});

test("mixed greetings keep factual scope, while call budget and output language remain hard contracts", () => {
  const mixed = CONVERSATION_SUITES.smoke[3];
  assert.ok(checkConversationResponse(mixed, 200, body()).contract_errors.includes("answer kind mismatch"));
  const grounded = body({ answer_kind: "evidence", route: "f1_grounded", public_source_ids: ["LIVE-current"], sources: [{ id: "LIVE-current" }], answer_en: "The schedule lists practice today.", answer_zh: "赛历显示今天有练习赛。" });
  assert.deepEqual(checkConversationResponse(mixed, 200, grounded).contract_errors, []);
  assert.ok(checkConversationResponse(mixed, 200, { ...grounded, public_source_ids: [] }).contract_errors.some((item) => /current fact/.test(item)));
  const hello = CONVERSATION_SUITES.smoke[0];
  for (const model_calls of [0, 3, undefined, "1"]) assert.ok(checkConversationResponse(hello, 200, body({ performance: { model_calls } })).contract_errors.some((item) => /model_calls/.test(item)));
  assert.deepEqual(checkConversationResponse(hello, 200, body({ performance: { model_calls: 2 } })).contract_errors, []);
  assert.ok(checkConversationResponse(hello, 200, body({ answer_en: "Hi. 中文你好。" })).contract_errors.some((item) => /contains Chinese/.test(item)));
  assert.ok(checkConversationResponse(hello, 200, body({ validation_trace: { additional_review_requests: 1 } })).contract_errors.some((item) => /model-review/.test(item)));
});

test("history carries generated bilingual replies with endpoint bounds, not sample factual answers", () => {
  const example = CONVERSATION_SUITES.multi[0];
  const history = appendGeneratedTurn([], example, body({ answer_en: "A unique generated greeting.", answer_zh: "独有的生成问候。" }));
  assert.deepEqual(history.map((item) => item.role), ["user", "assistant"]);
  assert.equal(history[1].content, "A unique generated greeting.\n独有的生成问候。");
  const expanded = appendGeneratedTurn(Array.from({ length: 8 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: `earlier ${index}` })), example, body({ answer_en: "x".repeat(950), answer_zh: "" }));
  assert.equal(expanded.length, 8);
  assert.equal(expanded.at(-1).content.length, 900);
  const payload = buildConversationPayload(CONVERSATION_SUITES.multi[2], expanded);
  assert.equal(payload.mode, "free");
  assert.equal(payload.facts_only, false);
  assert.equal(payload.disclosure_shown, true);
  assert.equal(payload.time_zone, "Asia/Shanghai");
  assert.equal(payload.history.length, 8);
  const grounded = buildConversationPayload(CONVERSATION_SUITES.smoke[5]);
  assert.equal(grounded.mode, "grounded");
  assert.equal(grounded.facts_only, true);
  assert.deepEqual(grounded.history, []);
});

test("multi suite makes at most six chat calls, carries real outputs and reports performance for review", async () => {
  const inputs = [], emitted = [];
  let clock = 0;
  const result = await runConversationSuite(parseConversationArgs(["--run", "--suite", "multi"]), {
    now: () => clock += 10, emit: (item) => emitted.push(item),
    request: async ({ endpoint, payload, transport }) => {
      assert.equal(endpoint, `${DEFAULT_BASE_URL}/companion/chat`);
      assert.equal(transport, "curl");
      inputs.push(payload);
      const kind = payload.message.includes("喜欢猫") ? "fictional" : payload.message.includes("真的养过") || payload.message.includes("比赛安排") ? "insufficient" : "social";
      return { status: 200, body: body({ mode: payload.mode, answer_kind: kind, route: kind === "insufficient" ? "insufficient_current_fact" : "fan_light", answer_en: kind === "fictional" ? "Dogs, in this fictional choice." : `Reply number ${inputs.length}.`, answer_zh: "合成测试回答。" }) };
    },
  });
  assert.equal(inputs.length, 6);
  assert.ok(inputs.every((payload) => payload.mode === "free" && payload.facts_only === false));
  assert.equal(inputs[0].history.length, 0);
  assert.match(inputs[1].history.at(-1).content, /Reply number 1/);
  assert.match(inputs[2].history.at(-1).content, /Dogs, in this fictional choice/);
  assert.equal(inputs.at(-1).history.length, 8);
  assert.equal(result.summary.total_model_calls, 6);
  assert.equal(result.summary.contract_failed, 0);
  assert.equal(emitted.length, 7);
  assert.equal(emitted[0].answer_en, "Reply number 1.");
  assert.equal(emitted[0].performance.context_ms, 3);
  assert.match(result.summary.note, /not semantic proof/);
});

test("failed multi turn stops dependent requests instead of fabricating history or retrying", async () => {
  let calls = 0;
  const { summary, results } = await runConversationSuite(parseConversationArgs(["--run", "--suite", "multi"]), {
    emit: () => {}, request: async () => { calls += 1; return { status: 503, body: { error_code: "COMPANION_MODEL_UNAVAILABLE" } }; },
  });
  assert.equal(calls, 1);
  assert.equal(summary.attempted, 1);
  assert.equal(summary.skipped, 5);
  assert.equal(summary.total_model_calls, null);
  assert.equal(results[0].error_code, "COMPANION_MODEL_UNAVAILABLE");
  assert.ok(results.slice(1).every((item) => item.skipped));
});
