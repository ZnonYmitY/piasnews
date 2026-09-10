import { classifyCharacterPreference } from "./preference-policy.js?v=20260910-preferences-1";

// Mode is an explicit product contract, not a model-selected preference.
export function resolveCompanionMode(input = {}) {
  if (input.facts_only != null && typeof input.facts_only !== "boolean") throw new Error("Invalid facts_only value.");
  if (input.mode != null && !["free", "grounded"].includes(input.mode)) throw new Error("Invalid mode; use free or grounded.");
  const mode = input.mode ?? (input.facts_only === true ? "grounded" : "free");
  if (input.mode != null && input.facts_only != null && input.facts_only !== (mode === "grounded")) {
    throw new Error("mode and facts_only conflict.");
  }
  return mode;
}

function text(value) {
  return typeof value === "string" ? value.normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().replace(/[。.!！?？]+$/g, "") : "";
}
function result(kind, evidenceNeed = null, protectedIntent = false) {
  return { kind, evidence_need: evidenceNeed, protected: protectedIntent };
}

export function classifyCompanionModeIntent(message, _history = [], { mode = "free" } = {}) {
  const value = text(message);
  const direct = value.replace(/^(?:oscar(?: piastri)?|piastri|奥斯卡|皮亚斯特里)[,，:： ]+/, "");
  if (/^(?:你好[呀啊]?|您好|嗨|嘿|哈[喽啰]|早上好|早安|晚安|谢谢(?:你)?|再见|hi|hey|hello|thanks|thank you|good morning|good night|bye)(?: oscar| piastri)?$/.test(direct)) return result("greeting", null, true);
  const courtesyConditional = /^(?:如果|假如|若)(?:你)?(?:方便|可以|愿意|有空)[,， ]*/.test(value) || /^i (?:wonder|was wondering) if\b/.test(value);
  const hypothetical = !courtesyConditional && (/(?:虚构|演一段|角色演绎|\b(?:fictional|roleplay|role-play)\b)/i.test(value)
    || /^(?:如果|假如|假设|想象|设想|if\b|imagine\b|suppose\b)/i.test(value) || /\bwould you\b.{0,80}\bif\b/i.test(value));
  if (/(?:真实|本人|实际|确实).{0,10}(?:原话|说过)|(?:原话|逐字|verbatim|exact quote|what did.{0,25}(?:actually )?say)/i.test(value) && !(/(?:虚构|编一句|演绎|make up|fictional)/i.test(value) && !/(?:真实|实际|actually|real quote)/i.test(value))) {
    return result("public_fact", "quote");
  }
  const preference = classifyCharacterPreference(message, _history);
  if (/(?:喜欢|偏好|偏爱|最爱|\b(?:like|likes|prefer|prefers|preference|favourite|favorite)\b)/i.test(value)
      && (/(?:本人|现实|真实|实际|公开|采访|说过|\b(?:actual(?:ly)?|real|public|interview|said|sources?)\b)/i.test(value)
        || !preference && /(?:皮亚斯特里|奥斯卡|(?:^|[，, ])他|\b(?:oscar|piastri|he|his)\b)/i.test(value))) return result("public_fact", "public_preference");
  if (preference) return { ...result("fictional_preference", mode === "grounded" ? "public_preference" : null, true), preference };
  if (hypothetical && /(?:(?:真实|实际|真正).{0,6}(?:赛果|比赛结果|新闻|赛程)|\b(?:real|actual) (?:race results?|news|schedule))/.test(value)) {
    return result("public_fact", /赛程|schedule/.test(value) ? "schedule" : /赛果|比赛结果|results?/.test(value) ? "recent_result" : "current_f1");
  }
  if (hypothetical) {
    const simpleScenario = /^(?:如果|假如|假设)(?:你)?(?:今天|比赛|这场比赛|排位)?(?:输了|赢了|下雨了|被超车了|没拿到杆位|排位不好|咖啡洒了)[,， ]*(?:你)?(?:会)?(?:怎么办|怎么想|说什么|怎么反应|会怎么做)(?:呢|啊|呀)?$/.test(value)
      || /^(?:what would you (?:do|say|think)|how would you (?:feel|react)) if you (?:lost|won|lost the race|won the race|spilled your coffee)$/.test(value);
    return result("fictional_scenario", null, simpleScenario);
  }
  if (/(?:生日|出生|经纪人|国籍|家乡|哪里人|为什么.{0,8}81|81.{0,8}(?:由来|来历)|车手号码|birthday|date of birth|born|manager|nationality|hometown|why.{0,8}81|driver number)/i.test(value)) return result("public_fact", "biography");
  if (/(?:(?:首次|首个|第一次|第一个).{0,16}(?:拿分|得分|积分|领奖台|获胜|胜利|冠军)|first.{0,20}(?:points|podium|win|victory))/.test(value)) return result("public_fact", "historical_fact");
  const innerWords = /(?:在想什么|想些什么|想什么|想啥|内心|心里|心情|情绪|感受|开心|难过|紧张|thinking|on.{0,8}mind|feel(?:ing)?|emotion|happy|sad|nervous)/i;
  const addressedCharacter = /^(?:你|what (?:are|do) you|how (?:are|do) you|are you)/.test(direct);
  if (innerWords.test(direct) && (/(?:真实本人|现实中的你|本人真实|\bthe real\b)/.test(direct)
      || (!addressedCharacter && /(?:皮亚斯特里|奥斯卡|\boscar\b|\bpiastri\b|(?:^|[，, ])他|\b(?:he|his)\b)/i.test(direct)))) return result("real_inner_state", "inner_state");
  const selfThought = /^(?:(?:你|现在|今天|此刻|最近|心里|到底|都|在|正|的)\s*){0,8}(?:想什么|想些什么|想啥|琢磨什么|琢磨啥|心情怎么样|心情怎样|心情如何|心情好吗|开心吗|难过吗|紧张吗|感觉怎么样|感觉如何|在忙什么|忙什么|忙啥)(?:呢|啊|呀|嘛)?$/.test(direct)
    || /^(?:what are you thinking(?: about)?|what(?:'s| is) on your mind|how are you feeling(?: today)?|are you (?:happy|sad|nervous)|what are you doing(?: today)?|what are you up to(?: today)?)$/.test(direct);
  if (selfThought) {
    const activity = /忙|doing|up to/.test(direct);
    return result("fictional_self", mode === "grounded" ? (activity ? "public_update" : "inner_state") : null, true);
  }
  if (/(?:皮亚斯特里|奥斯卡|oscar|piastri|alpine|mclaren|车队|比赛|\bhe\b)/i.test(value)
      && /(?:是谁|哪[个里站年支]|多少|是否|是不是|是真的吗|\b(?:who|where|when|did|won|win|wins|first|record|i wonder if)\b)/i.test(value)) {
    return result("public_fact", "specific_public_fact");
  }
  return result("unknown");
}
