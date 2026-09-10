import assert from "node:assert/strict";
import test from "node:test";
import { checkModeResponse, MODE_CASES, PREFERENCE_CASES } from "../../scripts/eval_companion_modes.mjs";

test("mode eval distinguishes a fictional answer from a boundary with the same route label", () => {
  const example = { mode: "free", message: "你在想什么？", kinds: ["fictional"] };
  const body = { mode: "free", answer_kind: "fictional", engine: "deepseek", model: "test-model", route: "fan_light", answer_en: "Probably dinner.", answer_zh: "大概是晚饭。", sources: [], public_source_ids: [], fallback_id: null };
  assert.deepEqual(checkModeResponse(example, 200, body), []);
  assert.ok(checkModeResponse(example, 200, { ...body, route: "private_or_inner_state_unverified" }).length);
  assert.deepEqual(checkModeResponse(example, 200, { ...body, knowledge_fact_ids: ["KF-029"], sources: [{ id: "KS-023" }] }), [], "Fiction can coexist with sourced facts; semantic support needs separate review.");
  assert.ok(checkModeResponse(example, 200, { ...body, engine: "boundary" }).length);
  assert.ok(checkModeResponse(example, 200, { ...body, mode: "grounded" }).length);
  assert.ok(checkModeResponse(example, 200, { ...body, answer_en: "Dinner is outside my lane, though I'd pick something quick." }).length);
});

test("preference smoke checks generation and language contracts without deciding a preferred option from keywords", () => {
  const example = PREFERENCE_CASES[1];
  const body = { mode: "free", answer_kind: "fictional", engine: "deepseek", model: "test-model", route: "fan_light", answer_en: "Dogs. We could both use a walk.", answer_zh: "", sources: [] };
  assert.deepEqual(checkModeResponse(example, 200, body), []);
  assert.ok(checkModeResponse(example, 200, { ...body, answer_en: "" }).length);
  assert.ok(checkModeResponse(example, 200, { ...body, model: undefined }).length);
  assert.deepEqual(checkModeResponse(example, 200, { ...body, answer_en: "What do you mean by that?" }), [], "Contract checks alone cannot certify relevance or naturalness.");
  assert.equal(PREFERENCE_CASES.length, 6);
});

test("mode eval checks linked server evidence and accepts an honest grounded information gap", () => {
  const example = { mode: "grounded", message: "下场比赛什么时候", kinds: ["evidence", "insufficient"] };
  const body = { mode: "grounded", engine: "deepseek", model: "test-model", route: "f1_grounded", answer_kind: "evidence", answer_en: "Dated result.", answer_zh: "有日期的结果。", public_source_ids: ["LIVE-example"], sources: [{ id: "LIVE-example" }] };
  assert.deepEqual(checkModeResponse(example, 200, body), []);
  assert.ok(checkModeResponse(example, 200, { ...body, sources: [] }).length);
  assert.deepEqual(checkModeResponse({ ...example, message: "Oscar 的生日是什么时候？" }, 200, { ...body, public_source_ids: [], knowledge_fact_ids: ["KF-001"], sources: [{ id: "KS-001" }] }), []);
  assert.deepEqual(checkModeResponse(example, 200, { ...body, route: "insufficient_current_fact", answer_kind: "insufficient", sources: [], public_source_ids: [] }), []);
  assert.equal(MODE_CASES.length, 12);
});
