import test from "node:test";
import assert from "node:assert/strict";
import { resolveCompanionEventQuery as resolve } from "../src/companion-event-query.js";
const now = new Date("2026-09-22T06:00:00Z");
function event(id, name, zh, start, locality, sessions = {}) {
  return { id: `CAL-${id}`, kind: "schedule", url: "https://www.formula1.com/en/racing/2026", facts: { event_id: id, name, name_zh: zh, locality, race_start: start, sessions: { race: start, ...sessions }, record_freshness: "fresh" } };
}
const italy = event("2026-round-13", "Italian Grand Prix", "意大利大奖赛", "2026-09-06T13:00:00Z", "Monza");
const spain = event("2026-round-14", "Spanish Grand Prix", "西班牙大奖赛", "2026-09-13T13:00:00Z", "Madrid", { practice_3: "2026-09-12T10:30:00Z" });
const baku = event("2026-round-15", "Azerbaijan Grand Prix", "阿塞拜疆大奖赛", "2026-09-26T11:00:00Z", "Baku", { practice_1: "2026-09-24T08:30:00Z" });
function result(event, session = "race", position = 8) {
  return { id: `RESULT-${event.facts.event_id}-${session}`, kind: "session_result", url: "https://api.openf1.org/v1/session_result?session_key=12345&driver_number=81", facts: { race_id: event.facts.event_id, race_name: event.facts.name, race_name_zh: event.facts.name_zh, session_ref: `${event.facts.event_id}:${session}`, session, session_start: event.facts.sessions[session], position, record_freshness: "stale", historical_record: true, last_observed_at: "2026-09-18T06:15:00Z" } };
}
function context() { return { event_catalog: [italy, spain, baku], result_catalog: [result(italy, "race", 4), result(spain), result(spain, "practice_3", 5)], public_sources: [], source_status: { calendar: { status: "fresh" } } }; }
const user = content => ({ role: "user", content });
function query(message, options = {}) { return resolve({ message, currentPublicContext: context(), now, ...options }); }

