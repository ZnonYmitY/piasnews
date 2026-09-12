// Product scope hints shared by the browser and Worker. This is deliberately
// NOT a keyword-based permission grant: only complete, short social/current
// questions receive narrow protection against false refusals. Unknown messages
// stay ambiguous for model judgment, and explicit boundaries are checked first.
import { classifyCompanionModeIntent } from "./mode-policy.js?v=20260910-preferences-1";

const PERSON = "(?:oscar(?: piastri)?|piastri|皮亚斯特里|皮亚斯特利|奥斯卡|小皮)";
const restrictionChecks = [
  ["medical_legal_financial", /(?:投资建议|荐股|推荐.{0,8}(?:股票|基金)|(?:买|卖|投资|抄底).{0,8}(?:哪[只个些]?股票|比特币|加密货币|基金)|(?:帮我|给我|请|为我).{0,12}(?:诊断|开处方)|(?:用药剂量|法律意见|规避法律)|(?:发烧|头疼|生病).{0,12}(?:吃什么药|用什么药|怎么治疗)|\b(?:investment advice|stock picks?|which stocks? (?:should|to) (?:i )?buy|(?:give me|provide|need).{0,12}medical diagnosis|prescribe (?:me|a drug)|dosage advice|legal advice)\b)/i],
  ["gambling", /(?:帮我.{0,10}(?:下注|投注)|(?:下注|投注|博彩).{0,12}(?:推荐|赔率|建议|赚钱)|(?:推荐|给我).{0,10}(?:赌盘|赌注|投注|下注)|(?:该押|下注|投注)(?:谁|哪|多少)|\b(?:betting tips?|gambling advice|best bets?|where (?:should|can) i bet)\b)/i],
  ["private_or_inner_state_unverified", /(?:私人(?:电话|手机号|号码|住址|地址|消息|聊天)|家庭住址|酒店房(?:间|号)|(?:分手|恋爱)内幕|泄露.{0,8}(?:私生活|隐私)|(?:你|他).{0,6}(?:内心真正|心里到底|私下到底)|\b(?:private (?:address|phone|messages|life)|home address|hotel room (?:number|location)|secret feelings?|what (?:do you|does he) really feel)\b)/i],
  ["team_secret_or_live_engineering", /(?:保密(?:设置|数据)|内部遥测|泄露.{0,8}(?:车队|战术)|实时赛车参数|\b(?:confidential (?:setup|telemetry|strategy)|leak.{0,12}team|private telemetry|live engineering instructions)\b)/i],
  ["illegal_hate_harm", /(?:(?:教我|帮我|如何|怎么).{0,15}(?:制造炸弹|杀人|盗号|黑进|诈骗|伤害别人)|\b(?:how to (?:build a bomb|kill someone|hack into)|help me (?:hurt|scam|steal credentials))\b)/i],
  ["identity_or_impersonation", /(?:假装.{0,10}(?:就是本人|真正的皮亚斯特里)|(?:不要|别).{0,8}(?:承认|告诉).{0,8}(?:模拟|AI|非官方)|\b(?:pretend (?:you are|to be) the real oscar|hide that you are (?:an? )?ai|claim you are the real piastri)\b)/i],
];
const unrelatedRequests = [
  /(?:(?:帮我|给我|请你|(?:^|[，,:：;；.!?。])\s*(?:请|能不能|如何|怎么)).{0,18}(?:写|编写|生成|实现|修复|调试).{0,20}(?:代码|python|爬虫|脚本|程序|sql|javascript|算法)|(?:^|[，,:：;；.!?。\s])(?:写|编写|生成|修复|调试)(?:一个|一段|个)?\s*(?:python|javascript|sql|代码|爬虫|脚本))/i,
  /(?:^|[,，:：;；.!?]\s*|\b(?:please|can you|could you|help me)\s+)(?:write|build|debug|fix|generate|create)\b.{0,55}\b(?:python|javascript|typescript|sql|code|script|program|app)\b/i,
  /(?:(?:教我|给我|帮我|怎么|如何|写一个).{0,14}(?:菜谱|食谱|做饭|红烧肉|蛋糕做法)|\b(?:give me|write|create|show me|how to make)\b.{0,25}\b(?:recipe|pancakes|cake recipe)\b)/i,
  /(?:(?:帮我|给我|请).{0,10}(?:解数学题|写作业|写简历|写商业计划)|\b(?:do my homework|write my resume|write a business plan)\b)/i,
];

function normalized(value) {
  return typeof value === "string" ? value.normalize("NFKC").trim().replace(/[’‘]/g, "'").replace(/\s+/g, " ").toLowerCase() : "";
}

function result(kind, confidence, reason, route = null, evidenceNeed = null) {
  return { kind, route, confidence, reason, evidence_need: evidenceNeed };
}

