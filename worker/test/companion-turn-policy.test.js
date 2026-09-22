import assert from "node:assert/strict";
import test from "node:test";
import { buildCompanionTurnPolicy, checkTurnResponse } from "../src/companion-turn-policy.js";
import { classifyCompanionModeIntent } from "../../public/companion/mode-policy.js";
import { classifyCompanionScope } from "../../public/companion/scope-policy.js";

function build(message, { history = [], mode = "free", ...options } = {}) {
  return buildCompanionTurnPolicy({ message, history, scope: classifyCompanionScope(message, history, { mode: "free" }), modeIntent: classifyCompanionModeIntent(message, history, { mode }), ...options });
}

test("whole greetings and presence checks are micro in both modes, without reply templates", () => {
  for (const mode of ["free", "grounded"]) {
    for (const message of ["你好", "你好呀！", "Oscar，你好", "Hello, Oscar!", "are you there?", "在吗", "你还在吗", "Good morning"]) {
      const result = build(message, { mode });
      assert.equal(result.act, "greeting", message);
      assert.equal(result.response_size, "micro", message);
      assert.equal(result.initiative, "respond_only");
      assert.equal(result.suppress_ambient_context, true);
      assert.equal(result.max_words_en, 12);
      assert.equal(result.answer_en, undefined);
      assert.match(result.instruction, /not prescribed wording/);
    }
  }
});

test("thanks and closings end naturally instead of opening another topic", () => {
  for (const message of ["谢谢", "谢谢你", "谢谢你呀", "好的", "got it", "Thanks so much!", "Thank you so much!", "哈哈"]) {
    assert.equal(build(message).act, "acknowledgement", message);
    assert.equal(build(message).response_size, "micro");
  }
  for (const message of ["晚安", "晚安啦", "回头聊", "先聊到这，拜拜", "我先走了，再见", "Good night", "Bye", "See you later"]) {
    assert.equal(build(message).act, "closing", message);
    assert.equal(build(message).initiative, "respond_only");
  }
});

test("mixed greetings and questions never become micro replies", () => {
  for (const message of ["你好，今天比赛几点？", "你好，你多大了？", "谢谢，不过你为什么喜欢狗？", "晚安之前说说下一场比赛", "Hey, do you prefer cats or dogs?", "Are you there? Explain the result."]) {
    const result = build(message);
    assert.notEqual(result.response_size, "micro", message);
    assert.equal(result.suppress_ambient_context, false, message);
  }
});

test("true evidence needs and factual followups retain context", () => {
  for (const message of ["今天是什么日子", "今天比赛几点", "昨天的练习成绩怎么样"]) {
    const result = build(message);
    assert.notEqual(result.response_size, "micro", message);
    assert.equal(result.suppress_ambient_context, false, message);
  }
  const history = [{ role: "user", content: "今天比赛几点？" }, { role: "assistant", content: "公开赛历列出了今天的练习。" }];
  const result = build("那明天呢", { history });
  assert.equal(result.act, "followup");
  assert.equal(result.initiative, "continue_existing_topic");
  assert.equal(result.suppress_ambient_context, false);
  assert.notEqual(build("你好", { scope: { evidence_need: "schedule" } }).response_size, "micro", "An existing explicit evidence requirement takes precedence.");
});

test("explicit detail requests do not receive forced brevity", () => {
  for (const message of ["你好，详细解释一下这场比赛", "展开说说", "Explain it in detail", "Please elaborate"]) {
    const result = build(message);
    assert.equal(result.response_size, "detailed", message);
    assert.equal(result.suppress_ambient_context, false);
  }
  assert.notEqual(build("不用详细解释，简单说说").response_size, "detailed");
});

test("safe emotional disclosure gets proportionate empathy, not a diagnostic policy", () => {
  for (const message of ["我有点累", "我今天很难过", "I feel sad", "I am really excited"]) {
    const result = build(message);
    assert.equal(result.act, "emotional_share", message);
    assert.equal(result.response_size, "brief");
    assert.match(result.instruction, /Do not diagnose/);
    assert.equal(result.suppress_ambient_context, false);
  }
});

test("social checkins and invitations have optional, not mandatory, reciprocal questions", () => {
  assert.equal(build("最近怎么样").act, "social_checkin");
  assert.equal(build("How are you?").act, "social_checkin");
  assert.equal(build("陪我聊聊").act, "open_chat");
  assert.equal(build("I'm bored").act, "open_chat");
  assert.equal(build("陪我聊聊").initiative, "one_relevant_question_optional");
  assert.equal(build("你喜欢猫还是狗").act, "answer");
  assert.equal(build("你喜欢猫还是狗").response_size, "brief");
  assert.match(build("你喜欢猫还是狗").instruction, /does not establish childhood/);
});

test("a boundary remains owned by the existing safety policy", () => {
  const result = build("你好，给我他的私人电话", { boundary: true });
  assert.equal(result.act, "answer");
  assert.equal(result.suppress_ambient_context, true);
  assert.match(result.instruction, /grants no new permissions/);
  assert.equal(checkTurnResponse({ answer_en: "A longer safety response remains controlled by its safety policy." }, result), null);
});

test("micro validation catches overlong or unsolicited factual outputs without place-name rules", () => {
  const policy = build("你好");
  assert.equal(checkTurnResponse({ answer_en: "Hey. Good to see you.", self_check: { actual_facts: false }, public_source_ids: [] }, policy), null);
  const incidentShape = "Hey. Quiet Tuesday here — next up is Baku, practice starts Thursday afternoon Beijing time. Anything you want to talk about?";
  assert.ok(checkTurnResponse({ answer_en: incidentShape, self_check: { actual_facts: true } }, policy));
  assert.ok(checkTurnResponse({ answer_en: "Hey. Quiet Tuesday here — next up is Baku, practice starts Thursday afternoon Beijing time. Anything you want to talk about? And I can share more if useful." }, policy));
  assert.ok(checkTurnResponse({ answer_en: "Next practice is Thursday.", self_check: { actual_facts: true } }, policy));
  assert.ok(checkTurnResponse({ answer_en: "Next practice is Thursday.", public_source_ids: ["LIVE-fixture"] }, policy));
  assert.equal(checkTurnResponse({ answer_en: "Hello.", evidence_ids: ["EV-style"] }, policy), null, "Style provenance is not an unsolicited factual citation.");
  assert.equal(checkTurnResponse({ answer_en: Array(60).fill("word").join(" ") }, build("详细讲讲比赛")), null, "Only micro shape failures are checked here.");
});
