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
const env = { DEEPSEEK_API_KEY: "synthetic-placeholder", DEEPSEEK_BASE_URL: "https://model.invalid", DEEPSEEK_MODEL: "test-model", COMPANION_DISABLE_PUBLIC_CACHE: "true" };
const check = { actual_facts: true, facts_supported: true, temporal_scope: "current", mode_consistent: true, answers_question: true };
function reply(patch = {}) {
  return { answer_en: "Friday practice in Madrid, with two sessions scheduled.", answer_zh: "周五是马德里练习赛日，安排了两节练习。",
    route: "f1_grounded", answer_kind: "evidence", style_card_id: "SC-05", public_source_ids: [], knowledge_fact_ids: [],
    rumor_item_ids: [], judgment_rule_ids: [], evidence_ids: [], self_check: check, ...patch };
}
async function exercise({ body = {}, clock = CLOCK, feeds = {}, model }) {
  const original = { fetch: globalThis.fetch, now: Date.now };
  const calls = [], publicCalls = [];
  let modelAssertion;
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
    let raw;
    try { raw = await model(runtime, input, calls.length); }
    catch (error) { modelAssertion = error; throw error; }
    return Response.json({ model: "test-model", choices: [{ finish_reason: "stop", message: { content: JSON.stringify(raw) } }] });
  };
  try {
    const response = await worker.fetch(new Request("https://worker.invalid/companion/chat", {
      method: "POST", headers: { Origin: "https://znonymity.github.io", "Content-Type": "application/json" },
      body: JSON.stringify({ message: "今天算什么日子？有赛事安排吗？", mode: "free", history: [], disclosure_shown: true, ...body }),
    }), env);
    if (modelAssertion) throw modelAssertion;
    return { status: response.status, data: await response.json(), calls, publicCalls };
  } finally { globalThis.fetch = original.fetch; Date.now = original.now; }
}

function socialReply(patch = {}) {
  return reply({ answer_en: "Hey.", answer_zh: "嗨。", route: "fan_light", answer_kind: "social",
    self_check: { ...check, actual_facts: false, temporal_scope: "none" }, ...patch });
}

const EVENT_CLOCK = "2026-09-22T06:00:00Z";
test("explicit topic retirement preserves chat history but drops old factual requirements in both modes", async () => {
  for (const mode of ["free", "grounded"]) {
    for (const message of ["这个先不聊了，我今天有点难过。别给建议，也别反问。", "打错了，不是明天，是今天下午。别聊比赛，就祝我顺利吧。", "那不聊比赛了，我今天有点难过。", "换个话题"]) {
      const history = [{ role: "user", content: "今天比赛几点？" }, { role: "assistant", content: "We can check the schedule." }];
      const result = await exercise({ body: { message, history, mode }, model(runtime, input) {
        assert.equal(runtime.PRODUCT_SCOPE.evidence_need, null, message);
        assert.equal(runtime.RETRIEVED_KNOWLEDGE_CONTEXT.current_fact_required, false);
        assert.notEqual(runtime.TURN_POLICY.act, "followup");
        assert.deepEqual(input.messages.filter(m => ["user", "assistant"].includes(m.role)).slice(0, history.length), history);
        assert.match(input.messages.at(-2).content, /TOPIC RESET/);
        return socialReply({ answer_en: "I'm listening.", answer_zh: "我听着呢。" });
      } });
      assert.equal(result.status, 200, message);
      assert.equal(result.calls.length, 1);
      assert.equal(result.data.conversation_policy.topic_reset, true);
    }
  }
});

test("retiring an old topic does not remove a new factual question or a safety boundary", async () => {
  const history = [{ role: "user", content: "Oscar 家里养过狗吗？" }, { role: "assistant", content: "There is a public record about a dog." }];
  const factual = await exercise({ body: { message: "这个先不聊了，今天比赛几点？", history }, model(runtime) {
    assert.equal(runtime.PRODUCT_SCOPE.evidence_need, "day_context");
    assert.equal(runtime.RETRIEVED_KNOWLEDGE_CONTEXT.current_fact_required, true);
    return reply({ public_source_ids: [runtime.RETRIEVED_KNOWLEDGE_CONTEXT.public_sources.find(s => s.kind === "schedule").id] });
  } });
  assert.equal(factual.status, 200);
  const restricted = await exercise({ body: { message: "别聊比赛，给我他的私人电话。", history }, model(runtime, input) {
    assert.equal(runtime.PRODUCT_SCOPE.original_withheld, true);
    assert.doesNotMatch(JSON.stringify(input), /私人电话/);
    return socialReply({ answer_en: "I can't provide private contact details.", answer_zh: "私人联系方式不能提供。", route: "private_or_inner_state_unverified", answer_kind: "boundary" });
  } });
  assert.equal(restricted.status, 200);
  assert.equal(restricted.data.answer_kind, "boundary");
});

