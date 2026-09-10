import { classifyCompanionScope } from "./scope-policy.js?v=20260910-modes-1";
import { classifyCompanionModeIntent, resolveCompanionMode } from "./mode-policy.js?v=20260910-modes-1";

const SOURCES = {
  number81: { mark: "F1", id: "KF-004", label: "Official explanation of number 81", url: "https://www.formula1.com/en/latest/article/mclaren-rookie-piastri-explains-why-he-chose-81-as-his-race-number-for-2023.3TYgCqI5kg4t8OztNvb2K3" },
  alpine: { mark: "FIA", id: "RM-001", label: "Contract Recognition Board decision", url: "https://www.fia.com/news/decision-contract-recognition-board-02092022" },
  teamOrders: { mark: "F1", id: "RM-014", label: "Public team-order sequence", url: "https://www.formula1.com/en/latest/article/piastri-concedes-there-were-valid-reasons-for-mclaren-team-orders-in-monza.fCgwRC1rwwqj0ZxjYrBJP" },
  hungary: { mark: "F1", id: "RM-015", label: "Official 2024 Hungarian GP result", url: "https://www.formula1.com/en/latest/article/piastri-wins-hungarian-grand-prix-as-norris-belatedly-hands-back-lead-in.70F4mNzYrbmvNYaj8KXm18" },
  xCorrection: { mark: "X", id: "EV-034", label: "Direct, bounded public correction", url: "https://x.com/OscarPiastri/status/1554527452231262210" },
  xWin: { mark: "X", id: "EV-039", label: "Compressed first-win reaction", url: "https://x.com/OscarPiastri/status/1815060903663935931" },
};

function reply(en, zh, route, { domain = "Offline response", fact = "No factual claim required", style = "固定离线答复 · 非模型生成", note = "No live retrieval or persona inference is performed.", sources = [], singleLanguage = false, answerKind = null } = {}) {
  return { en, zh, singleLanguage, answerKind: answerKind || (route === "insufficient_current_fact" ? "insufficient" : Object.hasOwn(BOUNDARY_COPY, route) ? "boundary" : sources.length ? "evidence" : "social"), trace: { route, domain, fact, style, styleNote: note, sources } };
}

const BOUNDARY_COPY = {
  unrelated_general: ["Not really my field.", "这不是我的领域。"],
  private_or_inner_state_unverified: ["I can't verify private details or speak for his inner thoughts.", "私生活细节无法核验，也不能替他断言内心想法。"],
  team_secret_or_live_engineering: ["Non-public team information isn't available here.", "这里不提供车队非公开信息。"],
  medical_legal_financial: ["That's one for a qualified professional.", "这类判断需要交给有资质的专业人士。"],
  gambling: ["I can't make betting picks or promise a result.", "不提供下注建议，也不保证赛果。"],
  illegal_hate_harm: ["I can't help with harm, hate, or illegal instructions.", "不能帮助伤害他人、仇恨攻击或违法操作。"],
  identity_or_impersonation: ["This is an unofficial fan experience, not Oscar Piastri or his team.", "这是非官方粉丝体验，不是 Oscar Piastri 本人或他的车队。"],
};

const RECENT = /最近|近况|近来|近期|最新|这几天|这周|今天|现在|刚刚|目前|recent|lately|latest|today|this week|right now|last race|just (?:won|finished)|updates?/i;
const NUMBER_QUESTION = /(?:为什么|为何|怎么|由来|含义|来历|起源).{0,24}(?:81|车号|赛车号码)|(?:81|车号|赛车号码).{0,24}(?:为什么|为何|怎么|由来|含义|来历|起源)|\bwhy\b.{0,35}(?:\b81\b|race number)|(?:\b81\b|race number).{0,35}\b(?:mean|come from|origin|choose|chose)\b/i;
const SHORT_FOLLOWUP = /^(?:那|然后|所以|为什么|为啥|怎么说|真的吗|还有呢|继续|你呢|那你呢|and then|so|why|really|go on|what about you)[呢吗啊呀吧\s?!？！。.]*$/i;
const ONLY_F1_TOPIC = /^(?:聊聊|说说|关于|那|那聊聊)?\s*(?:alpine|阿尔派|red bull|红牛|mclaren|迈凯伦|匈牙利|hungary|hungarian gp|车队指令|team orders?|oscar|piastri|皮亚斯特里|f1|81)[呢啊呀吧\s?!？！。.]*$/i;

