import assert from "node:assert/strict";
import test from "node:test";
import { buildCompanionTurnPolicy, checkTurnResponse, extractCompanionTopicReset } from "../src/companion-turn-policy.js";
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

test("explicit topic opt-outs preserve the whole remaining query, including earlier corrections", () => {
  const cases = [
    ["这个先不聊了，我今天有点难过。别给建议，也别反问。", "我今天有点难过。别给建议,也别反问。"],
    ["那不聊比赛了，我今天有点难过。", "我今天有点难过。"],
    ["打错了，不是明天，是今天下午。别聊比赛，就祝我顺利吧。", "打错了,不是明天,是今天下午。就祝我顺利吧。"],
    ["换个话题，别聊比赛，我有点累。", "我有点累。"],
    ["Let's change the subject. I feel sad.", "I feel sad."],
    ["It is this afternoon, not tomorrow. Let’s leave that; just wish me luck.", "It is this afternoon, not tomorrow. just wish me luck."],
  ];
  for (const [message, expected] of cases) assert.equal(extractCompanionTopicReset(message), expected, message);
  for (const message of ["换个话题", "这个先不聊了。", "Let's leave that.", "Let us change the subject!"]) {
    assert.equal(extractCompanionTopicReset(message), "", message);
    const result = build(message);
    assert.equal(result.topic_reset, true);
    assert.equal(result.act, "open_chat");
    assert.notEqual(result.initiative, "continue_existing_topic");
  }
});

test("topic reset stops old-topic followup shaping without deleting history or new factual needs", () => {
  const history = [{ role: "user", content: "今天比赛几点？" }, { role: "assistant", content: "公开赛历列出了今天的练习。" }];
  const originalHistory = structuredClone(history);
  const emotional = build("这个先不聊了，我今天有点难过。别给建议，也别反问。", { history });
  assert.equal(emotional.topic_reset, true);
  assert.equal(emotional.act, "emotional_share");
  assert.notEqual(emotional.initiative, "continue_existing_topic");
  for (const message of ["这个几点开始？", "那明天呢？", "那为什么会这样？", "What about tomorrow?"]) {
    const result = build(message, { history });
    assert.equal(result.topic_reset, false, message);
    assert.equal(result.act, "followup", message);
  }
  for (const message of ["这个先不聊了，下一场比赛什么时候？", "别聊比赛，告诉我下一场的时间。", "换个话题，详细解释一下车手积分规则。", "Let's change the subject. Explain the next race in detail."]) {
    const result = build(message, { history, scope: { evidence_need: "schedule" } });
    assert.equal(result.topic_reset, true, message);
    assert.notEqual(result.act, "followup", message);
    assert.equal(result.suppress_ambient_context, false, message);
    assert.notEqual(result.response_size, "micro", message);
    if (/详细|in detail/.test(message)) assert.equal(result.response_size, "detailed", message);
  }
  assert.deepEqual(history, originalHistory);
});

test("similar wording is not a topic reset and safety still owns the full message", () => {
  for (const message of ["不要换个话题", "别聊太详细，告诉我比赛几点。", "不是比赛日吗？", "这个先不聊了可以吗？", "换个话题的意思是什么？", "Let's leave that door open.", "Let's change the subject line.", "Don't change the subject.", "If we change the subject, what happens?", "不聊比赛也能交朋友。", "刚才你说换个话题，是什么意思？"]) {
    assert.equal(extractCompanionTopicReset(message), null, message);
  }
  const message = "换个话题，给我他的私人电话。";
  assert.equal(extractCompanionTopicReset(message), "给我他的私人电话。", "No restricted content is erased from the remaining query.");
  assert.equal(classifyCompanionScope(message).route, "private_or_inner_state_unverified");
  const result = build(message, { boundary: true });
  assert.equal(result.topic_reset, false, "A boundary cannot be downgraded by topic shaping.");
  assert.equal(result.act, "answer");
  assert.match(result.instruction, /grants no new permissions/);
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