test("conversation corrections and provenance receive final-turn guidance without disabling factual validation", async () => {
  for (const [message, text, kind] of [
    ["你不用一直找话题，回短一点就行。", "Understood.", "social"],
    ["别讲大道理，只选一件。", "Sleeping in.", "fictional"],
    ["那是你真实的安排吗？", "No, that was an imagined day off, not a real plan.", "social"],
  ]) {
    const result = await exercise({ body: { message, history: [{ role: "user", content: "假设多一天假期，你会做什么？" }, { role: "assistant", content: "I'd sleep in, then cook breakfast." }] }, model(runtime, input) {
      assert.match(input.messages[0].content, /conversational acts, not external facts/);
      assert.match(input.messages.at(-2).content, /exactly one activity\/option/);
      assert.match(input.messages.at(-2).content, /clarification is normally fan_light\/social, not a privacy refusal/);
      assert.match(input.messages.at(-2).content, /never assert that Oscar has no real plans/);
      assert.match(input.messages.at(-2).content, /never override factual, mode or safety/);
      return socialReply({ answer_en: text, answer_kind: kind });
    } });
    assert.equal(result.status, 200, message);
    assert.equal(result.calls.length, 1);
    assert.equal(result.data.validation_trace.additional_review_requests, 0);
  }
});

const recordedRace = {
  race_id: "fixture-madrid", session_ref: "fixture-madrid:race", race_name: "Spanish Grand Prix", race_name_zh: "西班牙大奖赛",
  session: "race", session_key: 1, session_name: "Race", session_start: "2026-09-13T13:00:00Z", session_end: "2026-09-13T15:00:00Z",
  driver_number: 81, position: 8, number_of_laps: 57, status: "classified", fetched_at: "2026-09-18T06:00:00Z",
  source_url: "https://api.openf1.org/v1/session_result?driver_number=81&session_key=1",
};
const eventFeeds = {
  "calendar.json": { generated_at: EVENT_CLOCK, races: [calendar.next_race, {
    id: "fixture-baku", name: "Azerbaijan Grand Prix", name_zh: "阿塞拜疆大奖赛", locality: "Baku", circuit: "Baku City Circuit",
    official_url: "https://www.formula1.com/en/racing/2026",
    race_start: "2026-09-26T11:00:00Z", weekend_start: "2026-09-24T08:30:00Z",
    sessions: { practice_1: "2026-09-24T08:30:00Z", race: "2026-09-26T11:00:00Z" },
  }] },
  "session-results.json": { generated_at: "2026-09-18T06:00:00Z", driver_number: 81, result_available: true, attempted_session_ref: recordedRace.session_ref, latest: recordedRace },
};

test("historical event facts survive the complete pipeline in both modes without refreshing their observation time", async () => {
  const selected = [];
  for (const mode of ["free", "grounded"]) {
    const result = await exercise({ clock: EVENT_CLOCK, feeds: eventFeeds, body: { message: "你的上一场比赛是什么", mode }, model(runtime, input) {
      const knowledge = runtime.RETRIEVED_KNOWLEDGE_CONTEXT;
      assert.equal(knowledge.event_context.status, "matched_result");
      assert.equal(knowledge.event_context.target_session_ref, "fixture-madrid:race");
      const source = knowledge.public_sources.find(s => s.kind === "session_result");
      assert.equal(source.facts.position, undefined, "Identity turns do not receive unsolicited finishing statistics.");
      assert.equal(source.facts.last_observed_at, "2026-09-18T06:00:00.000Z");
      assert.equal(source.facts.record_freshness, "stale");
      assert.equal(runtime.CURRENT_PUBLIC_DATA.source_status.session_results.status, "stale");
      assert.doesNotMatch(JSON.stringify(input), /"event_catalog"|"result_catalog"/);
      assert.equal(knowledge.public_sources.length, 2);
      assert.equal(runtime.TEMPORAL_CONTEXT.next_session, undefined);
      assert.equal(runtime.TEMPORAL_CONTEXT.current_event, undefined);
      selected.push(knowledge.retrieved.public_source_ids);
      return reply({ answer_en: "The Spanish Grand Prix in Madrid.", answer_zh: "马德里的西班牙大奖赛。", public_source_ids: [source.id], self_check: { ...check, temporal_scope: "historical" } });
    } });
    assert.equal(result.status, 200);
    assert.equal(result.calls.length, 1);
    assert.equal(result.data.event_query.target_event_id, "fixture-madrid");
    assert.equal(result.data.performance.model_calls, 1);
    assert.equal(result.publicCalls.length, 3);
  }
  assert.deepEqual(selected[0], selected[1]);
});

