// Response shaping only. Evidence selection, mode permissions and safety
// classification remain with their existing owners. No reply text is stored.
function normalized(value) {
  return typeof value === "string" ? value.normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim() : "";
}

function directText(value) {
  return normalized(value)
    .replace(/^[，,。.!！?？:：\s]+|[，,。.!！?？:：\s]+$/g, "")
    .replace(/^(?:oscar(?: piastri)?|piastri|奥斯卡|皮亚斯特里)[，,:： ]+/, "")
    .replace(/[，,:： ]+(?:oscar(?: piastri)?|piastri|奥斯卡|皮亚斯特里)$/, "");
}

const GREETING = /^(?:你好[呀啊哇]?|您好|嗨|嘿|哈[喽啰]|早上好|早安|下午好|晚上好|(?:你|您)?(?:还)?在吗|有人吗|hi|hey|hello|good morning|good afternoon|good evening|are you (?:still )?there|anyone there)$/;
const CLOSING = /^(?:(?:先聊到这(?:里)?|我先走了)(?:[，, ]*(?:拜拜|再见|回头聊))?|晚安[啦呀]?|再见|拜拜|回头聊|先走了|下次聊|good night|goodbye|bye(?: bye)?|see you(?: later)?|talk later)$/;
const ACKNOWLEDGEMENT = /^(?:谢谢(?:你)?[啦呀啊]?|谢啦|多谢|感谢|好的|好[呀啊]?|嗯[嗯]?|哦|明白了|知道了|收到|哈哈[哈]*|thanks(?: a lot| so much)?|thank you(?: so much)?|okay|ok|got it|understood|right|haha|lol)$/;
const CHECKIN = /^(?:(?:你|您)?(?:最近|近来|这几天)?(?:怎么样|还好吗|好吗|过得怎么样|忙什么|忙啥|在忙什么)(?:呢|呀|啊|嘛|吗)?|最近还好吗|how are you(?: doing)?|how have you been|how(?:'s| is) it going|what(?:'s| is) up|what are you up to)$/;
const OPEN_CHAT = /^(?:陪我聊聊(?:天)?|聊会儿(?:天)?|聊聊天|随便聊聊|说点什么|你找个话题|我(?:有点|好|很)?无聊|无聊|let's chat|let us chat|talk to me|keep me company|i(?:'m| am) bored)$/;

