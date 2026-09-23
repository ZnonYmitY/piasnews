import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  BATCH_SIZE, HOLDOUT_HASH, MAX_REQUESTS, RATE_WINDOW_MS, REGRESSION_HASH, REGRESSION_SCENARIOS, REVIEW_DIMENSIONS,
  SCENARIO_HASH, SCENARIO_VERSION, SELF_EVOLUTION_SCENARIOS,
  checkSelfEvolutionResponse, parseSelfEvolutionArgs, planSelfEvolution, runSelfEvolution,
} from "../../scripts/eval_companion_self_evolution.mjs";

const allCases = Object.values(SELF_EVOLUTION_SCENARIOS).flatMap((suite) => suite.flatMap((family) => family.turns));
const sample = (overrides = {}) => ({
  mode: "free", engine: "deepseek", model: "synthetic-test-model", answer_kind: "social", route: "fan_light",
  answer_en: "A synthetic generated reply.", answer_zh: "合成生成的回答。", sources: [],
  knowledge_fact_ids: [], public_source_ids: [], rumor_item_ids: [],
  performance: { model_calls: 1, context_ms: 10, generation_ms: 200, total_ms: 210 },
  validation_trace: { repair_count: 0, additional_review_requests: 0 }, ...overrides,
});
const responseFor = (payload, overrides = {}) => {
  const testCase = [...allCases, ...REGRESSION_SCENARIOS.flatMap((item) => item.turns)].find((item) => item.message === payload.message);
  const kind = testCase.kinds.includes("social") ? "social" : testCase.kinds.includes("insufficient") ? "insufficient" : testCase.kinds[0];
  return sample({ mode: payload.mode, answer_kind: kind, route: kind === "insufficient" ? "insufficient_current_fact" : kind === "boundary" ? "private_or_inner_state_unverified" : "fan_light", ...overrides });
};
const single = () => parseSelfEvolutionArgs(["--run", "--suite", "discover", "--shard", "1"]);
const silent = { emit: () => {} };

test("frozen original synthetic matrix has twelve disjoint two-turn families", () => {
  assert.equal(allCases.length, 24);
  assert.equal(new Set(allCases.map((item) => item.id)).size, 24);
  assert.equal(new Set(allCases.map((item) => item.message)).size, 24);
  const familyIds = Object.values(SELF_EVOLUTION_SCENARIOS).flatMap((suite) => suite.map((item) => item.id));
  assert.equal(new Set(familyIds).size, 12);
  for (const suite of Object.values(SELF_EVOLUTION_SCENARIOS)) {
    assert.equal(suite.length, 6);
    for (const family of suite) {
      assert.equal(family.turns.length, 2);
      assert.ok(family.turns.every((item) => item.mode === family.mode));
      assert.ok(Object.isFrozen(family.turns));
      assert.ok(Object.isFrozen(family.turns[0]));
      assert.ok(Object.isFrozen(family.turns[0].kinds));
      assert.ok(family.turns.every((item) => !item.history), "No fabricated assistant history in fixtures");
    }
  }
  assert.equal(SCENARIO_VERSION, "synthetic-chat-v1");
  assert.equal(HOLDOUT_HASH, "e95713d22e16cfd2e77f3d0521d0116e7725cf624f6125beb95bf38391cc58a5", "A changed holdout needs a new version and baseline, not a weakened gate");
  assert.match(SCENARIO_HASH, /^[a-f0-9]{64}$/);
  assert.throws(() => { SELF_EVOLUTION_SCENARIOS.holdout[0].turns[0].message = "changed"; }, TypeError);
});