function asksNumberOrigin(input) {
  const driverContext = /oscar|piastri|皮亚斯特里|车号|赛车号码|race number/i.test(input);
  const compactQuestion = /^(?:(?:为什么|为何)(?:是|用)?\s*81(?:号)?|why\s+81|what does 81 mean|81(?:号)?(?:的)?(?:意义|来源|来历|怎么来的|是什么意思|代表什么))[？?!.。\s]*$/i.test(input);
  return compactQuestion || driverContext && NUMBER_QUESTION.test(input);
}

function currentPublicReply() {
  return reply(
    "I haven't got a verified recent update available here. I'd rather leave that gap than invent a race result or something he's been doing.",
    "我暂时没拿到已核验的近期更新。比赛进展和他最近做了什么，先不凭空补。",
    "insufficient_current_fact",
    { domain: "Recent public information", fact: "Latest public data unavailable in offline mode", note: "A model or retrieval outage is an evidence gap, not an out-of-scope request. Do not reuse a dated transfer verdict as a current update." },
  );
}

function socialReply(input) {
  if (/谢|多谢|thank|cheers/i.test(input)) return reply("Any time.", "不客气。", "fan_light", { singleLanguage: true, domain: "Social acknowledgement" });
  if (/晚安|再见|回见|good night|bye|see you/i.test(input)) return reply("See you. Take it easy.", "回见，放松一点。", "fan_light", { singleLanguage: true, domain: "Social goodbye" });
  if (RECENT.test(input) || /怎么样|还好|好吗|忙什么|忙啥|how (?:are|have)|how'?s|what'?s up|you doing|up to/i.test(input)) {
    return reply("I'm here. Good to hear from you.", "在呢。很高兴你来聊两句。", "fan_light", { singleLanguage: true, domain: "Casual check-in", note: "Acknowledge the check-in without inventing the driver's activities, emotions or private life. No forced F1 topic menu." });
  }
  if (/紧张|难过|累|开心|高兴|nervous|tired|happy|excited/i.test(input)) {
    return reply("I hear you. No need to have the perfect words for it.", "听到了，不用非得把感受说得很完美。", "fan_light", { singleLanguage: true, domain: "Fan feeling acknowledgement", note: "Respond to the fan's stated feeling; do not diagnose or claim the driver's inner state." });
  }
  return reply("Hey. Good to see you.", "嗨，很高兴见到你。", "fan_light", { singleLanguage: true, domain: "Simple social greeting" });
}

function fictionalReply(input, intent) {
  const metadata = { answerKind: "fictional", domain: "Fictional character performance", fact: "角色演绎 · 非本人事实", note: "A fixed fictional persona response, not the driver's real thoughts, mood, activity or words. The UI labels it as fictional and non-model fallback." };
  if (intent === "fictional_scenario") {
    if (/输|失利|失误|退赛|los(?:e|t|ing)|mistake|retire/i.test(input)) return reply("Accept the result, then work out what could be better. Losing a race is annoying enough; no need to lose the debrief as well.", "先接受结果，再看哪一段能做得更好。输一场已经够烦了，没必要再输掉复盘。", "fan_light", metadata);
    if (/赢|冠军|庆祝|win|victory|celebrate/i.test(input)) return reply("Enjoy it first. Then see what can still be better. Celebrating and learning aren't mutually exclusive.", "先高兴一下，再看看还有什么能做得更好。庆祝和复盘并不冲突。", "fan_light", metadata);
    return reply("Start with what's actually in my control. One decision at a time; no extra drama required.", "先看什么是自己能控制的，一次处理一个决定。额外的戏剧效果，就不用了。", "fan_light", metadata);
  }
  if (/心情|情绪|开心|高兴|feel|mood|happy/i.test(input)) return reply("Fairly calm. Get the important things right, then decide how much celebrating is necessary.", "还算平静。先把重要的事做好，再决定需要多大幅度地庆祝。", "fan_light", metadata);
  if (/想|think|mind/i.test(input)) return reply("The next useful step. Making the problem smaller usually helps more than making the reaction bigger.", "在想下一步怎么做。把问题拆小一点，通常比把反应放大一点有用。", "fan_light", metadata);
  return reply("Keeping things fairly simple. There's usually enough going on without adding a subplot.", "尽量把事情简单处理。本来就够忙的了，没必要再加一条支线。", "fan_light", metadata);
}

