import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_BASE_URL, EVENT_CASES, checkEventResponse, parseEventArgs, runEventSuite, sanitizeEventQuery,
} from "../../scripts/eval_companion_events.mjs";
import { buildConversationPayload, buildCurlArgs, ORIGIN } from "../../scripts/eval_companion_conversation.mjs";

// Synthetic future/past-neutral IDs: these fixtures make no claim about a live event.
const FIRST_ID = "fixture-grand-prix-a", NEXT_ID = "fixture-grand-prix-b";
const SOURCE = "LIVE-aabbccddeeff0011";
const query = (overrides = {}) => ({ relation: "previous", requested: "identity", session: "race", target_event_id: FIRST_ID, target_session_ref: `${FIRST_ID}:race`, status: "matched_result", source_ids: [SOURCE], ...overrides });
const body = (overrides = {}) => ({
  mode: "free", engine: "deepseek", model: "synthetic-test-model", answer_kind: "evidence", route: "f1_grounded",
  answer_en: "The selected record identifies the event.", answer_zh: "选中的记录能够确定这场赛事。",
  event_query: query(), sources: [{ id: SOURCE, kind: "session_result", url: "https://example.com/official-result", title: "Synthetic source record", date: "2000-01-02T12:00:00Z" }],
  knowledge_fact_ids: [], rumor_item_ids: [], public_source_ids: [SOURCE], retrieved_public_source_ids: [SOURCE],
  performance: { model_calls: 1, total_ms: 950, context_ms: 30, generation_ms: 920, context_chars: 12000 },
  validation_trace: { status: "same_generation_self_check", independent_verified: false, local_checks: ["selected_ids"], repair_count: 0, additional_review_requests: 0 }, ...overrides,
});
const helloBody = () => body({ answer_kind: "social", route: "fan_light", answer_en: "Hey. Good to see you.", answer_zh: "嗨，很高兴见到你。", event_query: null, sources: [], public_source_ids: [], retrieved_public_source_ids: [] });

test("the sole suite is exactly the six requested free-mode turns, without fabricated answers or fixed event/position expectations", () => {
  assert.equal(EVENT_CASES.length, 6);
  assert.deepEqual(EVENT_CASES.map((item) => item.message), ["你的上一场比赛是什么", "那场在哪跑的", "你那场第几", "接下来呢", "最近一次练习呢", "你好"]);
  assert.ok(EVENT_CASES.every((item) => item.mode === "free" && !item.history && !item.surface_context));
  assert.ok(EVENT_CASES.slice(0, 5).every((item) => item.kinds.join(",") === "evidence,insufficient"));
  assert.deepEqual(EVENT_CASES.at(-1).kinds, ["social"]);
  assert.ok(!JSON.stringify(EVENT_CASES).includes(FIRST_ID));
  assert.ok(Object.isFrozen(EVENT_CASES) && EVENT_CASES.every(Object.isFrozen));
});

test("default and help are dry runs, imports do not request, and live execution is explicitly gated", async () => {
  const defaults = parseEventArgs([]);
  assert.deepEqual(defaults, { run: false, help: false, transport: "curl", baseUrl: DEFAULT_BASE_URL });
  assert.equal(parseEventArgs(["--run", "--help"]).run, false);
  let calls = 0;
  await assert.rejects(runEventSuite(defaults, { request: async () => { calls += 1; } }), /explicit --run/);
  assert.equal(calls, 0);
  const { stdout } = await promisify(execFile)(process.execPath, [fileURLToPath(new URL("../../scripts/eval_companion_events.mjs", import.meta.url))]);
  assert.match(stdout, /Dry run: no requests/);
  assert.match(stdout, /not a continuous monitor/);
  assert.equal(JSON.parse(stdout.trim().split("\n")[1]).cases.length, 6);
});

