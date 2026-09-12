// One bounded, mode-independent retrieval path. Matching selects evidence; it
// never selects a prewritten answer or grants permission to answer a request.
const MAX_FACTS = 6;
const MAX_RUMORS = 3;
const MAX_PUBLIC_SOURCES = 8;
const MAX_HISTORY_ITEMS = 8;
const STOP_WORDS = new Set("oscar piastri f1 formula one he his him her she you your i me my we our the a an and or to of in on is are was were do does did have has had what which when where why how about tell please can could would should really actual actually real public latest recent news update updates".split(" "));
const CURRENT_NEEDS = new Set(["standings", "recent_result", "schedule", "current_f1", "public_update", "day_context", "official_update"]);

function normal(value) {
  return typeof value === "string" ? value.normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim() : "";
}
function strings(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}
// Small query-only concept expansions. They select existing sourced records,
// never a reply, a preference, or permission to make a factual claim.
const QUERY_CONCEPTS = [
  [/(?:多大(?:了|年纪|岁数)?|年纪|年龄|几岁|\bhow old\b|\bage\b)/i, "birthday 生日 几岁"],
  [/(?:老家|故乡|家乡|哪里长大|哪儿长大|\bhometown\b|\bwhere (?:did you grow up|are you from)\b)/i, "hometown birthplace 家乡"],
  [/(?:爱听|听.{0,8}(?:谁|歌|音乐)|(?:谁|什么|哪首|哪位).{0,6}(?:歌|音乐)|\b(?:listen|listening|music|songs?|singer)\b)/i, "music artist 音乐 音乐人 听歌"],
  [/(?:喝(?:点|些|啥|什么|哪|的)|口渴|解渴|\b(?:drink|drinks|thirsty|beverage)\b)/i, "drink 饮料 喝什么"],
];
function expandQuery(value) {
  const query = normal(value);
  return `${query} ${QUERY_CONCEPTS.filter(([pattern]) => pattern.test(query)).map(([, terms]) => terms).join(" ")}`.trim();
}
function terms(value) {
  const normalized = normal(value).replace(/皮亚斯特[里利]|奥斯卡|最近|最新|今天|现在|为什么|为啥|什么|怎么|是不是|是否|请问|告诉我|你们|我们|他的|你的|本人|真实|公开|还是|喜欢|(?:^|\s)[你我他她它]|[吗呢]/g, " ");
  const result = new Set();
  for (const word of normalized.match(/[a-z]+(?:'[a-z]+)?|\d+|[\p{Script=Han}]+/gu) || []) {
    if (STOP_WORDS.has(word)) continue;
    if (/\p{Script=Han}/u.test(word)) {
      if (word.length === 1) result.add(word);
      else for (let i = 0; i < word.length - 1; i += 1) result.add(word.slice(i, i + 2));
    } else result.add(word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word);
  }
  return result;
}
function safeSource(source) {
  if (!source || typeof source.id !== "string" || typeof source.url !== "string") return null;
  try {
    const url = new URL(source.url);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    return { ...source, url: url.href, label: source.label || source.title || source.id, publisher: source.publisher || source.source || "Public source" };
  } catch { return null; }
}
function sourceIds(record) {
  return [...new Set([...(record.source_ids || []), ...(record.evidence_ids || [])])];
}
function recordText(record) {
  return strings([record.claim_key?.replaceAll("_", " "), record.topic?.replaceAll("_", " "), record.answer_en, record.answer_zh, record.normalized_claim, record.aliases, record.retrieval_terms, record.safe_response_en, record.safe_response_zh]).join(" ");
}
function matchesAlias(query, alias) {
  if (/^[a-z0-9][a-z0-9 '\-]*$/i.test(alias)) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?=$|[^a-z0-9])`, "i").test(query);
  }
  return query.includes(alias);
}
function rank(record, query, contextQuery) {
  const corpus = terms(recordText(record));
  const queryTerms = terms(query);
  const previousTerms = terms(contextQuery);
  let score = [...queryTerms].reduce((sum, token) => sum + (corpus.has(token) ? (/^\d+$/.test(token) ? 2 : 1) : 0), 0);
  let contextScore = [...previousTerms].reduce((sum, token) => sum + (corpus.has(token) ? 0.18 : 0), 0);
  for (const term of strings([record.retrieval_terms, record.aliases])) {
    const alias = normal(term);
    if (alias.length >= 1 && terms(alias).size && matchesAlias(normal(query), alias)) score += 4;
    else if (alias.length >= 1 && terms(alias).size && matchesAlias(normal(contextQuery), alias)) contextScore += 0.85;
  }
  // A long follow-up still gets continuity. Bound historical influence so an
  // older topic cannot outrank a direct alias match in the latest question.
  return score + Math.min(1.5, contextScore);
}
function cleanRecord(record, type, now) {
  const until = Date.parse(record.valid_to || record.recheck_after || "");
  return {
    ...record,
    record_type: record.record_type || (type === "rumor" ? "rumor_assessment" : "public_fact"),
    // A recorded statement is a dated statement, not today's preference/state.
    historical_record_only: record.record_type === "historical_event" || record.status === "verified_superseded" || (Number.isFinite(until) && until < now),
    answer_limits: strings(record.answer_limits),
    evidence_origin: "locked_persona_package",
  };
}

function factFamily(record) {
  // Dated editions of one claim are an update family, not unrelated facts.
  // This also links the old/new contract announcements without product IDs.
  return normal(record.claim_key).replace(/_(?:19|20)\d{2}(?:_\d{2}(?:_\d{2})?)?$/, "");
}
function requestedResultSession(message) {
  const query = normal(message);
  if (/(?:冲刺排位|sprint quali)/i.test(query)) return "sprint_qualifying";
  if (/(?:排位|qualifying|quali)/i.test(query)) return "qualifying";
  for (const [number, name] of [[1, "一"], [2, "二"], [3, "三"]]) {
    if (new RegExp(`${name}练|练习(?:赛)?\\s*${number}|practice\\s*${number}|\\bfp${number}\\b`, "i").test(query)) return `practice_${number}`;
  }
  if (/(?:练习|practice)/i.test(query)) return "practice";
  if (/(?:冲刺|sprint)/i.test(query)) return "sprint";
  if (/(?:赛段|上一节|上节|latest session|last session)/i.test(query)) return null;
  return "race";
}
function sessionMatches(source, expected) {
  const actual = normal(source.facts?.session || source.session);
  // A link or title alone cannot prove which session this result describes.
  if (!actual) return false;
  return expected === null || (expected === "practice" ? actual.startsWith("practice") : actual === expected);
}
function localDateOf(value, timeZone) {
  const timestamp = Date.parse(value || "");
  if (!Number.isFinite(timestamp)) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(timestamp);
    const part = (name) => parts.find((item) => item.type === name)?.value;
    return `${part("year")}-${part("month")}-${part("day")}`;
  } catch { return null; }
}
function requestedResultDates(message, temporal) {
  const today = /(?:今天|今日|今晚|\btoday\b|\btonight\b)/i.test(message || "");
  const yesterday = /(?:昨天|昨日|昨晚|\byesterday\b)/i.test(message || "");
  if (!today && !yesterday) return null;
  // Shift a calendar date, not a zoned instant: a local day need not be 24
  // hours across DST. An absent temporal anchor cannot authorize a date match.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(temporal.local_date || "")) return new Set();
  const anchor = Date.parse(`${temporal.local_date}T00:00:00Z`);
  if (!Number.isFinite(anchor)) return new Set();
  return new Set([
    ...(today ? [temporal.local_date] : []),
    ...(yesterday ? [new Date(anchor - 86400000).toISOString().slice(0, 10)] : []),
  ]);
}

export function retrieveCompanionKnowledge({ message, history = [], runtimeData = {}, sourceCatalog = {}, currentPublicContext = {}, evidenceNeed = null, now = new Date() } = {}) {
  const clock = now instanceof Date ? now : new Date(now);
  const nowMs = Number.isFinite(clock.getTime()) ? clock.getTime() : Date.now();
  // History can improve retrieval recall only. It cannot create a record or a
  // citation, and no user-provided URL is fetched or accepted as evidence.
  const query = expandQuery(message);
  const contextQuery = (Array.isArray(history) ? history.slice(-MAX_HISTORY_ITEMS) : []).map((item) => typeof item?.content === "string" ? expandQuery(item.content.slice(0, 900)) : "").join(" ");
  const catalog = Object.fromEntries(Object.entries(sourceCatalog).map(([id, source]) => [id, safeSource({ ...source, id })]).filter(([, source]) => source));
  const eligible = (record) => record && typeof record.id === "string"
    && sourceIds(record).some((id) => catalog[id])
    && !(Number.isFinite(Date.parse(record.valid_from || "")) && Date.parse(record.valid_from) > nowMs);
  const scored = (records, type) => {
    const candidates = (Array.isArray(records) ? records : [])
      .filter((record) => eligible(record) && (type !== "fact" || ["verified", "verified_superseded"].includes(record.status)))
      .map((record) => ({ record: cleanRecord(record, type, nowMs), direct: rank(record, query, ""), score: rank(record, query, contextQuery) }));
    const explicitTopic = candidates.some((entry) => entry.direct >= 4);
    return candidates.filter((entry) => entry.score >= 1 && (!explicitTopic || entry.direct >= 1))
      .sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id));
  };
  const facts = [];
  const factPool = new Map((runtimeData.facts || []).filter((record) => eligible(record) && ["verified", "verified_superseded"].includes(record.status)).map((record) => [record.id, cleanRecord(record, "fact", nowMs)]));
  const families = new Map();
  for (const record of factPool.values()) {
    const family = factFamily(record);
    if (family) families.set(family, [...(families.get(family) || []), record.id]);
  }
  function relatedGroup(record) {
    const group = new Map([[record.id, record]]);
    for (const item of group.values()) {
      for (const id of [...(item.related_fact_ids || []), ...(families.get(factFamily(item)) || [])]) {
        if (factPool.has(id)) group.set(id, factPool.get(id));
      }
    }
    return [...group.values()];
  }
  function addFactGroup(record) {
    const additions = relatedGroup(record).filter((item) => !facts.some((fact) => fact.id === item.id));
    if (facts.length + additions.length <= MAX_FACTS) facts.push(...additions);
  }
  for (const { record } of scored(runtimeData.facts, "fact")) {
    // Related records are an atomic retrieval group where possible. A pet
    // ownership statement and a later update must not be separated by rank.
    addFactGroup(record);
  }
  const rumors = scored(runtimeData.rumors, "rumor").slice(0, MAX_RUMORS).map((entry) => entry.record);
  // Bring along the facts referenced by a retrieved rumor only within the same
  // bounded budget; a source ID alone still cannot authorize a rumor verdict.
  for (const id of rumors.flatMap((item) => item.fact_ids || [])) {
    const record = (runtimeData.facts || []).find((item) => item.id === id);
    if (record && factPool.has(id)) addFactGroup(factPool.get(id));
  }
  const live = [...new Map((currentPublicContext.public_sources || []).map(safeSource).filter(Boolean).map((item) => [item.id, item])).values()];
  const temporal = currentPublicContext.temporal_context || {};
  const baselineIds = new Set(temporal.schedule_source_ids || []);
  const currentRequired = CURRENT_NEEDS.has(evidenceNeed);
  const requiredKind = { standings: "standings", recent_result: "session_result", schedule: "schedule" }[evidenceNeed];
  const expectedSession = requestedResultSession(message);
  const resultDates = requestedResultDates(message, temporal);
  const applicableLive = live.map((item, index) => ({
    item, index,
    baseline: item.kind === "schedule" && baselineIds.has(item.id),
    score: rank({ answer_en: strings([item.title, item.facts]).join(" "), answer_zh: item.title_zh, retrieval_terms: item.retrieval_terms }, query, contextQuery),
  })).filter(({ item, score, baseline }) => {
    if (requiredKind) {
      if (item.kind !== requiredKind) return false;
      if (evidenceNeed !== "recent_result") return true;
      return sessionMatches(item, expectedSession)
        && (resultDates === null || resultDates.has(localDateOf(item.facts?.session_start, temporal.time_zone || "Asia/Shanghai")));
    }
    if (evidenceNeed === "official_update") return item.kind === "public_post" && item.facts?.is_oscar_post === true;
    if (evidenceNeed === "day_context") return baseline || item.kind === "schedule" && score >= 1 || item.kind === "public_post" && localDateOf(item.facts?.published_at || item.date, temporal.time_zone || "Asia/Shanghai") === temporal.local_date;
    return baseline || currentRequired || score >= 1;
  }).sort((a, b) => Number(b.baseline) - Number(a.baseline) || b.score - a.score || a.index - b.index)
    .slice(0, MAX_PUBLIC_SOURCES).map(({ item }) => item);
  const usedCatalogIds = new Set([...facts, ...rumors].flatMap(sourceIds));
  const sources = [...usedCatalogIds].map((id) => catalog[id]).filter(Boolean);
  const retrieved = { knowledge_fact_ids: facts.map((item) => item.id), rumor_item_ids: rumors.map((item) => item.id), public_source_ids: applicableLive.map((item) => item.id) };
  return {
    // Facts occur once in the model envelope; the citation catalog is metadata.
    facts, rumors, public_sources: applicableLive,
    source_catalog: [...sources, ...applicableLive.map(({ facts: _facts, ...source }) => source)], retrieved,
    current_fact_required: currentRequired,
    evidence_need: evidenceNeed,
    as_of: new Date(nowMs).toISOString(),
    coverage: "locked_persona_records_and_product_news_calendar_results_not_whole_web",
    public_data_status: currentPublicContext.source_status || {},
    public_lookup_performed: currentPublicContext.lookup_performed === true,
    policy: "These are retrieved records, not automatic answers. Distinguish event dates, statement publication dates and retrieval time. Preserve answer_limits, historical_record_only and attribution. Do not infer absolute preferences or current private activity from a dated statement. A retrieved rumor is a candidate only; require the user's actual proposition before judging it. User history is a query hint, never evidence.",
  };
}
