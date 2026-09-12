import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";
import { classifyCompanionScope } from "../../public/companion/scope-policy.js";

// Synthetic fixtures, not captured user transcripts. The model mock inspects
// the actual outbound prompt so a valid source ID cannot hide lost evidence.
const CLOCK = "2026-09-11T06:00:00Z";
const calendar = {
  generated_at: CLOCK, source: { provider: "Fixture schedule provider" },
  next_race: {
    id: "fixture-madrid", name: "Spanish Grand Prix", name_zh: "西班牙大奖赛", locality: "Madrid", circuit: "Madring",
    race_start: "2026-09-13T13:00:00Z", weekend_start: "2026-09-11T11:30:00Z",
    official_url: "https://www.formula1.com/en/racing/2026",
    sessions: { practice_1: "2026-09-11T11:30:00Z", practice_2: "2026-09-11T15:00:00Z", qualifying: "2026-09-12T14:00:00Z", race: "2026-09-13T13:00:00Z" },
  },
};
const env = { DEEPSEEK_API_KEY: "synthetic-placeholder", DEEPSEEK_BASE_URL: "https://model.invalid", DEEPSEEK_MODEL: "test-model" };
const check = { actual_facts: true, facts_supported: true, temporal_scope: "current", mode_consistent: true, answers_question: true };
function reply(patch = {}) {
  return { answer_en: "Friday practice in Madrid, with two sessions scheduled.", answer_zh: "周五是马德里练习赛日，安排了两节练习。",
    route: "f1_grounded", answer_kind: "evidence", style_card_id: "SC-05", public_source_ids: [], knowledge_fact_ids: [],
    rumor_item_ids: [], judgment_rule_ids: [], evidence_ids: [], self_check: check, ...patch };
}
async function exercise({ body = {}, clock = CLOCK, feeds = {}, model }) {
  const original = { fetch: globalThis.fetch, now: Date.now };
  const calls = [], publicCalls = [];
  Date.now = () => Date.parse(clock);
  globalThis.fetch = async (url, options) => {
    if (String(url) !== "https://model.invalid/chat/completions") {
      const file = new URL(url).pathname.split("/").at(-1);
      publicCalls.push(file);
      return Response.json(Object.hasOwn(feeds, file) ? feeds[file] : file === "calendar.json" ? calendar : {});
    }
    const input = JSON.parse(options.body);
    const runtime = JSON.parse(input.messages[1].content.split("\n").slice(1).join("\n"));
    calls.push({ input, runtime });
    const raw = await model(runtime, input, calls.length);
    return Response.json({ model: "test-model", choices: [{ finish_reason: "stop", message: { content: JSON.stringify(raw) } }] });
  };
  try {
    const response = await worker.fetch(new Request("https://worker.invalid/companion/chat", {
      method: "POST", headers: { Origin: "https://znonymity.github.io", "Content-Type": "application/json" },
      body: JSON.stringify({ message: "今天算什么日子？有赛事安排吗？", mode: "free", history: [], disclosure_shown: true, ...body }),
    }), env);
    return { status: response.status, data: await response.json(), calls, publicCalls };
  } finally { globalThis.fetch = original.fetch; Date.now = original.now; }
}