test("CLI has only the fixed suite and IPv4 curl, rejects credentials/unsafe origins, and revalidates direct callers", async () => {
  for (const args of [
    ["--suite", "multi"], ["--transport", "fetch"], ["--key", "fake"], ["--run", "--run"], ["--base-url"],
    ["--base-url", "http://example.com"], ["--base-url", "https://name:fake@example.com"],
    ["--base-url", "https://example.com/path"], ["--base-url", "https://example.com?token=fake"],
  ]) assert.throws(() => parseEventArgs(args));
  assert.equal(parseEventArgs(["--base-url", "http://127.0.0.1:8787"]).baseUrl, "http://127.0.0.1:8787");
  let calls = 0;
  await assert.rejects(runEventSuite({ run: true, baseUrl: "https://user:fake@example.com" }, { request: async () => { calls += 1; } }));
  assert.equal(calls, 0);
  const payload = buildConversationPayload(EVENT_CASES[0]), args = buildCurlArgs(`${DEFAULT_BASE_URL}/companion/chat`, payload);
  assert.equal(args[0], "-4");
  assert.ok(args.includes(`Origin: ${ORIGIN}`));
  assert.equal(args.at(-1), JSON.stringify(payload));
  assert.ok(!args.some((item) => /authorization|feedback/i.test(item)));
  assert.ok(!args.includes("--retry"));
  assert.equal(payload.surface_context, undefined);
});

test("event query output is a bounded whitelist and does not copy provider data", () => {
  const value = query();
  assert.deepEqual(sanitizeEventQuery({ ...value, provider_body: "PRIVATE_BODY", token: "PRIVATE_TOKEN", extra: { secret: true } }), value);
  assert.equal(sanitizeEventQuery({ relation: "private text", status: "unknown", target_event_id: { secret: true } }), null);
  assert.deepEqual(sanitizeEventQuery(query({ target_event_id: null, target_session_ref: null, source_ids: [] })), query({ target_event_id: null, target_session_ref: null, source_ids: [] }));
  assert.equal(sanitizeEventQuery(query({ target_event_id: "Synthetic Grand Prix|2000-01-02T12:00:00Z" })).target_event_id, "Synthetic Grand Prix|2000-01-02T12:00:00Z", "Server-owned fallback identities are opaque, not a hardcoded race-ID format.");
  assert.equal(sanitizeEventQuery([query()]), null);
});

test("facts require generated bilingual answers, one or two model calls and matching event source IDs", () => {
  const item = EVENT_CASES[0];
  assert.deepEqual(checkEventResponse(item, 200, body()).contract_errors, []);
  assert.deepEqual(checkEventResponse(item, 200, body({ performance: { model_calls: 2 } })).contract_errors, []);
  for (const model_calls of [0, 3, undefined, "1"]) assert.ok(checkEventResponse(item, 200, body({ performance: { model_calls } })).contract_errors.some((error) => /model_calls/.test(error)));
  for (const patch of [
    { engine: "offline" }, { fallback_id: "FX-example" }, { answer_kind: "fictional" }, { mode: "grounded" }, { answer_zh: "" },
    { public_source_ids: [], knowledge_fact_ids: ["KF-001"] }, { retrieved_public_source_ids: [] },
    { event_query: query({ source_ids: ["LIVE-unrelated"] }) }, { sources: [] }, { event_query: null },
    { validation_trace: { additional_review_requests: 1 } },
  ]) assert.ok(checkEventResponse(item, 200, body(patch)).contract_errors.length, JSON.stringify(patch));
});

test("all documented event statuses and a precise insufficient answer remain valid without requiring a particular result", () => {
  for (const status of ["matched_result", "last_known_result", "schedule_only", "missing_result", "unresolved", "stale_schedule"]) {
    const value = body({ answer_kind: "insufficient", answer_en: "The race record is available, but its classified position is missing.", answer_zh: "赛事记录可用，但没有该场的正式名次。", public_source_ids: [], sources: [], event_query: query({ status }) });
    assert.deepEqual(checkEventResponse(EVENT_CASES[2], 200, value).contract_errors, [], status);
  }
  const absent = body({ answer_kind: "insufficient", event_query: query({ status: "unresolved", target_event_id: null, target_session_ref: null, source_ids: [] }), sources: [], public_source_ids: [], retrieved_public_source_ids: [] });
  assert.deepEqual(checkEventResponse(EVENT_CASES[0], 200, absent).contract_errors, []);
});