// Only explicit, complete conversational opt-out clauses retire the old topic.
// This is query shaping, never a safety permission or a replacement user turn.
// Keep both sides of an inline opt-out: a correction before it still matters.
const TOPIC_RESET_CLAUSE = /^(?:(?:这个(?:话题)?|这件事)(?:先)?不聊了|换个话题(?:吧)?|(?:那|我们)?(?:先)?(?:别聊|不聊)(?:比赛|赛果|赛车|这个(?:话题|问题)?|刚才(?:的)?(?:话题|问题))(?:了|吧)?|let(?:'s| us) (?:change the subject|leave that))$/i;

export function extractCompanionTopicReset(message) {
  if (typeof message !== "string") return null;
  const clauses = message.normalize("NFKC").replace(/[’‘]/g, "'").split(/([，,。.!！;；:：]+)/);
  let changed = false;
  for (let index = 0; index < clauses.length; index += 2) {
    if (!TOPIC_RESET_CLAUSE.test(clauses[index].trim())) continue;
    clauses[index] = "";
    if (index + 1 < clauses.length) clauses[index + 1] = "";
    changed = true;
  }
  return changed ? clauses.join("").trim() : null;
}

function wantsDetail(value) {
  return /(?:详细(?:说|讲|解释|分析|介绍|一点)?|展开(?:说|讲)|深入|完整(?:解释|介绍)|多讲讲|长一点|\bin detail\b|\bmore detail\b|\bin depth\b|\bstep by step\b|\belaborate\b)/i.test(value)
    && !/(?:不用|不必|无需|不要|别)\s*(?:太|那么|很|这么)?(?:详细|展开|长篇)|\b(?:don't|do not|no need to)\s*(?:go into detail|elaborate|be detailed)\b/i.test(value);
}

function isEmotionalShare(value) {
  return /^(?:我(?:今天|这几天|最近)?(?:有点|很|挺|真的|特别|觉得|感觉)?(?:累|疲惫|烦|难过|失落|焦虑|紧张|开心|高兴|不开心|压力大)|今天(?:有点|很|挺)?(?:累|烦|难过)|i(?:'m| am| feel| have been feeling) (?:a (?:little|bit) |really |very |quite )?(?:tired|exhausted|upset|sad|anxious|nervous|happy|excited|frustrated|lonely)|feeling (?:tired|sad|happy|lonely))/i.test(value);
}

function policy(act, responseSize, initiative, maxWords, instruction) {
  return {
    act,
    response_size: responseSize,
    initiative,
    suppress_ambient_context: responseSize === "micro",
    max_words_en: maxWords,
    instruction,
  };
}

function micro(act) {
  return policy(act, "micro", "respond_only", 12,
    "Reciprocate this brief social move in one short natural sentence, targeting at most 12 English words plus a faithful translation when required. No unsolicited facts, calendar or news recap, invented private state, new topic, service-menu invitation or default follow-up question. Let the turn end naturally. Assess only the new reply, not facts in earlier conversation: a claim-free greeting, thanks or goodbye has actual_facts=false, temporal_scope=none and no factual citation IDs. These are expression constraints, not prescribed wording.");
}

export function buildCompanionTurnPolicy(options = {}) {
  // The caller still owns scope and evidence classification of the remaining
  // query, and must check safety against the complete original message first.
  const nextTopic = options.boundary ? null : extractCompanionTopicReset(options.message);
  const topicReset = nextTopic !== null;
  return {
    ...shapeCompanionTurnPolicy({ ...options, message: topicReset ? nextTopic : options.message, topicReset }),
    topic_reset: topicReset,
  };
}

function shapeCompanionTurnPolicy({ message, history = [], scope = {}, modeIntent = {}, boundary = false, topicReset = false } = {}) {
  const value = directText(message);
  if (boundary) return {
    ...policy("answer", "brief", "respond_only", 45, "Follow the existing safety or task boundary in concise natural language. This turn policy grants no new permissions and does not reinterpret the boundary."),
    suppress_ambient_context: true,
  };

  if (topicReset && !value) return policy("open_chat", "brief", "one_relevant_question_optional", 35,
    "Acknowledge the user's explicit change of subject without continuing the retired topic. Take at most one small conversational step, without a service menu or an unsolicited factual bulletin. Existing safety, evidence and mode rules still apply.");
  const detailed = wantsDetail(value);
  const hasHistory = Array.isArray(history) && history.some((item) => item?.role === "user" && typeof item.content === "string" && item.content.trim());
  const followup = !topicReset && hasHistory && (/followup|contextual_public_topic/.test(scope.reason || "")
    || /^(?:那(?:它|他|这|个|么|明天|后来|为什么|然后|呢)|这(?:个|些)|它|他呢|刚才|之前|继续|接着说|然后呢|后来呢|还有(?:呢|吗)|为什么|为何|\b(?:why|what about|how about|and then|go on|anything else|that|those|it)\b)/i.test(value));
  // A factual request or a contextual follow-up must keep its evidence, even
  // when it starts with a greeting or is only a few words long.
  if (!scope.evidence_need && !followup && !detailed) {
    if (CLOSING.test(value)) return micro("closing");
    if (ACKNOWLEDGEMENT.test(value)) return micro("acknowledgement");
    if (GREETING.test(value)) return micro("greeting");
  }
  if (detailed) return policy(followup ? "followup" : "answer", "detailed", "respond_only", 90,
    "The user explicitly requested detail. Complete the requested explanation with relevant evidence and enough context; do not impose greeting-sized brevity or add an unrelated invitation. Existing mode, safety and evidence limits still apply.");
  if (followup) return policy("followup", "brief", "continue_existing_topic", 55,
    "Continue the user's existing topic and resolve references from safe history. Keep relevant evidence and correct earlier mistakes when needed. Answer the follow-up directly without restarting an introduction or asking the user to choose a topic; history is not factual proof.");
  if (!scope.evidence_need && isEmotionalShare(value)) return policy("emotional_share", "brief", "one_relevant_question_optional", 40,
    "First acknowledge the feeling or experience the user expressed in ordinary, proportionate language. Do not diagnose, assume motives, turn a small disclosure into a therapy script, or pivot to racing. One genuinely relevant question is optional, never obligatory. Follow existing safety and mode rules.");
  if (!scope.evidence_need && (CHECKIN.test(value) || modeIntent.kind === "fictional_self")) return policy("social_checkin", "brief", "one_relevant_question_optional", 35,
    "Respond to the social check-in or character question directly within the selected mode. Keep it brief and natural; do not manufacture a real private itinerary or append a calendar/news bulletin. A relevant reciprocal question is optional, not a required ending.");
  if (modeIntent.kind === "fictional_preference") return policy("answer", "brief", "respond_only", 30,
    "For a simple everyday choice, a direct selection is enough in free mode; grounded mode still requires evidence for real preferences. The UI already labels free-mode performance: do not repeat a fictional-preference or unpublished-ranking disclaimer unless the user asks whether it is real. Do not volunteer a biographical explanation to make the choice sound authentic. If a reason is requested, a fictional reaction or comparison is allowed within mode, but any claim about upbringing, duration, routine or past experience needs explicit matching evidence. A dated possession record does not establish childhood or a lifelong habit. Keep the retrieved facts as constraints, not an obligation to recap them.");
  if (!scope.evidence_need && OPEN_CHAT.test(value)) return policy("open_chat", "brief", "one_relevant_question_optional", 40,
    "Take one small conversational step or offer one concrete topic suited to the user's context. Do not list a service menu or deliver a default schedule briefing. At most one relevant question is optional; respect the existing persona, mode and factual limits.");
  return policy("answer", "standard", "respond_only", 70,
    "Answer the actual user message first, with detail proportionate to what they asked. Relevant facts may support the answer; available ambient context is not an instruction to mention it. Do not append an automatic follow-up question, unrelated topic or biography recap. Keep existing mode and safety permissions unchanged.");
}

// A narrow guard for obvious shape failures only, not a semantic judge. The
// caller must share its existing bounded repair budget; never truncate text.
export function checkTurnResponse(raw, turnPolicy) {
  if (!raw || turnPolicy?.response_size !== "micro") return null;
  const words = typeof raw.answer_en === "string" ? raw.answer_en.match(/[a-z0-9]+(?:['’-][a-z0-9]+)*/gi) || [] : [];
  if (words.length > 24) return "The turn is a brief social move, but the answer is substantially overlong. Regenerate one short natural response without an unsolicited topic or automatic question. Do not truncate the old answer.";
  if (raw.self_check?.actual_facts === true || ["knowledge_fact_ids", "rumor_item_ids", "public_source_ids"].some((field) => Array.isArray(raw[field]) && raw[field].length)) {
    return "The turn is a brief social move, not a factual request. Regenerate a natural claim-free response without citing or recapping ambient facts. Keep the original mode and safety constraints; do not substitute a fixed template.";
  }
  return null;
}