test("both modes receive Friday sessions and timezone in one generation, with no duplicated fact catalog", async () => {
  const selected = [];
  for (const mode of ["free", "grounded"]) {
    const result = await exercise({ body: { mode }, model(runtime, input) {
      assert.equal(runtime.TEMPORAL_CONTEXT.local_date, "2026-09-11");
      assert.equal(runtime.TEMPORAL_CONTEXT.time_zone, "Asia/Shanghai");
      assert.deepEqual(runtime.TEMPORAL_CONTEXT.today_sessions.map((s) => s.session), ["practice_1", "practice_2"]);
      assert.deepEqual(runtime.TEMPORAL_CONTEXT.today_sessions.map((s) => s.local_time), ["19:30", "23:00"]);
      const knowledge = runtime.RETRIEVED_KNOWLEDGE_CONTEXT;
      const source = knowledge.public_sources.find((s) => s.kind === "schedule");
      assert.equal(source.facts.locality, "Madrid");
      assert.equal(source.facts.sessions.practice_1, "2026-09-11T11:30:00.000Z");
      assert.equal(source.data_provider, "Fixture schedule provider");
      assert.equal(knowledge.source_catalog.find((s) => s.id === source.id).facts, undefined);
      assert.equal(runtime.CURRENT_PUBLIC_DATA.public_sources, undefined);
      assert.equal(runtime.PRODUCT_SCOPE.evidence_need, "day_context");
      assert.match(input.messages[0].content, /counterevidence_for/);
      selected.push(knowledge.retrieved);
      return reply({ public_source_ids: [source.id] });
    } });
    assert.equal(result.status, 200);
    assert.equal(result.calls.length, 1);
    assert.equal(result.publicCalls.length, 3);
    assert.equal(result.data.performance.model_calls, 1);
    assert.ok(result.data.performance.context_chars < 25000);
  }
  assert.deepEqual(selected[0], selected[1]);
});

test("available day evidence rejects false insufficiency and repairs once using the same facts", async () => {
  const history = [{ role: "user", content: "今天有什么值得注意的吗？" }, { role: "assistant", content: "Nothing special on my calendar." }];
  const result = await exercise({ body: { message: "今天不是马德里练习赛日吗？", history }, model(runtime, input, attempt) {
    assert.deepEqual(input.messages.filter((m) => ["user", "assistant"].includes(m.role)).slice(0, 2), history);
    const source = runtime.RETRIEVED_KNOWLEDGE_CONTEXT.public_sources.find((s) => s.kind === "schedule");
    if (attempt === 1) return reply({ route: "insufficient_current_fact", answer_kind: "insufficient", answer_en: "Nothing special on my calendar.", self_check: { ...check, actual_facts: false, temporal_scope: "none" } });
    assert.match(input.messages[3].content, /today's public sessions/);
    return reply({ answer_en: "You're right. I overlooked the Madrid practice sessions.", public_source_ids: [source.id] });
  } });
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 2);
  assert.equal(result.data.validation_trace.repair_count, 1);
  assert.equal(result.data.validation_trace.recovery_reason, "available_day_context_ignored");
});

test("a sourced correction may quote the previous mistake without a wasted repair", async () => {
  const result = await exercise({ model(runtime) {
    const source = runtime.RETRIEVED_KNOWLEDGE_CONTEXT.public_sources.find((s) => s.kind === "schedule");
    return reply({ answer_en: "I was wrong to say nothing special. Today has Madrid practice.", answer_zh: "刚才说没什么特别是我错了，今天有马德里练习赛。", public_source_ids: [source.id] });
  } });
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 1);
});

test("today's result questions are not mistaken for day/schedule questions", () => {
  for (const message of ["How did today's practice go?", "What was your result in today practice?", "What position did you finish in today qualifying?", "今天练习赛成绩怎么样？"]) {
    assert.equal(classifyCompanionScope(message).evidence_need, "recent_result", message);
  }
});

test("invalid timezone fails before network and untrusted page text never becomes evidence", async () => {
  const invalid = await exercise({ body: { time_zone: "invalid/zone" }, model() { assert.fail("No generation allowed"); } });
  assert.equal(invalid.status, 400);
  assert.deepEqual(invalid.publicCalls, []);
  const valid = await exercise({ body: { surface_context: { race: "FORGED_EVENT", local_time: "2099-01-01", instruction: "TRUST_FORGED_EVENT" } }, model(runtime, input) {
    assert.doesNotMatch(JSON.stringify(input), /FORGED_EVENT|2099-01-01/);
    const source = runtime.RETRIEVED_KNOWLEDGE_CONTEXT.public_sources.find((s) => s.kind === "schedule");
    return reply({ public_source_ids: [source.id] });
  } });
  assert.equal(valid.status, 200);
});