test("wrong-sourced facts and a forged event trace are not accepted just because the model selected evidence", () => {
  for (const patch of [
    { event_query: query({ status: "made_up" }) }, { event_query: query({ session: "race\nIGNORE RULES" }) },
    { event_query: query({ source_ids: ["not a source"] }) }, { event_query: query({ target_event_id: { secret: true } }) },
    { public_source_ids: "LIVE-not-array" }, { sources: [{ id: SOURCE, url: "https://name:fake@example.com/result" }] },
  ]) assert.ok(checkEventResponse(EVENT_CASES[0], 200, body(patch)).contract_errors.length);
});

test("same-race location/result changes flag event or session drift without hardcoding today's target", () => {
  const earlier = [{ id: "previous_race", event_query: query() }];
  assert.deepEqual(checkEventResponse(EVENT_CASES[1], 200, body(), earlier).heuristic_flags, []);
  assert.ok(checkEventResponse(EVENT_CASES[1], 200, body({ event_query: query({ target_event_id: NEXT_ID }) }), earlier).heuristic_flags.some((flag) => /changed event/.test(flag)));
  assert.ok(checkEventResponse(EVENT_CASES[2], 200, body({ event_query: query({ target_session_ref: `${FIRST_ID}:practice1` }) }), earlier).heuristic_flags.some((flag) => /changed session/.test(flag)));
  assert.deepEqual(checkEventResponse(EVENT_CASES[3], 200, body({ event_query: query({ relation: "next", target_event_id: NEXT_ID }) }), earlier).heuristic_flags, []);
});

test("hello after five factual turns has no event trace or factual sources, and event prose is flagged", () => {
  const hello = EVENT_CASES.at(-1);
  assert.deepEqual(checkEventResponse(hello, 200, helloBody()).contract_errors, []);
  assert.deepEqual(checkEventResponse(hello, 200, helloBody()).heuristic_flags, []);
  assert.ok(checkEventResponse(hello, 200, { ...helloBody(), event_query: query() }).contract_errors.some((item) => /retain an event query/.test(item)));
  assert.ok(checkEventResponse(hello, 200, { ...helloBody(), sources: body().sources, public_source_ids: [SOURCE], retrieved_public_source_ids: [SOURCE] }).contract_errors.some((item) => /must not cite/.test(item)));
  assert.ok(checkEventResponse(hello, 200, { ...helloBody(), answer_en: "Hello. I finished on the podium at that race." }).heuristic_flags.some((item) => /event detail/.test(item)));
  assert.deepEqual(checkEventResponse(hello, 200, { ...helloBody(), retrieved_public_source_ids: [SOURCE] }).contract_errors, [], "Retrieved background is not an actual factual citation.");
});

test("six requests carry actual bilingual generated history with endpoint bounds and no key or feedback request", async () => {
  const requests = [], emitted = [];
  let clock = 0;
  const { results, summary } = await runEventSuite(parseEventArgs(["--run"]), {
    now: () => clock += 5, emit: (value) => emitted.push(value), request: async ({ endpoint, payload, transport }) => {
      assert.equal(endpoint, `${DEFAULT_BASE_URL}/companion/chat`);
      assert.equal(transport, "curl");
      requests.push(payload);
      return { status: 200, body: requests.length === 6 ? helloBody() : body({ answer_en: `Uniquely generated turn ${requests.length}.`, answer_zh: `实际合成的第 ${requests.length} 轮。` }) };
    },
  });
  assert.equal(requests.length, 6);
  assert.deepEqual(requests.map((item) => item.history.length), [0, 2, 4, 6, 8, 8]);
  assert.ok(requests.every((item) => item.mode === "free" && item.facts_only === false && item.surface_context === undefined));
  assert.equal(requests[1].history.at(-1).content, "Uniquely generated turn 1.\n实际合成的第 1 轮。");
  assert.match(requests.at(-1).history.at(-1).content, /turn 5/);
  assert.ok(requests.every((item) => item.history.every((entry) => entry.content.length <= 900)));
  assert.equal(summary.contract_failed, 0);
  assert.equal(summary.total_model_calls, 6);
  assert.equal(summary.event_evidence_labeled_answers, 5);
  assert.equal(summary.event_answers_citing_session_result, 5);
  assert.equal(summary.event_information_gaps, 0);
  assert.equal(results[0].sources[0].date, "2000-01-02T12:00:00Z");
  assert.equal(results[0].performance.context_ms, 30);
  assert.equal(emitted.length, 7);
  assert.match(summary.note, /not semantic proof/);
});