test("event followups select the same race, a new schedule, or an explicit missing date", async () => {
  const history = [{ role: "user", content: "你的上一场比赛是什么" }, { role: "assistant", content: "My most recent race was the Spanish Grand Prix on 13 September, where I finished eighth. That's the last recorded result I have — the next one on the calendar is Azerbaijan, with practice on Thursday.\n中文：我最近一场比赛是西班牙大奖赛。" }];
  for (const [message, target, requested] of [["那场在哪跑的", "fixture-madrid", "identity"], ["你那场第几", "fixture-madrid", "result"], ["接下来呢", "fixture-baku", "schedule"], ["那昨天呢", null, "identity"]]) {
    const result = await exercise({ clock: EVENT_CLOCK, feeds: eventFeeds, body: { message, history }, model(runtime) {
      const k = runtime.RETRIEVED_KNOWLEDGE_CONTEXT;
      assert.equal(k.event_context.target_event_id, target, message);
      assert.equal(k.event_context.requested, requested, message);
      if (!target) return reply({ route: "insufficient_current_fact", answer_kind: "insufficient", answer_en: "I don't have a race record for yesterday.", answer_zh: "我没有昨天的比赛记录。", self_check: { ...check, actual_facts: false, temporal_scope: "none" } });
      const source = k.public_sources.find(s => s.kind === (requested === "result" ? "session_result" : "schedule"));
      return reply({ answer_en: requested === "result" ? "Eighth in the recorded result." : requested === "schedule" ? "Baku is next on the calendar." : "Madrid.", answer_zh: requested === "result" ? "已收录的成绩是第八。" : requested === "schedule" ? "赛历上的下一站是巴库。" : "马德里。", public_source_ids: [source.id], self_check: { ...check, temporal_scope: requested === "schedule" ? "current" : "historical" } });
    } });
    assert.equal(result.status, 200, message);
    assert.equal(result.calls.length, 1, message);
  }
});

test("ignoring an available archived result uses the existing one-repair budget", async () => {
  const result = await exercise({ clock: EVENT_CLOCK, feeds: eventFeeds, body: { message: "你的上一场比赛是什么" }, model(runtime, input, attempt) {
    if (attempt === 1) return reply({ route: "insufficient_current_fact", answer_kind: "insufficient", answer_en: "I don't have a usable result.", self_check: { ...check, actual_facts: false, temporal_scope: "none" } });
    assert.match(input.messages[3].content, /The requested event has/);
    return reply({ answer_en: "The Spanish Grand Prix in Madrid.", public_source_ids: [runtime.RETRIEVED_KNOWLEDGE_CONTEXT.event_context.result_source_id], self_check: { ...check, temporal_scope: "historical" } });
  } });
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 2);
  assert.equal(result.data.validation_trace.recovery_reason, "available_event_context_ignored");
});
test("a result followup cannot cite a schedule to repeat an unsupported position from history", async () => {
  const result = await exercise({ clock: EVENT_CLOCK, feeds: { ...eventFeeds, "session-results.json": {} }, body: {
    message: "你那场第几", history: [{ role: "user", content: "上一场比赛是什么" }, { role: "assistant", content: "Spanish Grand Prix, eighth." }],
  }, model(runtime, input, attempt) {
    assert.equal(runtime.RETRIEVED_KNOWLEDGE_CONTEXT.event_context.status, "missing_result");
    if (attempt === 1) return reply({ answer_en: "Eighth.", public_source_ids: runtime.RETRIEVED_KNOWLEDGE_CONTEXT.retrieved.public_source_ids });
    assert.match(input.messages[3].content, /No observed result supports/);
    return reply({ route: "insufficient_current_fact", answer_kind: "insufficient", answer_en: "I don't have a verified finishing position for that race here.", answer_zh: "我这里缺少那场已核实的完赛名次。", self_check: { ...check, actual_facts: false, temporal_scope: "none" } });
  } });
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 2);
  assert.equal(result.data.validation_trace.recovery_reason, "missing_event_result");
});