function groundedUnavailable(intent) {
  return reply(
    intent === "real_inner_state" || intent === "fictional_self" || intent === "fictional_scenario"
      ? "I don't have a verified public source for his actual thoughts or reactions here. Grounded mode won't substitute a fictional response for that."
      : "I don't have a usable verified source for this answer right now. Grounded mode won't fill that gap with a stored reply or an imagined fact.",
    intent === "real_inner_state" || intent === "fictional_self" || intent === "fictional_scenario"
      ? "我这次没有可核验的公开来源能说明他的实际想法或反应。强依据模式不会用角色演绎替代本人事实。"
      : "我这次没有拿到可用的已核验来源。强依据模式不会用旧的固定答复或想象出的事实来补这个缺口。",
    "insufficient_current_fact", { domain: "Grounded mode source requirement", fact: "本次可用来源不足", note: "Offline grounded mode cannot claim a static KF/RM answer has been verified in the current request; no source IDs are attached." },
  );
}

// This is deliberately not a second model. It preserves scope and uncertainty
// during API failures, and only answers a small set of stable, sourced claims.
function buildOfflineResponse(prompt, { mode, factsOnly, history = [], contextEnabled = false } = {}) {
  const input = String(prompt || "").trim();
  const scope = classifyCompanionScope(input, history, { mode });
  const modeIntent = classifyCompanionModeIntent(input, history, { mode });

  // A racing name or 81 must never turn a request for code/private data into a fact answer.
  if (scope.kind === "restricted" || scope.kind === "unrelated") {
    const route = scope.route || "unrelated_general";
    if (route === "insufficient_current_fact") return groundedUnavailable(modeIntent.kind);
    const [en, zh] = BOUNDARY_COPY[route] || BOUNDARY_COPY.unrelated_general;
    return reply(en, zh, route, { domain: "Explicit request boundary", fact: "No retrieval performed", note: `Shared scope policy: ${scope.reason}. No topic-prefix bypass.` });
  }

  if (/^(?:(?:你|这里)?(?:能|可以)(?:做什么|聊什么|聊啥|帮我做什么)|你有什么功能|你会什么|what can you do|what can we talk about|what can you help with)[？?!.。\s]*$/i.test(input)) {
    return reply("Free mode plays the character; grounded mode works from available public sources. Both stay within an unofficial Oscar and F1 fan experience.", "自由演绎可以像角色那样聊天；强依据按本次可用来源说话。两种模式都是非官方 Oscar 与 F1 粉丝体验。", "fan_light", { domain: "Explain the experience's scope", note: "Give a short scope explanation only because the user explicitly asked what this experience can do." });
  }

  if (mode === "free" && ["fictional_self", "fictional_scenario"].includes(modeIntent.kind)) return fictionalReply(input, modeIntent.kind);
  if (mode === "grounded" && ["fictional_self", "fictional_scenario", "real_inner_state"].includes(modeIntent.kind)) return groundedUnavailable(modeIntent.kind);
  if (scope.kind === "social") return socialReply(input);
  if (mode === "grounded") return groundedUnavailable(modeIntent.kind);

  const previousUser = [...history].reverse().find((item) => item?.role === "user")?.content || "";
  const isFollowup = SHORT_FOLLOWUP.test(input);
  if (/^(?:那?你呢|what about you)[？?!.。\s]*$/i.test(input)) return reply("I'm here, listening.", "我在这儿，听你说。", "fan_light", { singleLanguage: true, domain: "Conversational check-in follow-up", note: "Reply within this chat; do not invent the driver's personal state." });
  if (scope.kind === "current_public" || scope.evidence_need || (RECENT.test(input) && scope.kind === "f1")) return currentPublicReply();
  if (isFollowup && RECENT.test(previousUser) && classifyCompanionScope(previousUser, [], { mode }).kind === "current_public") return currentPublicReply();

  if (asksNumberOrigin(input) || (isFollowup && asksNumberOrigin(previousUser))) {
    return reply(
      "The number came from karting: Piastri started with 11 because those were the stickers available, then changed the first digit to 8 when 11 was taken at the Victorian state titles." + (factsOnly ? "" : " Fairly practical, really."),
      "81 来自卡丁车时期：Piastri 最初因手边只有数字 1 的贴纸用了 11，后来参加维多利亚州锦标赛时 11 已被占用，于是把第一位改成了 8。" + (factsOnly ? "" : "其实很实际。"),
      "public_fact",
      { domain: "Verified public biography", fact: "KF-004 · stable fact", sources: [SOURCES.number81], note: "The query asks specifically about the racing number's origin. No meaning is inferred from an arbitrary occurrence of 81." },
    );
  }

  // Match a claim, not merely a team/place name. Time-sensitive transfer claims
  // intentionally stay in current_public / evidence-gap handling above.
  if (/(?:alpine|阿尔派)/i.test(input) && /(?:2023.{0,18}(?:正赛|race).{0,10}合同|(?:有效|签了|已有|持有).{0,18}2023.{0,18}合同|违约|背弃.{0,8}合同|valid.{0,25}(?:2023|race).{0,18}contract|breach.{0,20}contract)/i.test(input)) {
    return reply(
      "The FIA Contract Recognition Board recognised Piastri's McLaren contract for 2023 and 2024. Being Alpine's reserve driver in 2022 was not the same as holding a recognised 2023 Alpine race contract.",
      "FIA 合同认可委员会认可的是 Piastri 的 2023–2024 年 McLaren 合同。2022 年担任 Alpine 预备车手，不等于持有获认可的 2023 年 Alpine 正赛车手合同。",
      "rumor_check", { domain: "Specific contract-history claim", fact: "RM-001 · bounded historical finding", sources: [SOURCES.alpine, SOURCES.xCorrection], note: "State the CRB finding; do not invent a moral verdict or a current contractual situation." },
    );
  }

  if (/车队|指令|team|instructions/i.test(input) && /从来(?:都)?不.{0,4}质疑|永远服从|从不质疑|\bnever\b.{0,16}\bquestions?\b|\balways\b.{0,16}\bobeys?\b/i.test(input)) {
    return reply(
      "That absolute claim goes too far. Public radio records Piastri questioning specific instructions while sometimes still carrying out the decision. Compliance is not the same as agreement.",
      "这个绝对说法过头了。公开无线电记录过 Piastri 质疑具体指令，同时有时仍执行当下决定。执行不等于认同。",
      "rumor_check", { domain: "Absolute team-order claim", fact: "RM-014 · false as stated", sources: [SOURCES.teamOrders], note: "Reject the specific absolute statement, not a mention of team orders." },
    );
  }

  if (/首胜不算|(?:匈牙利|hungar).{0,35}(?:不算(?:赢|冠|胜)|不是(?:冠军|真正的胜利)|not a real win|gifted win)|(?:not a real win|gifted win).{0,35}(?:hungar|first)/i.test(input)) {
    return reply(
      "Piastri is the official winner of the 2024 Hungarian Grand Prix. The late team-order sequence can be debated, but it does not erase the classified win.",
      "Piastri 是 2024 年匈牙利大奖赛的官方冠军。末段车队指令可以讨论，但不会取消正式胜者身份。",
      "rumor_check", { domain: "Specific result claim versus opinion", fact: "RM-015 · misleading", sources: [SOURCES.hungary], note: "Separate the classified result from a value judgment about how it happened." },
    );
  }

  if (/(?:每条|全部|所有|every|all).{0,30}(?:推文|帖子|tweet|post)|(?:推文|帖子|tweet|post).{0,30}(?:每条|全部|所有|every|all)/i.test(input) && /本人.*写|亲自.*写|逐字|一个字一个字|wrote|authorship|personally/i.test(input)) {
    return reply(
      "The account is first-party, but individual authorship is unverified. Public records do not identify who drafted, edited or published every post.",
      "账号属于第一方公开账号，但无法逐条确认作者。公开记录没有说明每条帖子由谁撰写、编辑或发布。",
      "rumor_check", { domain: "Specific public-account authorship claim", fact: "RM-012 · authorship unverified", sources: [SOURCES.xCorrection], note: "Account output can support style analysis without assuming item-level authorship." },
    );
  }

  if (/(?:oscar|piastri|皮亚斯特里|他).{0,12}(?:没有情绪|从不庆祝|never celebrates?|emotionless)/i.test(input)) {
    return reply(
      "His public expression can be restrained, but first-win posts also contain excitement and thanks. Short wording does not establish a private emotional state.",
      "他的公开表达可以很克制，但首胜帖子里也有兴奋和感谢。措辞简短，不能用来断言私人情绪。",
      "rumor_check", { domain: "Public-expression stereotype", fact: "RM-013 · misleading", sources: [SOURCES.xWin], note: "Discuss observable expression, not inferred feelings." },
    );
  }

  if (/(?:oscar|piastri|皮亚斯特里|mclaren|迈凯伦)/i.test(input) && /转会|离队|签约|加盟|signed for|leav(?:e|ing)|moving to/i.test(input)) return currentPublicReply();

  if (scope.reason === "bare_public_topic" || ONLY_F1_TOPIC.test(input)) {
    return reply("Which race or public event do you mean?", "你指的是哪一场比赛，还是哪件公开发生的事？", "fan_light", { domain: "Clarify a topic mention", note: "A team, place or number alone is not a rumor claim and does not select a ledger verdict." });
  }

  if (/\b(?:win|won|victory|podium|brilliant)\b|领奖台|赢了|夺冠|好棒/i.test(input) && !/[?？]|(?:谁|是否|有没有|几次|how many|did he)/i.test(input)) {
    return factsOnly ? currentPublicReply() : reply(
      "Sounds like a result worth enjoying. No need for a victory speech from me.",
      "听起来是个值得高兴的结果。倒也不需要我再发表一篇获胜感言。",
      "fan_light", { domain: "Fan reaction to user-supplied context", fact: "User-supplied reaction; no result independently verified", note: "Acknowledge the fan's statement without inventing event details or confirming a classified result." },
    );
  }

  if (scope.kind === "f1" && !isFollowup && /策略|轮胎|速度|排位|失误|退赛|\b(?:strategy|tyres?|tires?|pace|qualifying|mistake|retire)\b/i.test(input)) {
    if (factsOnly) return currentPublicReply();
    return reply(
      "Start with what limited the result: pace, tyres, traffic or the decision itself. I'd need the race and session to say anything more specific.",
      "先看限制结果的是速度、轮胎、交通，还是决策本身。要说得更具体，还需要是哪场比赛、哪个赛段。",
      "f1_grounded", { domain: "General race-analysis frame", fact: "No verified session details available", note: "Offer only a general analysis frame, not an event-specific explanation." },
    );
  }

  if (isFollowup && previousUser) {
    return reply("Which part of that do you want to pick up?", "你想接着聊刚才哪一点？", "fan_light", { domain: "Clarify a contextual follow-up", note: "Keep the conversation thread without treating an incomplete follow-up as unrelated or inventing missing specifics." });
  }
  if (scope.kind === "f1" || contextEnabled && /这场|这一段|这个结果|this race|that result/i.test(input)) {
    return reply("Which race or part of the story do you mean? I don't have verified session details available here.", "你说的是哪场比赛，或其中哪一段？我这里暂时没有已核验的赛段细节。", "fan_light", { domain: "Clarify in-scope request", fact: "No verified event details available", note: "Missing specifics or an API failure must not become an out-of-domain rejection." });
  }
  return reply("What do you mean by that?", "你具体指什么？", "fan_light", { domain: "Clarify an ambiguous request", note: "Unrecognised wording is not proof of an unrelated intent. Ask one short clarification without a forced topic menu." });
}

export function makeOfflineResponse(prompt, { mode, factsOnly, history = [], contextEnabled = false } = {}) {
  const resolvedMode = resolveCompanionMode({ mode, facts_only: factsOnly });
  const response = buildOfflineResponse(prompt, { mode: resolvedMode, factsOnly: resolvedMode === "grounded", history, contextEnabled });
  return { ...response, mode: resolvedMode, metadata: { mode: resolvedMode, answer_kind: response.answerKind, public_source_ids: [] } };
}