test("default plan is twelve requests with no execution and bounded six-request shards", async () => {
  const options = parseSelfEvolutionArgs([]), plan = planSelfEvolution(options);
  assert.equal(options.run, false);
  assert.equal(options.budget, 12);
  assert.equal(plan.planned, 12);
  assert.equal(plan.batches.length, 2);
  assert.ok(plan.batches.every((batch) => batch.families.flatMap((item) => item.turns).length === BATCH_SIZE));
  assert.equal(planSelfEvolution(single()).planned, 6);
  assert.equal(parseSelfEvolutionArgs(["--run", "--help"]).run, false);
  assert.equal(planSelfEvolution(parseSelfEvolutionArgs(["--suite", "all", "--budget", "24"])).planned, MAX_REQUESTS);
  const { stdout } = await promisify(execFile)(process.execPath, [fileURLToPath(new URL("../../scripts/eval_companion_self_evolution.mjs", import.meta.url)), "--suite", "holdout", "--shard", "2"]);
  const output = JSON.parse(stdout);
  assert.equal(output.type, "dry_run");
  assert.equal(output.planned, 6);
  assert.match(output.note, /No requests/);
  assert.equal(output.holdout_hash, HOLDOUT_HASH);
});

test("strict arguments reject excessive or insufficient budgets and unsafe connection settings", () => {
  for (const args of [
    ["--suite", "all"], ["--budget", "11"], ["--budget", "25"], ["--budget", "0"], ["--budget", "1.5"],
    ["--budget", "12oops"], ["--budget", "1e2"], ["--budget", "-12"], ["--suite", "unknown"],
    ["--shard", "3"], ["--suite", "regression", "--shard", "2"], ["--suite"], ["--unknown"], ["--run", "--run"], ["--budget", "12", "--budget", "24"],
    ["--transport", "shell"], ["--base-url", "https://user:secret@example.com"], ["--base-url", "https://example.com?token=secret"],
    ["--base-url", "https://example.com/companion"], ["--base-url", "http://example.com"],
  ]) assert.throws(() => parseSelfEvolutionArgs(args), `Expected rejection: ${args.join(" ")}`);
  assert.equal(parseSelfEvolutionArgs(["--base-url", "http://127.0.0.1:8787"]).baseUrl, "http://127.0.0.1:8787");
  assert.equal(parseSelfEvolutionArgs(["--suite", "all", "--shard", "1"]).budget, 12);
});

test("programmatic callers cannot bypass explicit run or request budgets", async () => {
  let calls = 0;
  const deps = { ...silent, request: async () => { calls += 1; } };
  await assert.rejects(runSelfEvolution(parseSelfEvolutionArgs([]), deps), /explicit --run/);
  await assert.rejects(runSelfEvolution({ ...single(), run: "true" }, deps), /explicit --run/);
  await assert.rejects(runSelfEvolution({ ...single(), budget: 5 }, deps), /needs 6 requests/);
  await assert.rejects(runSelfEvolution({ ...single(), budget: 25 }, deps), /1 to 24/);
  assert.equal(calls, 0);
});

test("each family carries actual replies, then resets history for the next family", async () => {
  const payloads = [], emitted = [];
  const { summary, results } = await runSelfEvolution(single(), {
    emit: (item) => emitted.push(item), request: async ({ endpoint, transport, payload }) => {
      assert.ok(endpoint.endsWith("/companion/chat"));
      assert.equal(transport, "curl");
      assert.equal(payload.candidate_mode, true);
      assert.equal(payload.disclosure_shown, true);
      assert.equal(payload.time_zone, "Asia/Shanghai");
      payloads.push(payload);
      return { status: 200, body: responseFor(payload, { answer_en: `Unique reply ${payloads.length}.` }) };
    },
  });
  assert.equal(payloads.length, 6);
  assert.deepEqual(payloads.map((item) => item.history.length), [0, 2, 0, 2, 0, 2]);
  for (const index of [1, 3, 5]) assert.match(payloads[index].history.at(-1).content, new RegExp(`Unique reply ${index}\\.`));
  assert.equal(summary.contract_passed, 6);
  assert.equal(summary.total_model_calls, 6);
  assert.equal(summary.semantic_status, "not_evaluated");
  assert.equal(summary.independent_review_required, true);
  assert.ok(results.every((item) => item.semantic_status === "needs_independent_review"));
  assert.ok(results.every((item) => !Object.hasOwn(item, "passed")));
  assert.deepEqual(results[0].review_dimensions, REVIEW_DIMENSIONS);
  assert.equal(emitted.at(-1).type, "summary");
  assert.match(summary.note, /not semantic proof/);
});