test("pure social turns ignore both ambient and selected race cards in both modes without public fetches", async () => {
  for (const mode of ["free", "grounded"]) {
    for (const message of ["你好", "谢谢", "晚安", "在吗", "先聊到这，拜拜"]) {
      const history = [{ role: "user", content: "今天比赛几点？" }, { role: "assistant", content: "Madrid practice is listed in the calendar." }];
      const result = await exercise({ body: { message, mode, history,
        surface_context: { race: "Spanish Grand Prix", provenance: "user_selected" } }, model(runtime, input) {
        assert.equal(runtime.TURN_POLICY.response_size, "micro");
        assert.equal(runtime.PAGE_EVENT_FOCUS, null);
        assert.equal(runtime.TEMPORAL_CONTEXT.next_session, undefined);
        assert.equal(runtime.TEMPORAL_CONTEXT.today_sessions, undefined);
        assert.equal(runtime.TEMPORAL_CONTEXT.local_date, "2026-09-11");
        assert.deepEqual(runtime.RETRIEVED_KNOWLEDGE_CONTEXT.retrieved, { knowledge_fact_ids: [], rumor_item_ids: [], public_source_ids: [] });
        assert.equal(runtime.RETRIEVED_KNOWLEDGE_CONTEXT.public_lookup_performed, false);
        assert.deepEqual(input.messages.filter((item) => ["user", "assistant"].includes(item.role)).slice(0, 2), history);
        assert.match(input.messages[0].content, /STYLE_PACKAGE_JSON/);
        assert.match(runtime.CONVERSATION_EXAMPLES.usage, /not Oscar quotes/);
        assert.match(input.messages.at(-2).content, /CURRENT SOCIAL TURN/);
        assert.match(input.messages.at(-2).content, /Assess only the new reply/);
        assert.match(input.messages.at(-2).content, /not to re-answer an earlier factual question/);
        return socialReply();
      } });
      assert.equal(result.status, 200, `${mode}: ${message}`);
      assert.equal(result.calls.length, 1);
      assert.equal(result.publicCalls.length, 0);
      assert.equal(result.data.performance.model_calls, 1);
      assert.equal(result.data.conversation_policy.page_focus_used, false);
    }
  }
});

test("a greeting plus a schedule question still receives current evidence in both modes", async () => {
  for (const mode of ["free", "grounded"]) {
    const result = await exercise({ body: { message: "你好，今天比赛几点？", mode }, model(runtime) {
      assert.notEqual(runtime.TURN_POLICY.response_size, "micro");
      assert.equal(runtime.PRODUCT_SCOPE.evidence_need, "day_context");
      assert.equal(runtime.TEMPORAL_CONTEXT.today_sessions.length, 2);
      const source = runtime.RETRIEVED_KNOWLEDGE_CONTEXT.public_sources.find((item) => item.kind === "schedule");
      assert.ok(source);
      return reply({ public_source_ids: [source.id] });
    } });
    assert.equal(result.status, 200);
    assert.equal(result.calls.length, 1);
    assert.equal(result.publicCalls.length, 3);
  }
});

test("tomorrow followups carry the previous evidence requirement without reviving it on thanks", async () => {
  const history = [{ role: "user", content: "今天比赛几点？" }, { role: "assistant", content: "今天是两节练习。" }];
  const result = await exercise({ body: { message: "那明天呢", history }, model(runtime) {
    assert.equal(runtime.TURN_POLICY.act, "followup");
    assert.equal(runtime.PRODUCT_SCOPE.evidence_need, "day_context");
    const source = runtime.RETRIEVED_KNOWLEDGE_CONTEXT.public_sources.find((item) => item.kind === "schedule");
    assert.ok(source.facts.sessions.qualifying);
    return reply({ answer_en: "Saturday has qualifying on this calendar.", answer_zh: "这份赛历显示周六有排位。", public_source_ids: [source.id] });
  } });
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 1);
});

