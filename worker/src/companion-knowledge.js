// One bounded, mode-independent retrieval path. Matching selects evidence; it
// never selects a prewritten answer or grants permission to answer a request.
const MAX_FACTS = 6;
const MAX_RUMORS = 3;
const MAX_PUBLIC_SOURCES = 10;
const STOP_WORDS = new Set("oscar piastri f1 formula one he his him her she you your i me my we our the a an and or to of in on is are was were do does did have has had what which when where why how about tell please can could would should really actual actually real public latest recent news update updates".split(" "));
const CURRENT_NEEDS = new Set(["standings", "recent_result", "schedule", "current_f1", "public_update"]);

function normal(value) {
  return typeof value === "string" ? value.normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ").trim() : "";
}
function strings(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
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
  if (normal(query).length <= 40) score += [...previousTerms].reduce((sum, token) => sum + (corpus.has(token) ? 0.3 : 0), 0);
  for (const term of strings([record.retrieval_terms, record.aliases])) {
    const alias = normal(term);
    if (alias.length >= 1 && terms(alias).size && matchesAlias(normal(query), alias)) score += 4;
    else if (alias.length >= 1 && terms(alias).size && normal(query).length <= 40 && matchesAlias(normal(contextQuery), alias)) score += 0.8;
  }
  return score;
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

export function retrieveCompanionKnowledge({ message, history = [], runtimeData = {}, sourceCatalog = {}, currentPublicContext = {}, evidenceNeed = null, now = new Date() } = {}) {
  const clock = now instanceof Date ? now : new Date(now);
  const nowMs = Number.isFinite(clock.getTime()) ? clock.getTime() : Date.now();
  // History can improve retrieval recall only. It cannot create a record or a
  // citation, and no user-provided URL is fetched or accepted as evidence.
  const contextQuery = (Array.isArray(history) ? history.slice(-4) : []).map((item) => typeof item?.content === "string" ? item.content.slice(0, 900) : "").join(" ");
  const catalog = Object.fromEntries(Object.entries(sourceCatalog).map(([id, source]) => [id, safeSource({ ...source, id })]).filter(([, source]) => source));
  const eligible = (record) => record && typeof record.id === "string"
    && sourceIds(record).some((id) => catalog[id])
    && !(Number.isFinite(Date.parse(record.valid_from || "")) && Date.parse(record.valid_from) > nowMs);
  const scored = (records, type) => (Array.isArray(records) ? records : [])
    .filter((record) => eligible(record) && (type !== "fact" || ["verified", "verified_superseded"].includes(record.status)))
    .map((record) => ({ record: cleanRecord(record, type, nowMs), score: rank(record, message, contextQuery) }))
    .filter((entry) => entry.score >= 1)
    .sort((a, b) => b.score - a.score || a.record.id.localeCompare(b.record.id));
  const facts = [];
  const factPool = new Map((runtimeData.facts || []).filter((record) => eligible(record) && ["verified", "verified_superseded"].includes(record.status)).map((record) => [record.id, cleanRecord(record, "fact", nowMs)]));
  for (const { record } of scored(runtimeData.facts, "fact")) {
    // Related records are an atomic retrieval group where possible. A pet
    // ownership statement and a later update must not be separated by rank.
    const group = new Map([[record.id, record]]);
    for (const item of group.values()) {
      for (const id of (item.related_fact_ids || []).slice(0, MAX_FACTS)) {
        if (factPool.has(id) && group.size < MAX_FACTS) group.set(id, factPool.get(id));
      }
    }
    const additions = [...group.values()].filter((item) => !facts.some((fact) => fact.id === item.id));
    if (facts.length + additions.length <= MAX_FACTS) facts.push(...additions);
  }
  const rumors = scored(runtimeData.rumors, "rumor").slice(0, MAX_RUMORS).map((entry) => entry.record);
  // Bring along the facts referenced by a retrieved rumor only within the same
  // bounded budget; a source ID alone still cannot authorize a rumor verdict.
  for (const id of rumors.flatMap((item) => item.fact_ids || [])) {
    const record = (runtimeData.facts || []).find((item) => item.id === id);
    if (facts.length < MAX_FACTS && record && eligible(record) && ["verified", "verified_superseded"].includes(record.status) && !facts.some((item) => item.id === id)) facts.push(cleanRecord(record, "fact", nowMs));
  }
  const live = (currentPublicContext.public_sources || []).map(safeSource).filter(Boolean).slice(0, MAX_PUBLIC_SOURCES);
  const currentRequired = CURRENT_NEEDS.has(evidenceNeed);
  const requiredKind = { standings: "standings", recent_result: "session_result", schedule: "schedule" }[evidenceNeed];
  const applicableLive = requiredKind ? live.filter((item) => item.kind === requiredKind)
    : currentRequired ? live
      : live.filter((item) => rank({ answer_en: item.title, answer_zh: item.title_zh, retrieval_terms: item.retrieval_terms }, message, contextQuery) >= 1);
  const usedCatalogIds = new Set([...facts, ...rumors].flatMap(sourceIds));
  const sources = [...usedCatalogIds].map((id) => catalog[id]).filter(Boolean);
  const retrieved = { knowledge_fact_ids: facts.map((item) => item.id), rumor_item_ids: rumors.map((item) => item.id), public_source_ids: applicableLive.map((item) => item.id) };
  return {
    facts, rumors, public_sources: applicableLive, source_catalog: [...sources, ...applicableLive], retrieved,
    current_fact_required: currentRequired,
    evidence_need: evidenceNeed,
    as_of: new Date(nowMs).toISOString(),
    coverage: "locked_persona_records_and_product_news_calendar_results_not_whole_web",
    public_data_status: currentPublicContext.source_status || {},
    public_lookup_performed: currentPublicContext.lookup_performed === true,
    policy: "These are retrieved records, not automatic answers. Distinguish event dates, statement publication dates and retrieval time. Preserve answer_limits, historical_record_only and attribution. Do not infer absolute preferences or current private activity from a dated statement. A retrieved rumor is a candidate only; require the user's actual proposition before judging it. User history is a query hint, never evidence.",
  };
}