test("rolling throttle permits at most six starts per 65 seconds and bounded waits", async () => {
  let clock = 0;
  const starts = [], sleeps = [], emitted = [];
  const { summary } = await runSelfEvolution(parseSelfEvolutionArgs(["--run", "--suite", "all", "--budget", "24"]), {
    emit: (item) => emitted.push(item), now: () => clock,
    sleep: async (ms) => { sleeps.push(ms); clock += ms; },
    request: async ({ payload }) => { starts.push(clock); clock += 100; return { status: 200, body: responseFor(payload) }; },
  });
  assert.equal(starts.length, 24);
  assert.equal(summary.attempted, 24);
  for (let index = 6; index < starts.length; index += 1) assert.ok(starts[index] - starts[index - 6] >= RATE_WINDOW_MS);
  assert.ok(sleeps.length >= 3);
  assert.ok(sleeps.every((ms) => ms > 0 && ms <= 30000));
  assert.ok(emitted.some((item) => item.type === "throttle"));
  assert.equal(summary.expected_model_call_ceiling, 48);
});

test("slow requests consume their elapsed window without unnecessary extra waits", async () => {
  let clock = 0, sleeps = 0;
  const { summary } = await runSelfEvolution(parseSelfEvolutionArgs(["--run"]), {
    ...silent, now: () => clock, sleep: async () => { sleeps += 1; },
    request: async ({ payload }) => { clock += 12000; return { status: 200, body: responseFor(payload) }; },
  });
  assert.equal(summary.attempted, 12);
  assert.equal(sleeps, 0);
  assert.equal(summary.client_median_ms, 12000);
});

test("429 immediately halts all remaining families with no retries or sleeps", async () => {
  let calls = 0, sleeps = 0;
  const { results, summary } = await runSelfEvolution(parseSelfEvolutionArgs(["--run"]), {
    ...silent, sleep: async () => { sleeps += 1; },
    request: async ({ payload }) => { calls += 1; return calls === 2 ? { status: 429, body: {} } : { status: 200, body: responseFor(payload) }; },
  });
  assert.equal(calls, 2);
  assert.equal(sleeps, 0);
  assert.equal(summary.attempted, 2);
  assert.equal(summary.skipped, 10);
  assert.equal(summary.stopped_reason, "rate_limit");
  assert.ok(results.slice(2).every((item) => item.skipped && item.reason === "rate_limit_stopped_run"));
  assert.equal(summary.total_model_calls, null);
  assert.equal(summary.known_model_calls, 1);
  assert.equal(summary.unknown_model_call_requests, 1);
});

test("failed turn skips its dependent followup, but unrelated families can run", async () => {
  const payloads = [];
  const { results, summary } = await runSelfEvolution(single(), {
    ...silent, request: async ({ payload }) => {
      payloads.push(payload);
      return payloads.length === 1 ? { status: 503, body: { error_code: "COMPANION_MODEL_UNAVAILABLE" } } : { status: 200, body: responseFor(payload) };
    },
  });
  assert.equal(payloads.length, 5);
  assert.equal(results[1].skipped, true);
  assert.match(results[1].reason, /no_fabricated_history/);
  assert.deepEqual(payloads[1].history, []);
  assert.equal(summary.contract_failed, 1);
  assert.equal(summary.skipped, 1);
  assert.equal(summary.total_model_calls, null);
});

test("invalid HTTP 200 provenance cannot enter history", async () => {
  let calls = 0;
  const { results, summary } = await runSelfEvolution(single(), {
    ...silent, request: async ({ payload }) => {
      calls += 1;
      return { status: 200, body: responseFor(payload, calls === 1 ? { engine: "fallback", answer_en: "An unverified fabricated answer." } : {}) };
    },
  });
  assert.equal(calls, 5);
  assert.equal(results[0].contract_passed, false);
  assert.equal(results[1].skipped, true);
  assert.equal(summary.contract_failed, 1);
});