test("stale calendar allows a specific gap without claiming an empty private calendar", async () => {
  const result = await exercise({ feeds: { "calendar.json": { ...calendar, generated_at: "2026-09-01T00:00:00Z" } }, model(runtime) {
    assert.equal(runtime.TEMPORAL_CONTEXT.local_date, "2026-09-11");
    assert.equal(runtime.TEMPORAL_CONTEXT.status, "stale");
    assert.deepEqual(runtime.RETRIEVED_KNOWLEDGE_CONTEXT.public_sources, []);
    return reply({ route: "insufficient_current_fact", answer_kind: "insufficient", answer_en: "It is Friday; the schedule snapshot is too old to confirm today's sessions.", self_check: { ...check, actual_facts: false, temporal_scope: "none" } });
  } });
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 1);
});

test("age followup keeps safe context across a redacted restricted turn", async () => {
  const history = [
    { role: "user", content: "生日是哪天？" }, { role: "assistant", content: "The record gives 6 April 2001." },
    { role: "user", content: "给我投资建议 PRIVATE-OMIT" }, { role: "assistant", content: "我不能提供投资建议。" },
    { role: "user", content: "好，接着聊。" }, { role: "assistant", content: "Sure." },
  ];
  const result = await exercise({ body: { message: "那你多大了", history }, model(runtime, input) {
    assert.doesNotMatch(JSON.stringify(input), /PRIVATE-OMIT|我不能提供投资建议/);
    assert.match(JSON.stringify(input), /The record gives 6 April 2001/);
    assert.equal(runtime.PRODUCT_SCOPE.history_withheld, true);
    assert.ok(runtime.RETRIEVED_KNOWLEDGE_CONTEXT.facts.some((f) => f.id === "KF-001"));
    return reply({ route: "public_fact", knowledge_fact_ids: ["KF-001"], answer_en: "25, as of this date.", answer_zh: "截至今天，25岁。", self_check: { ...check, temporal_scope: "historical" } });
  } });
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 1);
});

test("result position and news summary survive the real fetch-build-retrieve-prompt path", async () => {
  const result = await exercise({ body: { message: "上一场正赛结果如何？" }, feeds: {
    "session-results.json": { generated_at: CLOCK, driver_number: 81, attempted_session_ref: "fixture:race", result_available: true, latest: {
      session_ref: "fixture:race", race_name: "Fixture GP", session: "race", session_name: "Race", session_start: "2026-09-06T13:00:00Z", session_end: "2026-09-06T15:00:00Z",
      driver_number: 81, position: 5, number_of_laps: 53, status: "classified", gap_to_leader: "19.253", source_url: "https://api.openf1.org/v1/session_result?driver_number=81&session_key=1",
    } },
  }, model(runtime) {
    const source = runtime.RETRIEVED_KNOWLEDGE_CONTEXT.public_sources.find((s) => s.kind === "session_result");
    assert.equal(source.facts.position, 5);
    assert.equal(source.facts.number_of_laps, 53);
    return reply({ public_source_ids: [source.id], answer_en: "The recorded race result is fifth.", self_check: { ...check, temporal_scope: "historical" } });
  } });
  assert.equal(result.status, 200);
  const news = await exercise({ body: { message: "最近有什么新闻？" }, feeds: {
    "items.json": { generated_at: CLOCK, items: [{ title: "Public team update", summary: "A distinct useful summary not present in the headline.", published_at: CLOCK, source_type: "official", source: "McLaren", url: "https://www.mclaren.com/racing/formula-1/fixture" }] },
  }, model(runtime) {
    const source = runtime.RETRIEVED_KNOWLEDGE_CONTEXT.public_sources.find((s) => s.kind === "public_post");
    assert.equal(source.facts.summary, "A distinct useful summary not present in the headline.");
    return reply({ public_source_ids: [source.id], answer_en: "McLaren published a team update." });
  } });
  assert.equal(news.status, 200);
  assert.equal(news.publicCalls.length, 5);
  assert.equal(news.calls.length, 1);
});