test("valid information gaps stay in real history and are counted separately from evidence coverage", async () => {
  let calls = 0;
  const { summary } = await runEventSuite(parseEventArgs(["--run"]), { emit: () => {}, request: async ({ payload }) => {
    calls += 1;
    if (calls > 1) assert.ok(payload.history.at(-1).content.includes("not collected") || calls === 6);
    return { status: 200, body: calls === 6 ? helloBody() : body({ answer_kind: "insufficient", answer_en: "The requested session's result was not collected.", answer_zh: "尚未收录所问赛段的赛果。", public_source_ids: [], sources: [], event_query: query({ status: "missing_result" }) }) };
  } });
  assert.equal(calls, 6);
  assert.equal(summary.contract_failed, 0);
  assert.equal(summary.event_evidence_labeled_answers, 0);
  assert.equal(summary.event_answers_citing_session_result, 0);
  assert.equal(summary.event_participation_or_recency_reviews, 5);
  assert.equal(summary.event_information_gaps, 5);
});

test("result-labeled evidence with only a schedule requests review without rejecting an honest partial answer", () => {
  for (const [answer_en, answer_zh] of [
    ["I finished in the position mentioned earlier.", "我取得了前面提过的名次。"],
    ["The calendar identifies that race, but its result is not available here.", "赛历能够确定那场比赛，但这里没有它的赛果。"],
  ]) {
    const checked = checkEventResponse(EVENT_CASES[2], 200, body({ answer_en, answer_zh,
      event_query: query({ requested: "result", status: "missing_result" }),
      sources: [{ ...body().sources[0], kind: "schedule" }],
    }));
    assert.deepEqual(checked.contract_errors, [], "Partial factual answers with explicit gaps are not HTTP or schema failures.");
    assert.equal(checked.event_source_check.session_result_cited, false);
    assert.equal(checked.event_source_check.schedule_only_cited, true);
    assert.ok(checked.heuristic_flags.some((flag) => /result answer labeled evidence cites no session_result/.test(flag)));
    assert.ok(checked.heuristic_flags.some((flag) => /missing_result.*participation/.test(flag)));
  }
});

test("a retrieved, uncited, unknown-type or different-event result cannot conceal a result citation gap", () => {
  const other = "LIVE-1122334455667788";
  for (const patch of [
    { sources: [{ ...body().sources[0], kind: "schedule" }, { ...body().sources[0], id: other }], retrieved_public_source_ids: [SOURCE, other] },
    { sources: [{ ...body().sources[0], kind: "schedule" }, { ...body().sources[0], id: other }], retrieved_public_source_ids: [SOURCE, other], public_source_ids: [SOURCE, other] },
    { sources: [{ ...body().sources[0], kind: undefined }] },
  ]) {
    const checked = checkEventResponse(EVENT_CASES[2], 200, body({ ...patch, event_query: query({ requested: "result", status: "missing_result" }) }));
    assert.deepEqual(checked.contract_errors, []);
    assert.equal(checked.event_source_check.session_result_cited, false);
    assert.ok(checked.heuristic_flags.some((flag) => /cites no session_result/.test(flag)));
  }
  const actual = checkEventResponse(EVENT_CASES[2], 200, body({ event_query: query({ requested: "result" }) }));
  assert.equal(actual.event_source_check.session_result_cited, true);
  assert.deepEqual(actual.heuristic_flags, []);
});