test("request exceptions do not echo raw errors, provider bodies or fabricated call counts", async () => {
  let calls = 0;
  const { results, summary } = await runSelfEvolution(single(), {
    ...silent, request: async ({ payload }) => {
      calls += 1;
      if (calls === 1) throw Object.assign(new Error("PRIVATE_PROVIDER_BODY"), { name: "PRIVATE_SECRET_NAME", code: "PRIVATE_TOKEN", cause: { token: "PRIVATE_CAUSE" } });
      return { status: 200, body: responseFor(payload) };
    },
  });
  assert.equal(results[0].error, "Error");
  assert.equal(results[0].model_calls, null);
  assert.equal(summary.total_model_calls, null);
  assert.ok(!JSON.stringify(results).includes("PRIVATE"));
  assert.equal(calls, 5);
});

test("ledger allowlists diagnostic scalars and strips metadata plus URL credentials/query", async () => {
  const { results } = await runSelfEvolution(single(), {
    ...silent, request: async ({ payload }) => ({ status: 200, body: responseFor(payload, {
      diagnostic: { stage: "validation", reason: "conversation_pacing_mismatch", repair_count: 1, elapsed_ms: 1234, provider_body: "PRIVATE_PROVIDER", token: "PRIVATE_TOKEN" },
      performance: { model_calls: 1, total_ms: 210, private_metadata: "PRIVATE_PERFORMANCE" },
      validation_trace: { repair_count: 1, additional_review_requests: 0, raw_output: "PRIVATE_REVIEW" },
      request_id: { secret: "PRIVATE_REQUEST" }, headers: { Authorization: "PRIVATE_AUTH" },
      sources: [
        { id: "KF-1", url: "https://example.com/facts?token=PRIVATE_QUERY#PRIVATE_HASH", private_metadata: "PRIVATE_SOURCE" },
        { id: "KF-2", url: "https://user:PRIVATE_PASSWORD@example.com/facts" },
        { id: "KF-3", url: "javascript:PRIVATE_JS" },
      ],
    }) }),
  });
  const result = results[0];
  assert.deepEqual(result.diagnostic, { stage: "validation", reason: "conversation_pacing_mismatch", repair_count: 1, elapsed_ms: 1234 });
  assert.deepEqual(result.sources, [{ id: "KF-1", url: "https://example.com/facts" }, { id: "KF-2" }, { id: "KF-3" }]);
  assert.deepEqual(result.validation_trace, { repair_count: 1, additional_review_requests: 0 });
  assert.equal(result.request_id, null);
  assert.ok(!JSON.stringify(results).includes("PRIVATE"));
});

test("model generation, translation and call-count checks remain hard contracts", () => {
  const testCase = allCases.find((item) => item.id === "welcome_1");
  for (const changes of [
    { answer_en: " " }, { answer_en: { not: "text" } }, { answer_zh: " " }, { answer_zh: { not: "text" } },
    { model: {} }, { model: " " }, { engine: "fallback" }, { answer_en: "Hey 中文" },
    { performance: { model_calls: 0 } }, { performance: { model_calls: 3 } },
    { validation_trace: { additional_review_requests: 1 } },
  ]) assert.ok(checkSelfEvolutionResponse(testCase, 200, sample(changes)).contract_errors.length, JSON.stringify(changes));
  assert.equal(checkSelfEvolutionResponse(testCase, 200, sample({ performance: { model_calls: 2 } })).contract_errors.length, 0);
});

test("naturalness and conversational instructions are review flags, not semantic pass/fail", () => {
  const select = (id) => allCases.find((item) => item.id === id);
  for (const [id, changes, flag] of [
    ["everyday_choice_1", { answer_en: "What do you mean by that?" }, /clarification/],
    ["welcome_2", { answer_en: "Baku practice is the next session." }, /topic preference/],
    ["emotion_1", { answer_en: "You should try taking a break." }, /advice/],
    ["user_memory_2", { answer_en: "Sorry, I don't remember.", answer_zh: "我不记得了。" }, /reference/],
    ["choice_constraint_2", { answer_zh: "因为它比较容易吃。" }, /Chinese length/],
  ]) {
    const check = checkSelfEvolutionResponse(select(id), 200, sample(changes));
    assert.equal(check.contract_errors.length, 0);
    assert.ok(check.heuristic_flags.some((item) => flag.test(item)));
  }
  assert.deepEqual(checkSelfEvolutionResponse(select("user_memory_2"), 200, sample({ answer_en: "Xiaolin.", answer_zh: "小林。" })).heuristic_flags, []);
  assert.deepEqual(checkSelfEvolutionResponse(select("choice_constraint_2"), 200, sample({ answer_zh: "热乎省事。" })).heuristic_flags, []);
  const fact = select("event_context_1");
  assert.ok(!checkSelfEvolutionResponse(fact, 200, sample({ answer_kind: "insufficient", answer_en: "I don't have a verified Baku result." })).heuristic_flags.some((item) => /race detail/.test(item)));
});

