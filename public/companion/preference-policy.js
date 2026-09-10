// Narrow recognition of complete, harmless everyday preference questions.
// Options are local labels, never arbitrary user text or factual persona data.
const TOPICS = {
  pets: [["cat", "cats", "猫", "cat|cats|kitty|kitties|猫咪|猫猫|小猫|猫派"], ["dog", "dogs", "狗", "dog|dogs|puppy|puppies|狗狗|小狗|狗派"]],
  drinks: [["coffee", "coffee", "咖啡"], ["tea", "tea", "茶"], ["water", "water", "水"], ["juice", "juice", "果汁"]],
  food: [["pasta", "pasta", "意面", "意大利面"], ["rice", "rice", "米饭", "饭"], ["noodles", "noodles", "面条", "面"], ["pizza", "pizza", "披萨"], ["sweet", "sweet food", "甜食", "sweet|甜|甜的|甜口"], ["savory", "savory food", "咸食", "savory|savoury|咸|咸的|咸口"]],
  music: [["rock", "rock music", "摇滚", "rock|摇滚乐"], ["pop", "pop music", "流行音乐", "pop|流行|流行乐"], ["jazz", "jazz", "爵士", "爵士乐"], ["classical", "classical music", "古典音乐", "classical|古典|古典乐"]],
  color: [["blue", "blue", "蓝色", "蓝"], ["orange", "orange", "橙色", "橙"], ["black", "black", "黑色", "黑"], ["red", "red", "红色", "红"], ["green", "green", "绿色", "绿"]],
  leisure: [["home", "staying in", "宅家", "stay in|staying home|stay home|home|在家|待在家|待在家里"], ["out", "going out", "出去玩", "go out|出门|出去|出门玩"], ["movie", "watching a film", "看电影", "movies|films|movie|film|电影"], ["game", "video games", "打游戏", "gaming|games|游戏|玩游戏"], ["reading", "reading", "看书", "books|reading books|读书"]],
  season: [["summer", "summer", "夏天", "夏季"], ["winter", "winter", "冬天", "冬季"], ["spring", "spring", "春天", "春季"], ["autumn", "autumn", "秋天", "fall|秋季"]],
  place: [["sea", "the beach", "海边", "beach|sea|the sea|大海|海"], ["mountains", "the mountains", "山里", "mountains|mountain|山|爬山"]],
};
const OPTIONS = Object.entries(TOPICS).flatMap(([topic, values]) => values.map(([id, en, zh, aliases = ""]) => ({ topic, id, en, zh, aliases: [en, zh, ...aliases.split("|")] })));
const TOPIC_NAMES = {
  pets: /^(?:宠物|动物|pets?|animals?)$/,
  drinks: /^(?:饮料|饮品|喝的|drinks?|beverages?)$/,
  food: /^(?:食物|美食|吃的|food|foods|meal|dish)$/,
  music: /^(?:音乐|歌|歌曲|哪种音乐|music|kind of music|type of music|music genre)$/,
  color: /^(?:颜色|colou?rs?)$/,
  leisure: /^(?:爱好|休闲活动|hobbies|hobby|leisure activity)$/,
  season: /^(?:季节|seasons?)$/,
  place: /^(?:度假方式|度假地点|holiday destination)$/,
};
const FOLLOWUPS = new Map([
  ...["为什么", "为什么呢", "为啥", "为啥呢", "怎么说", "why", "why is that", "how come"].map((value) => [value, "why"]),
  ...["你呢", "那你呢", "what about you", "and you"].map((value) => [value, "reciprocal"]),
  ...["另一个呢", "那另一个呢", "what about the other one"].map((value) => [value, "alternative"]),
]);
function normalized(value) {
  return typeof value === "string" ? value.normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim().replace(/[。.!！?？]+$/g, "") : "";
}
function option(value) {
  const clean = value.trim().replace(/^(?:更|比较)?(?:喜欢|偏爱|爱)\s*/, "").replace(/^(?:a |an |the )/, "").replace(/ person$/, "");
  return OPTIONS.find((item) => item.aliases.includes(clean) || item.aliases.includes(`the ${clean}`));
}
function descriptor(kind, options, followup = null) {
  return { kind, topic: options[0].topic, options: options.map(({ id, en, zh }) => ({ id, en, zh })), followup };
}
function followupTarget(value) {
  const match = value.match(/^那?(.+?)呢$/) || value.match(/^what about (.+)$/);
  return match ? option(match[1]) : null;
}
function directPreference(value) {
  if (!value || value.length > 150) return null;
  const direct = value.replace(/^(?:oscar(?: piastri)?|piastri|奥斯卡|皮亚斯特里)[,，:： ]+/, "");
  const short = direct.replace(/(?:呢|啊|呀|吗|嘛)$/, "");
  const favorite = short.match(/^(?:你)?(?:最喜欢|最爱|喜欢|爱|偏爱)(?:吃|喝|听)?(?:什么|哪种)(.+)$/)
    || short.match(/^(?:你)?(?:最喜欢|最爱)(?:的)?(.+?)(?:是什么|是哪种)$/)
    || short.match(/^what(?:'s| is) your favou?rite (.+)$/)
    || short.match(/^what (?:kind of |type of )?(.+?) do you (?:like|prefer|listen to)(?: (?:best|most))?$/);
  if (favorite) {
    const topic = Object.keys(TOPIC_NAMES).find((key) => TOPIC_NAMES[key].test(favorite[1]));
    if (topic) return descriptor("favorite", OPTIONS.filter((item) => item.topic === topic));
  }
  if (/^(?:你)?(?:最喜欢|最爱|喜欢)(?:吃|喝|听)什么$/.test(short)) {
    const topic = short.includes("吃") ? "food" : short.includes("喝") ? "drinks" : "music";
    return descriptor("favorite", OPTIONS.filter((item) => item.topic === topic));
  }
  const candidate = short
    .replace(/^(?:你|您)?(?:更|比较|最)?(?:喜欢|爱|偏爱|偏好)(?:吃|喝|听)?\s*/, "")
    .replace(/^(?:你是|你选|你会选|你更喜欢)\s*/, "")
    .replace(/^(?:(?:do|would) you )?(?:prefer|like|love)\s+/, "")
    .replace(/^what (?:do you prefer|would you choose)[,， ]+/, "")
    .replace(/^are you\s+/, "")
    .replace(/[,， ]*(?:你(?:更喜欢哪个|喜欢哪个|选哪个|会选哪个)|选一个|二选一|which (?:one )?(?:do you prefer|would you choose))$/, "");
  const parts = candidate.split(/还是|或者|或|\s+or\s+/);
  const options = parts.map(option);
  if (parts.length >= 2 && parts.length <= 3 && options.every(Boolean) && new Set(options.map((item) => item.id)).size === options.length) return descriptor("choice", options);
  if (parts.length === 1 && options[0] && candidate !== short) return descriptor("like", options);
  return null;
}

export function classifyCharacterPreference(message, history = []) {
  const value = normalized(message);
  const direct = directPreference(value);
  if (direct) return direct;
  // Only explicit preference statements plus a reciprocal question inherit a
  // topic. General history, allegations and appended instructions grant nothing.
  const reciprocal = value.match(/^(?:我(?:更)?喜欢|i (?:like|prefer))\s*(.+?)[,，]\s*(?:你呢|那你呢|what about you|and you)$/);
  if (reciprocal) {
    const previous = directPreference(`你喜欢${reciprocal[1]}`);
    if (previous) return { ...previous, followup: "reciprocal" };
  }
  const target = followupTarget(value);
  const followup = FOLLOWUPS.get(value) || (target ? "alternative" : null);
  if (!followup || !Array.isArray(history)) return null;
  // Walk the bounded conversation only across short preference followups;
  // do not revive a preference across an intervening unrelated user request.
  for (const item of [...history].slice(-8).reverse()) {
    if (item?.role !== "user") continue;
    const earlier = normalized(item.content);
    const preference = directPreference(earlier) || (/^(?:我(?:更)?喜欢|i (?:like|prefer))\s*/.test(earlier) ? directPreference(earlier.replace(/^(?:我(?:更)?喜欢|i (?:like|prefer))\s*/, "你喜欢")) : null);
    if (preference && (!target || target.topic === preference.topic)) return { ...preference, followup, ...(target ? { target: { id: target.id, en: target.en, zh: target.zh } } : {}) };
    if (!FOLLOWUPS.has(earlier) && !followupTarget(earlier)) return null;
  }
  return null;
}

// Bounded response backstop: a clear preference question needs an answer,
// not a generic clarification, AI disclaimer or mirror of the two options.
// This is not semantic grading of arbitrary generated prose.
export function preferenceResponseIssue(preference, en, zh, chineseInput = false) {
  const checks = [String(en || ""), ...(chineseInput ? [String(zh || "")] : [])];
  for (const value of checks) {
    if (/(?:what do you mean|could you clarify|can you clarify|what (?:exactly )?are you asking|which (?:one |part )?do you mean|more (?:context|details)|你(?:具体)?指什么|什么意思|澄清|说清楚|更多(?:背景|信息)|具体一点|什么方面|as an ai|i (?:don't|do not) have (?:personal )?preferences|没有(?:个人|真正的)?(?:偏好|喜好)|无法(?:替|代替).{0,15}(?:回答|决定|偏好))/i.test(value)) return "unnecessary_clarification";
    const selected = preference.options.some(({ en: label, zh: translated, id }) => new RegExp(`[a-z]`, "i").test(value) && new RegExp(`\\b(?:${label}|${id})\\b`, "i").test(value) || value.includes(translated));
    const mirror = classifyCharacterPreference(value);
    if (!preference.followup && mirror?.kind === "choice") return "options_instead_of_answer";
    if (!preference.followup && preference.kind !== "favorite" && !selected) return "missing_preference_answer";
    if (!preference.followup && /[?？]\s*$/.test(value) && !/[.!。！]/.test(value.slice(0, -1))) return "question_instead_of_answer";
  }
  return null;
}