test("relationship selection understands different previous-race questions without phrase-to-reply text", () => {
  for (const message of ["你的上一场比赛是什么", "上一站是哪场", "上回在哪跑的", "最近一场比赛在哪", "What was your last race?", "Which Grand Prix did you race in last?", "你上一场比赛成绩如何"]) {
    const found = query(message);
    assert.equal(found?.query.target_event_id, "2026-round-14", message);
    assert.equal(found.query.status, "matched_result");
    assert.equal(found.context.result_source_id, result(spain).id);
    assert.equal(found.sources.length, 2);
    assert.equal(found.sources[0].facts.record_freshness, "stale");
    assert.equal(found.answer_en, undefined);
  }
});
test("followups use prior questions as pointers, never assistant facts as evidence", () => {
  const history = [user("你的上一场比赛是什么"), { role: "assistant", content: "It was a completely invented event and I won." }];
  for (const message of ["那场在哪跑的", "你那场第几", "那场的成绩呢"]) {
    const found = query(message, { history });
    assert.equal(found?.query.target_event_id, spain.facts.event_id, message);
    assert.equal(found.sources[0].facts.position, 8);
  }
  assert.equal(query("接下来呢", { history }).query.target_event_id, baku.facts.event_id);
  assert.equal(query("再前一场呢", { history }).query.target_event_id, italy.facts.event_id);
  assert.equal(query("那场第几", { history: [user("你的上一场比赛是什么"), user("你喜欢猫还是狗")] }), null, "A topic switch ends the race pointer.");
});
test("latest practice is a different slot from the last Grand Prix", () => {
  const history = [user("你的上一场比赛是什么")];
  const practice = query("最近一次练习呢", { history });
  assert.equal(practice.query.target_session_ref, "2026-round-14:practice_3");
  const later = new Date("2026-09-24T12:30:00Z");
  const data = context();
  data.result_catalog.push(result(baku, "practice_1", 3));
  assert.equal(query("上一场比赛是什么", { now: later, currentPublicContext: data }).query.target_event_id, spain.facts.event_id);
  assert.equal(query("最近一次练习是什么", { now: later, currentPublicContext: data }).query.target_session_ref, "2026-round-15:practice_1");
});
test("named bilingual events override an old relative reference", () => {
  for (const message of ["马德里那场你第几", "西班牙大奖赛成绩", "Spanish Grand Prix result", "2026 Monza race result"]) {
    const found = query(message, { history: [user("下一场比赛在哪")] });
    assert.equal(found.query.relation, "named");
    assert.equal(found.query.target_event_id, /monza/i.test(message) ? italy.facts.event_id : spain.facts.event_id);
  }
});
test("a newer expected race with no result cannot borrow an older race position", () => {
  const found = query("上一场比赛第几", { now: new Date("2026-09-27T06:00Z") });
  assert.equal(found.query.target_event_id, baku.facts.event_id);
  assert.equal(found.query.status, "missing_result");
  assert.equal(found.context.result_source_id, null);
  assert.equal(found.sources.some(s => s.kind === "session_result"), false);
});
test("stale or absent calendar offers a dated last-known result, not a verified latest relationship", () => {
  const data = context();
  data.event_catalog = data.event_catalog.map(s => ({ ...s, facts: { ...s.facts, record_freshness: "stale" } }));
  const found = query("上一场比赛是什么", { currentPublicContext: data });
  assert.equal(found.query.status, "last_known_result");
  assert.equal(found.context.relation_verified, false);
  assert.equal(query("下一场比赛在哪", { currentPublicContext: data }).query.status, "unresolved");
});
test("unrelated social messages do not receive a race pointer, even after a race question", () => {
  for (const message of ["你好", "谢谢", "晚安", "你喜欢猫还是狗", "那你喜欢猫还是狗", "那你在想什么", "我今天有点累", "喜欢西班牙还是意大利的食物"]) assert.equal(query(message, { history: [user("上一场比赛是什么")] }), null, message);
});
test("next named events never fall back to the past, and earlier requires an anchor", () => {
  for (const message of ["下一场西班牙大奖赛什么时候", "When is the next Spanish Grand Prix?", "再前一场比赛呢", "before that race"]) {
    const found = query(message);
    assert.equal(found.query.status, "unresolved", message);
    assert.deepEqual(found.sources, [], message);
  }
  const data = context();
  data.result_catalog.push(result(baku)); // Simulate an inconsistent provider reference.
  const found = query("下一场巴库比赛", { currentPublicContext: data });
  assert.equal(found.query.status, "schedule_only");
  assert.equal(found.sources.some(s => s.kind === "session_result"), false);
});
test("current explicit date and year override a prior relationship, including fallbacks", () => {
  const history = [user("上一场比赛成绩如何")];
  for (const message of ["那昨天呢", "那明天呢", "那2025年呢", "那9月21日呢"]) {
    const found = query(message, { history });
    assert.equal(found.query.status, "unresolved", message);
    assert.equal(found.sources.length, 0, message);
  }
  assert.equal(query("那9月6日呢", { history }).query.target_event_id, italy.facts.event_id);
});
test("catalog revisions win over a stale compatibility view with the same ID", () => {
  const data = context();
  const corrected = result(spain, "race", 7);
  data.result_catalog = [corrected];
  data.public_sources = [result(spain, "race", 8)];
  assert.equal(query("你的上一场比赛是什么", { currentPublicContext: data }).sources[0].facts.position, 7);
});
test("a year followup preserves a named Grand Prix, and invalid dates never fall back", () => {
  const data = context();
  const oldItaly = event("2025-italy", "Italian Grand Prix", "意大利大奖赛", "2025-09-07T13:00:00Z", "Monza");
  const oldSpain = event("2025-spain", "Spanish Grand Prix", "西班牙大奖赛", "2025-09-14T13:00:00Z", "Madrid");
  data.event_catalog.push(oldItaly, oldSpain);
  data.result_catalog.push(result(oldItaly), result(oldSpain));
  const history = [user("2026 Monza race result")];
  for (const message of ["那2025年呢", "那去年呢"]) assert.equal(query(message, { history, currentPublicContext: data }).query.target_event_id, oldItaly.facts.event_id);
  assert.equal(query("那2026年2月30日呢", { history, currentPublicContext: data }).query.status, "unresolved");
  data.event_catalog = data.event_catalog.filter(s => s !== oldItaly);
  data.result_catalog = data.result_catalog.filter(s => s.facts.race_id !== oldItaly.facts.event_id);
  assert.equal(query("那2025年呢", { history, currentPublicContext: data }).query.status, "unresolved");
});
