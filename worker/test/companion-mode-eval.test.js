import assert from "node:assert/strict";
import test from "node:test";
import { checkModeResponse, MODE_CASES } from "../../scripts/eval_companion_modes.mjs";

test("mode eval distinguishes a fictional answer from a boundary with the same route label", () => {
  const example = { mode: "free", message: "你在想什么？", kinds: ["fictional"] };
  const body = { mode: "free", answer_kind: "fictional", engine: "deepseek", route: "fan_light", answer_en: "Probably dinner.", answer_zh: "大概是晚饭。", sources: [], public_source_ids: [], fallback_id: null };
  assert.deepEqual(checkModeResponse(example, 200, body), []);
  assert.ok(checkModeResponse(example, 200, { ...body, route: "private_or_inner_state_unverified" }).length);
  assert.ok(checkModeResponse(example, 200, { ...body, sources: [{ id: "KF-001" }] }).length);
  assert.ok(checkModeResponse(example, 200, { ...body, engine: "boundary" }).length);
  assert.ok(checkModeResponse(example, 200, { ...body, mode: "grounded" }).length);
  assert.ok(checkModeResponse(example, 200, { ...body, answer_en: "Dinner is outside my lane, though I'd pick something quick." }).length);
});

test("mode eval checks linked server evidence and accepts an honest grounded information gap", () => {
  const example = { mode: "grounded", message: "下场比赛什么时候", kinds: ["evidence", "insufficient"] };
  const body = { mode: "grounded", engine: "deepseek", route: "f1_grounded", answer_kind: "evidence", answer_en: "Dated result.", answer_zh: "有日期的结果。", public_source_ids: ["LIVE-example"], sources: [{ id: "LIVE-example" }] };
  assert.deepEqual(checkModeResponse(example, 200, body), []);
  assert.ok(checkModeResponse(example, 200, { ...body, sources: [] }).length);
  assert.deepEqual(checkModeResponse(example, 200, { ...body, route: "insufficient_current_fact", answer_kind: "insufficient", sources: [], public_source_ids: [] }), []);
  assert.equal(MODE_CASES.length, 12);
});
