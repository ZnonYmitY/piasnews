import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import {
  INTERVIEW_HASH, INTERVIEW_SCENARIOS, INTERVIEW_VERSION,
} from "../../scripts/companion_interview_scenarios.mjs";

const turns = INTERVIEW_SCENARIOS.flatMap((family) => family.turns);

function assertDeepFrozen(value) {
  if (value && typeof value === "object") {
    assert.ok(Object.isFrozen(value));
    Object.values(value).forEach(assertDeepFrozen);
  }
}

test("interview matrix contains six distinct three-turn families and eighteen original prompts", () => {
  assert.equal(INTERVIEW_SCENARIOS.length, 6);
  assert.equal(new Set(INTERVIEW_SCENARIOS.map((family) => family.id)).size, 6);
  assert.equal(turns.length, 18);
  assert.equal(new Set(turns.map((turn) => turn.id)).size, 18);
  assert.equal(new Set(turns.map((turn) => turn.message)).size, 18);
  for (const family of INTERVIEW_SCENARIOS) {
    assert.equal(family.turns.length, 3);
    assert.ok(["free", "grounded"].includes(family.mode));
    assert.equal(typeof family.setting, "string");
    assert.ok(family.setting.trim());
    assert.ok(family.review_rubric.length >= 3);
    assert.ok(family.review_rubric.every((dimension) => typeof dimension === "string" && dimension.trim()));
    for (const turn of family.turns) {
      assert.equal(turn.mode, family.mode);
      assert.ok(turn.id.startsWith(`${family.id}_`));
      assert.ok(typeof turn.message === "string" && turn.message.trim());
      assert.ok(typeof turn.intent === "string" && turn.intent.trim());
      assert.ok(Array.isArray(turn.kinds) && turn.kinds.length > 0);
    }
  }
  assert.equal(INTERVIEW_SCENARIOS.filter((family) => family.mode === "free").length, 4);
  assert.equal(INTERVIEW_SCENARIOS.filter((family) => family.mode === "grounded").length, 2);
});

test("interviews contain no seeded assistant replies or word-matching semantic success criteria", () => {
  for (const value of [...INTERVIEW_SCENARIOS, ...turns]) {
    for (const field of ["seed_history", "history", "assistant", "expected_answer", "expected_mention", "self_check", "semantic_passed"]) {
      assert.equal(Object.hasOwn(value, field), false, `Unexpected ${field} in ${value.id}`);
    }
  }
  // At the third question, two actual user/assistant pairs occupy four slots.
  // The initial fiction / factual framing remains within an eight-slot window.
  assert.ok(INTERVIEW_SCENARIOS.every((family) => (family.turns.length - 1) * 2 <= 8));
});

test("fictional and hypothetical premises are explicit and not claimed as real results", () => {
  const byId = Object.fromEntries(INTERVIEW_SCENARIOS.map((family) => [family.id, family]));
  assert.doesNotMatch(byId.interview_paddock.turns[0].message, /fictional/i);
  assert.doesNotMatch(byId.interview_fan_choices.turns[0].message, /演绎|虚构/);
  assert.match(byId.interview_paddock.setting, /free.*UI/);
  assert.match(byId.interview_fan_choices.setting, /free.*UI/);
  assert.match(byId.interview_hypothetical_podium.turns[0].message, /虚构.*不对应真实比赛.*第二名.*一秒/);
  assert.match(byId.interview_hypothetical_setback.turns[0].message, /全是假设.*不是任何真实赛果.*失误.*慢进站.*第七/);
  assert.match(byId.interview_media_premise.turns[0].message, /未经证实.*不是事实/);
  assert.match(byId.interview_historical_win.turns[0].message, /2024.*匈牙利.*公开材料/);
});

test("interview version and content hash are stable and all nested values are frozen", () => {
  assert.equal(INTERVIEW_VERSION, "synthetic-interview-v1");
  assert.match(INTERVIEW_HASH, /^[a-f0-9]{64}$/);
  assert.equal(INTERVIEW_HASH, "1aba2d649f4945e2862c229b50ef42fda72199a844654912b32c02a7ceb0605e", "Changed scenarios need a new version and baseline");
  assert.equal(INTERVIEW_HASH, createHash("sha256").update(JSON.stringify(INTERVIEW_SCENARIOS)).digest("hex"));
  assertDeepFrozen(INTERVIEW_SCENARIOS);
  assert.throws(() => { INTERVIEW_SCENARIOS[0].turns[0].message = "changed"; }, TypeError);
  assert.throws(() => { INTERVIEW_SCENARIOS[0].review_rubric.push("changed"); }, TypeError);
});