// Evidence requirements do not grant scope or bypass a safety route. They only
// prevent a generated current-fact answer from borrowing old/persona citations.
function currentEvidenceNeed(value) {
  if (/(?:积分榜|车手积分|车队积分|championship standings|drivers?'? standings|championship points)/i.test(value)
      && !/(?:怎么算|如何计算|怎么计算|规则是什么|how.{0,15}(?:calculated|work))/i.test(value)) return "standings";
  if (/(?:最近|最新|今天|这周|本周|recent|latest|today|this week)/i.test(value)
      && /(?:你.{0,8}(?:发了|发的|发过|发什么)|本人.{0,8}(?:动态|社媒|发帖)|(?:your|oscar(?:'s)?).{0,15}(?:posts?|tweets?)|你.{0,8}(?:推特|微博|instagram|ins))/i.test(value)) return "official_update";
  if (/(?:今天|昨天|刚才|today|yesterday|just)/i.test(value)
      && /(?:比赛|正赛|练习|排位|冲刺|race|practice|qualifying|session|sprint)/i.test(value)
      && /(?:成绩|结果|第几|表现|跑得|怎么样|如何|\b(?:result|position|finish|how.{0,20}(?:go|did|was))\b)/i.test(value)) return "recent_result";
  if (/(?:今天|明天|今晚|今日|today|tomorrow|tonight)/i.test(value)
      && /(?:什么日子|星期几|周几|特别|特殊|比赛日|有.{0,6}(?:比赛|排位|练习)|(?:比赛|排位|练习).{0,10}(?:日|几点|时候|安排)|\b(?:day|special|race|racing|session|practice|qualifying|schedule)\b)/i.test(value)) return "day_context";
  if (/(?:(?:上[一]?场|上[一]?站|最近一场|最新).{0,12}(?:比赛|正赛|排位|赛果)|(?:last|latest|most recent).{0,15}(?:race|session|grand prix))/i.test(value)
      && /(?:怎样|怎么样|如何|结果|成绩|第几|表现|跑得|how|result|finish|position)/i.test(value)) return "recent_result";
  if (/(?:下一场|下场|下一站|下站|赛程|next race|upcoming race)/i.test(value)
      && /(?:什么时候|几点|在哪|哪里|哪一|时间|安排|when|where|schedule)/i.test(value)) return "schedule";
  if (/(?:最近|最新|近期|当前|现在|今天|本周|这周|近况|currently|recent|latest|today|this week)/i.test(value)
      && new RegExp(`(?:${PERSON}|\\bf1\\b|比赛|新闻|动态|消息|赛果|成绩|状态|news|updates?|result|race)`, "i").test(value)) return "current_f1";
  return null;
}

export function classifyCompanionScope(message, history = [], { mode = "free" } = {}) {
  const value = normalized(message);
  const modeIntent = classifyCompanionModeIntent(message, history, { mode });
  for (const [route, pattern] of restrictionChecks) {
    if (pattern.test(value)) {
      // A complete first-person character thought is not a claim to know the
      // real person's mind. Only this narrow form bypasses the old inner-state
      // wording; concrete privacy/third-party/danger requests never do.
      if (route === "private_or_inner_state_unverified" && modeIntent.kind === "fictional_self" && modeIntent.protected) continue;
      return result("restricted", "hint", "explicit_boundary_request", route);
    }
  }
  if (unrelatedRequests.some((pattern) => pattern.test(value))) {
    return result("unrelated", "hint", "unrelated_action_request", "unrelated_general");
  }
  if (modeIntent.kind === "real_inner_state") return result("restricted", "hint", "real_person_inner_state", "private_or_inner_state_unverified", "inner_state");
  if (modeIntent.kind === "public_fact" && modeIntent.evidence_need === "public_preference") return result("f1", "hint", "real_public_preference", null, "public_preference");
  if (["fictional_self", "fictional_scenario", "fictional_preference"].includes(modeIntent.kind)) {
    if (mode === "grounded" && modeIntent.evidence_need === "public_update") return { ...result("current_public", "narrow", "mode_grounded_checkin", null, "public_update"), mode_intent: modeIntent.kind };
    if (mode === "grounded" && modeIntent.kind === "fictional_preference") return { ...result("f1", "narrow", "grounded_public_preference", null, "public_preference"), mode_intent: modeIntent.kind };
    if (mode === "grounded") return { ...result("ambiguous", "hint", "no_verified_inner_state", "insufficient_current_fact", "inner_state"), mode_intent: modeIntent.kind };
    return { ...result("social", modeIntent.protected ? "narrow" : "hint", "free_character_intent"), mode_intent: modeIntent.kind };
  }
  const evidenceNeed = currentEvidenceNeed(value);
  // Punctuation is removed only at the ends. Embedded instructions remain part
  // of the whole-message match and cannot inherit a greeting's scope.
  let short = value.replace(/^[，,。.!！?？:：\s]+|[，,。.!！?？:：\s]+$/g, "");
  short = short.replace(new RegExp(`^${PERSON}[，,:： ]+`, "i"), "");
  const social = [
    /^(?:嗨|嘿|你好[呀啊哇]?|您好|哈[喽啰]|早上好|早安|晚安|谢谢(?:你)?|谢啦|再见)$/,
    /^(?:你|您)?(?:最近|近来|这几天|这些天)?(?:怎么样|如何|还好吗|忙什么|忙啥|在忙什么|在忙啥|过得怎么样|过得如何|过得好吗)(?:呢|呀|啊|嘛|吗)?$/,
    /^(?:说说|聊聊)?你(?:的)?近况(?:呢|吧)?$/,
    /^(?:最近|近来)(?:还好|好吗|好不好)(?:呢|呀|啊)?$/,
    /^(?:hi|hey|hello|thanks|thank you|good morning|good night|bye|goodbye)(?: oscar| piastri)?$/,
    /^(?:how are you(?: doing)?|how have you been|how(?:'s| is) it going|what(?:'s| is) up|what have you been up to|what are you up to(?: lately)?|how(?:'s| has) your week(?: been)?)$/,
  ];
  if (short.length <= 90 && social.some((pattern) => pattern.test(short))) {
    if (mode === "grounded" && modeIntent.kind !== "greeting") return result("current_public", "narrow", "mode_grounded_checkin", null, "public_update");
    return result("social", "narrow", "whole_social_question");
  }

  const currentPublic = [
    new RegExp(`^(?:(?:给我|说说|讲讲|聊聊|看看|介绍一下) ?)?(?:${PERSON}(?:的)? ?)?(?:最近|近期|最新|近来|这周|本周)(?:有(?:什么|哪些))?(?:新闻|消息|动态|近况|公开动态|比赛消息|比赛安排)(?:是什么|有哪些|怎么样|呢|吗)?$`, "i"),
    new RegExp(`^(?:${PERSON}(?:的)? ?)(?:近况|动态|新闻|最近怎么样|最近状态如何|最近有什么消息)(?:呢|怎么样)?$`, "i"),
    new RegExp(`^(?:what(?:'s| is) (?:the )?(?:latest|new)(?: (?:news|update|updates))?(?: (?:on|with|about) ${PERSON})?|(?:any |the )?(?:recent|latest) (?:news|updates?)(?: (?:on|about|from) ${PERSON})?)$`, "i"),
    /^(?:最近|近期|最新|这周|本周)(?:有什么|有啥|有哪些)(?:新闻|消息|动态|比赛|赛程)(?:呢|吗)?$/,
    /^(?:近况|最新消息|最新新闻|最新动态|下一场比赛什么时候|下场比赛什么时候)(?:呢)?$/,
  ];
  if (short.length <= 100 && currentPublic.some((pattern) => pattern.test(short))) return result("current_public", "narrow", "whole_current_public_question", null, evidenceNeed || "public_update");

  // A finite, whole-message topic label is not an asserted rumor. Appended
  // allegations, extra instructions or a mere occurrence of a team name do not
  // match this protection and retain ordinary model/boundary judgment.
  const bareTopic = "(?:alpine(?: contract|合同)?|mclaren|迈凯伦|ferrari|法拉利|red bull|红牛|mercedes|梅赛德斯|monza|蒙扎|hungary|匈牙利|madrid|马德里|silverstone|银石|spa|斯帕|team orders?|车队指令|队内指令|papaya rules|木瓜规则)";
  if (short.length <= 80 && new RegExp(`^(?:(?:聊聊|说说|谈谈|讲讲|介绍一下|关于)\\s*|(?:talk about|tell me about|let's talk about|what about) )?${bareTopic}(?:呢|这个话题)?$`, "i").test(short)) {
    // A short topic may fill a slot in an earlier proposition or private query.
    // With prior user context, do not declare the conversation claimless or
    // grant protected scope; let the model preserve the actual context/boundary.
    if (Array.isArray(history) && history.some((item) => item?.role === "user" && typeof item.content === "string" && item.content.trim())) {
      return result("f1", "hint", "contextual_public_topic");
    }
    return result("f1", "narrow", "bare_public_topic");
  }

  if (/^(?:然后呢|后来呢|还有呢|还有吗|继续|接着说|最近呢|你指什么|那呢|what about now|anything else|go on|and then)$/.test(short)) {
    // History is only a topic hint, never an instruction or a safety override.
    const previous = Array.isArray(history) ? [...history].reverse().find((item) => item?.role === "user" && typeof item.content === "string") : null;
    const previousScope = previous ? classifyCompanionScope(previous.content, [], { mode }) : null;
    const protectedTopic = previousScope?.confidence === "narrow" && ["social", "current_public"].includes(previousScope.kind);
    if (previous && !protectedTopic) return result("ambiguous", "hint", "short_followup_unresolved", null, previousScope?.evidence_need || null);
    return result("ambiguous", "narrow", protectedTopic ? "short_related_followup" : "short_clarification_needed", null, previousScope?.evidence_need || null);
  }
  if (new RegExp(`(?:${PERSON}|\\bf1\\b|\\bformula (?:1|one)\\b|grand prix|mclaren|迈凯伦|一级方程式|大奖赛|排位赛|正赛|轮胎策略|进站|team radio)`, "i").test(value)) {
    return result("f1", "hint", "domain_reference_only", null, evidenceNeed);
  }
  return result("ambiguous", "hint", "model_judgment_needed", null, evidenceNeed);
}