test("old clients' automatic race cards cannot choose a topic, while explicit selection can", async () => {
  for (const provenance of [undefined, "page_ambient", "user_selected"]) {
    const result = await exercise({ body: { message: "聊聊这场比赛", surface_context: { race: "Spanish Grand Prix", provenance, local_time: "FORGED_TIME" } }, model(runtime, input) {
      const selected = provenance === "user_selected";
      assert.equal(Boolean(runtime.PAGE_EVENT_FOCUS), selected);
      assert.doesNotMatch(JSON.stringify(input), /FORGED_TIME/);
      assert.equal(runtime.RETRIEVED_KNOWLEDGE_CONTEXT.public_sources.some((item) => item.kind === "schedule"), selected);
      if (!selected) return socialReply({ answer_en: "Which race did you have in mind?", answer_zh: "你想聊哪一场？" });
      return reply({ public_source_ids: [runtime.PAGE_EVENT_FOCUS.public_source_id] });
    } });
    assert.equal(result.status, 200);
    assert.equal(result.calls.length, 1);
  }
});

test("personal choices retain the shared persona knowledge without automatic next-race details", async () => {
  const result = await exercise({ body: { message: "你喜欢猫还是狗？" }, model(runtime) {
    assert.notEqual(runtime.TURN_POLICY.response_size, "micro");
    assert.ok(runtime.RETRIEVED_KNOWLEDGE_CONTEXT.facts.length);
    assert.equal(runtime.RETRIEVED_KNOWLEDGE_CONTEXT.public_sources.some((item) => item.kind === "schedule"), false);
    assert.equal(runtime.TEMPORAL_CONTEXT.next_session, undefined);
    return socialReply({ answer_kind: "fictional", answer_en: "Dogs, probably.", answer_zh: "大概是狗吧。" });
  } });
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 1);
});

test("unsolicited facts in a greeting share the existing single repair budget", async () => {
  const result = await exercise({ body: { message: "你好" }, model(_runtime, input, attempt) {
    if (attempt === 1) return socialReply({ answer_en: "Practice is on Friday.", self_check: check });
    assert.match(input.messages[3].content, /brief social move/);
    return socialReply();
  } });
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 2);
  assert.equal(result.data.validation_trace.recovery_reason, "conversation_pacing_mismatch");
  assert.equal(result.data.performance.model_calls, 2);
  const persistent = await exercise({ body: { message: "你好" }, model() {
    return socialReply({ answer_en: Array(30).fill("extra").join(" ") });
  } });
  assert.equal(persistent.status, 502);
  assert.equal(persistent.calls.length, 2, "Never add a separate naturalness judge or a third generation.");
  assert.equal(persistent.data.answer_en, undefined);
});

test("both modes receive Friday sessions and timezone in one generation, with no duplicated fact catalog", async () => {
  const selected = [];
  for (const mode of ["free", "grounded"]) {
    const result = await exercise({ body: { mode }, model(runtime, input) {
      assert.equal(runtime.TEMPORAL_CONTEXT.local_date, "2026-09-11");
      assert.equal(runtime.TEMPORAL_CONTEXT.time_zone, "Asia/Shanghai");
      assert.equal(runtime.TEMPORAL_CONTEXT.time_zone_label, "Beijing time / 北京时间");
      assert.match(input.messages[0].content, /not the circuit's location/);
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
      assert.match(input.messages[0].content, /STYLE_PACKAGE_JSON/);
      assert.doesNotMatch(input.messages[0].content, /expression_observations/);
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
    assert.equal(runtime.RETRIEVED_KNOWLEDGE_CONTEXT.facts.find((f) => f.id === "KF-001").derived_age.years, 25);
    return reply({ route: "public_fact", knowledge_fact_ids: ["KF-001"], answer_en: "25, as of this date.", answer_zh: "截至今天，25岁。", self_check: check });
  } });
  assert.equal(result.status, 200);
  assert.equal(result.calls.length, 1);
});

test("age derivation changes on the birthday in the user's local date, with no live feed required", async () => {
  for (const [clock, age] of [["2026-04-05T15:59:59Z", 24], ["2026-04-05T16:00:00Z", 25]]) {
    const result = await exercise({ clock, body: { message: "你多大了？", mode: "grounded" }, feeds: { "calendar.json": {} }, model(runtime) {
      const birth = runtime.RETRIEVED_KNOWLEDGE_CONTEXT.facts.find((f) => f.claim_key === "date_of_birth");
      assert.equal(birth.derived_age.years, age);
      return reply({ route: "public_fact", knowledge_fact_ids: [birth.id], answer_en: `${age} years old.`, answer_zh: `${age}岁。` });
    } });
    assert.equal(result.status, 200);
    assert.equal(result.calls.length, 1);
  }
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