test("missing practice and last-known results flag participation/recency, but a plain next schedule does not", () => {
  const practice = checkEventResponse(EVENT_CASES[4], 200, body({
    answer_en: "That was the latest practice recorded for me.", answer_zh: "那是我最近一次被记录的练习。",
    event_query: query({ relation: "latest", session: "practice", status: "missing_result" }), sources: [{ ...body().sources[0], kind: "schedule" }],
  }));
  assert.deepEqual(practice.contract_errors, []);
  assert.equal(practice.event_source_check.participation_or_recency_review, true);
  assert.ok(practice.heuristic_flags.some((flag) => /schedule alone does not establish/.test(flag)));
  const historical = checkEventResponse(EVENT_CASES[0], 200, body({ event_query: query({ status: "last_known_result" }) }));
  assert.deepEqual(historical.contract_errors, []);
  assert.equal(historical.event_source_check.session_result_cited, true);
  assert.ok(historical.heuristic_flags.some((flag) => /last_known_result.*unverified latest relationship/.test(flag)));
  const schedule = checkEventResponse(EVENT_CASES[3], 200, body({ event_query: query({ relation: "next", requested: "schedule", status: "schedule_only" }), sources: [{ ...body().sources[0], kind: "schedule" }] }));
  assert.deepEqual(schedule.heuristic_flags, []);
});

test("summary distinguishes evidence labels from result sources and keeps flagged-but-valid turns in history", async () => {
  let calls = 0;
  const { results, summary } = await runEventSuite(parseEventArgs(["--run"]), { emit: () => {}, request: async ({ payload }) => {
    const index = calls++;
    if (index === 3) assert.match(payload.history.at(-1).content, /position mentioned earlier/, "Review flags do not rewrite or discard the actual generated history.");
    if (index === 5) return { status: 200, body: helloBody() };
    const overrides = index === 0 ? {} : { sources: [{ ...body().sources[0], kind: "schedule" }] };
    if (index === 2) Object.assign(overrides, { answer_en: "I finished in the position mentioned earlier.", event_query: query({ requested: "result", status: "missing_result" }) });
    if (index === 3) overrides.event_query = query({ relation: "next", requested: "schedule", status: "schedule_only" });
    if (index === 4) overrides.event_query = query({ relation: "latest", session: "practice", status: "missing_result" });
    return { status: 200, body: body(overrides) };
  } });
  assert.equal(calls, 6);
  assert.equal(summary.contract_passed, 6);
  assert.equal(summary.contract_failed, 0);
  assert.equal(summary.skipped, 0);
  assert.equal(summary.event_evidence_answers, undefined, "An ambiguous old coverage-sounding metric is not emitted.");
  assert.equal(summary.event_evidence_labeled_answers, 5);
  assert.equal(summary.event_answers_citing_session_result, 1);
  assert.equal(summary.event_answers_citing_schedule_only, 4);
  assert.equal(summary.event_result_answers_without_result_citation, 1);
  assert.equal(summary.event_participation_or_recency_reviews, 2);
  assert.equal(summary.heuristic_flagged, 2);
  assert.equal(results[2].event_source_check.session_result_cited, false);
  assert.match(summary.note, /not verified claim coverage/);
});

test("failed or malformed turns skip dependencies without synthetic repairs, repeated calls or invented model-call totals", async () => {
  for (const broken of [
    { status: 502, body: { error_code: "COMPANION_VALIDATION_FAILED", diagnostic: { stage: "validation", reason: "event_context_mismatch", repair_count: 1, provider_body: "PRIVATE_BODY", credentials: "PRIVATE_TOKEN" } } },
    { status: 200, body: body({ engine: "offline", performance: {} }) },
  ]) {
    let calls = 0;
    const { results, summary } = await runEventSuite(parseEventArgs(["--run"]), { emit: () => {}, request: async () => { calls += 1; return broken; } });
    assert.equal(calls, 1);
    assert.equal(summary.skipped, 5);
    assert.equal(summary.total_model_calls, null);
    assert.ok(results.slice(1).every((item) => item.skipped));
    assert.ok(!JSON.stringify(results).includes("PRIVATE_"));
  }
});

test("transport failures report safe error codes only and stop rather than retrying", async () => {
  let calls = 0;
  const { results, summary } = await runEventSuite(parseEventArgs(["--run"]), { emit: () => {}, request: async () => {
    calls += 1;
    const error = new Error("PRIVATE_PROVIDER_BODY"); error.code = "ECONNRESET"; throw error;
  } });
  assert.equal(calls, 1);
  assert.equal(summary.skipped, 5);
  assert.equal(results[0].cause, "ECONNRESET");
  assert.ok(!JSON.stringify(results).includes("PRIVATE_PROVIDER_BODY"));
});