test("held-out grounded mode is isolated from prior fictional and privacy histories", async () => {
  const inputs = [];
  await runSelfEvolution(parseSelfEvolutionArgs(["--run", "--suite", "holdout", "--shard", "2"]), {
    ...silent, request: async ({ payload }) => { inputs.push(payload); return { status: 200, body: responseFor(payload) }; },
  });
  assert.deepEqual(inputs.map((item) => item.mode), ["free", "free", "grounded", "grounded", "free", "free"]);
  assert.deepEqual(inputs.map((item) => item.history.length), [0, 2, 0, 2, 0, 2]);
  assert.ok(inputs[2].facts_only);
  assert.ok(inputs[3].facts_only);
  assert.equal(inputs[4].facts_only, false);
  assert.ok(inputs[5].history[0].content.includes("酒店房间号"), "Recovery probe retains only its own actual boundary turn");
});

test("targeted regressions have fixed labeled synthetic seeds and remain outside all", async () => {
  const options = parseSelfEvolutionArgs(["--run", "--suite", "regression", "--budget", "6"]);
  assert.equal(planSelfEvolution(options).planned, 6);
  assert.equal(planSelfEvolution(options).batches.length, 1);
  assert.equal(planSelfEvolution(parseSelfEvolutionArgs(["--suite", "all", "--budget", "24"])).planned, 24);
  assert.match(REGRESSION_HASH, /^[a-f0-9]{64}$/);
  assert.ok(REGRESSION_SCENARIOS.every((item) => item.turns.length === 1 && item.seed_history.length === 2));
  assert.ok(Object.isFrozen(REGRESSION_SCENARIOS[0].seed_history[0]));
  const inputs = [];
  const { summary, results } = await runSelfEvolution(options, {
    ...silent, request: async ({ payload }) => { inputs.push(payload); return { status: 200, body: responseFor(payload) }; },
  });
  assert.equal(summary.attempted, 6);
  assert.equal(summary.regression_hash, REGRESSION_HASH);
  assert.ok(results.every((item) => item.history_origin === "frozen_synthetic_seed" && item.seeded_history_messages === 2));
  assert.deepEqual(inputs.map((item) => item.history), REGRESSION_SCENARIOS.map((item) => item.seed_history));
  assert.ok(!inputs[1].history.some((item) => item.content.includes("A synthetic generated reply")), "Different seed families never borrow a prior response");
  assert.equal(summary.semantic_status, "not_evaluated");
});

test("a failed seeded replay never becomes history for other seeded replays", async () => {
  const inputs = [];
  const { summary } = await runSelfEvolution(parseSelfEvolutionArgs(["--run", "--suite", "regression", "--budget", "6"]), {
    ...silent, request: async ({ payload }) => {
      inputs.push(payload);
      return inputs.length === 1 ? { status: 502, body: {} } : { status: 200, body: responseFor(payload) };
    },
  });
  assert.equal(summary.attempted, 6);
  assert.equal(summary.contract_failed, 1);
  assert.equal(summary.skipped, 0);
  assert.deepEqual(inputs[1].history, REGRESSION_SCENARIOS[1].seed_history);
  const control = REGRESSION_SCENARIOS.find((item) => item.id === "regression_no_advice_memory").turns[0];
  const check = checkSelfEvolutionResponse(control, 200, sample({ answer_en: "What happened next?" }));
  assert.deepEqual(check.contract_errors, []);
  assert.ok(check.heuristic_flags.some((item) => /no-question/.test(item)));
});
