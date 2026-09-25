import test from "node:test";
import assert from "node:assert/strict";
import { retrieveCompanionKnowledge } from "../src/companion-knowledge.js";
import { COMPANION_RUNTIME_DATA, COMPANION_SOURCE_CATALOG } from "../src/companion-runtime.js";

const retrieve = (message, history = []) => retrieveCompanionKnowledge({
  message, history, runtimeData: COMPANION_RUNTIME_DATA, sourceCatalog: COMPANION_SOURCE_CATALOG,
  now: new Date("2026-09-25T00:00:00Z"),
});

test("Hungarian public reaction and quote follow-up preserve the dated statement and locator", () => {
  const question = "2024 年匈牙利大奖赛拿到 F1 首胜时，你当时公开表达过哪些感受？请依据公开材料，不补写内心活动。";
  for (const knowledge of [retrieve(question), retrieve("能给一句能核实出处的当时英文原话吗？没有原文就不要补写。", [
    { role: "user", content: question },
    { role: "assistant", content: "Synthetic continuity only; it is not evidence." },
  ])]) {
    const statement = knowledge.facts.find(item => item.id === "KF-038");
    assert.equal(statement.record_type, "public_statement");
    assert.equal(statement.speaker, "Oscar Piastri");
    assert.equal(statement.statement_date, "2024-07-21");
    assert.equal(statement.verbatim_excerpt_en, "Very, very special.");
    assert.equal(statement.source_locator.section, "TRACK INTERVIEWS");
    assert.equal(statement.source_locator.source_id, "KS-029");
    assert.deepEqual(statement.source_ids, ["KS-029"]);
    assert.equal(knowledge.source_catalog.find(source => source.id === "KS-029").url,
      "https://www.fia.com/news/f1-2024-hungarian-grand-prix-post-race-press-conference-transcript");
    assert.ok(statement.answer_limits.some(limit => limit.includes("not transfer them to another event")));
    assert.ok(statement.answer_limits.some(limit => limit.includes("paraphrases, not additional quotations")));
    assert.equal(knowledge.facts.find(item => item.id === "KF-012").verbatim_excerpt_en, undefined);
  }
});

test("legacy dated preference paraphrase remains available without requiring new quote metadata", () => {
  const knowledge = retrieve("你公开说过喜欢什么菜系吗？意大利菜？");
  assert.ok(knowledge.facts.some(item => item.id === "KF-029"));
  assert.equal(knowledge.facts.find(item => item.id === "KF-029").verbatim_excerpt_en, undefined);
});
