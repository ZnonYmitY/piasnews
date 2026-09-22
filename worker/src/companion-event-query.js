// Resolve event relationships against server-owned records. This chooses
// evidence, not answer text, permissions, or facts invented from conversation.
const text = value => typeof value === "string" ? value.normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'").trim() : "";
const time = value => Number.isFinite(Date.parse(value || "")) ? Date.parse(value) : null;
const RACE_CUE = /比赛|正赛|大奖赛|赛段|练习|排位|冲刺|赛站|赛程|跑的|跑了|跑过|跑完|race|grand prix|session|practice|qualifying|sprint|raced/;
const FOLLOWUP = /^(?:那(?:场|站|次|一场|一站|么)?|那你|你那|它|这场|这站|刚才|再前|前一|接下来|然后|下一个|what about|how about|and |where was|where did|how did|what position|which circuit|before that)/;
const VENUE_ALIASES = [["madrid", "马德里"], ["monza", "蒙扎"], ["baku", "巴库"], ["silverstone", "银石"], ["spa", "斯帕"], ["zandvoort", "赞德沃特"], ["suzuka", "铃鹿"], ["melbourne", "墨尔本"]];

function sessionType(value) {
  if (/冲刺排位|sprint quali/.test(value)) return "sprint_qualifying";
  if (/排位|qualifying|\bquali\b/.test(value)) return "qualifying";
  for (const [n, zh] of [[1, "一"], [2, "二"], [3, "三"]]) if (new RegExp(`${zh}练|练习(?:赛)?\\s*${n}|practice\\s*${n}|\\bfp${n}\\b`).test(value)) return `practice_${n}`;
  if (/练习|practice/.test(value)) return "practice";
  if (/冲刺|sprint/.test(value)) return "sprint";
  if (/赛段|上一节|上节|\bsessions?\b/.test(value)) return null;
  if (/比赛|正赛|大奖赛|赛站|\brace\b|grand prix|raced/.test(value)) return "race";
  return undefined;
}
function matchesSession(actual, expected) {
  return expected === null || actual === expected || expected === "practice" && /^practice_[123]$/.test(actual);
}
function boundaryMatch(value, alias) {
  if (!alias || alias.length < 2) return false;
  if (/^[a-z0-9 '\-]+$/.test(alias)) return new RegExp(`(?:^|[^a-z0-9])${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z0-9])`).test(value);
  return value.includes(alias);
}
function eventAliases(source) {
  const f = source.facts || {};
  const aliases = [f.name, f.name_zh, f.locality, f.circuit, f.country].map(text).filter(Boolean);
  for (const name of [text(f.name).replace(/\s+grand prix$/, ""), text(f.name_zh).replace(/大奖赛$/, "")]) if (name.length > 1) aliases.push(name);
  const corpus = aliases.join(" ");
  for (const [canonical, translated] of VENUE_ALIASES) if (boundaryMatch(corpus, canonical)) aliases.push(translated);
  return aliases;
}
function eventId(source) { return source?.facts?.event_id || source?.facts?.race_id || source?.facts?.session_ref?.replace(/:[^:]+$/, "") || null; }
function resultSession(source) { return source?.facts?.session || source?.facts?.session_ref?.split(":").at(-1); }
function fresh(source, context) { return (source?.facts?.record_freshness || context.source_status?.calendar?.status) === "fresh"; }
function unique(sources) {
  const selected = new Map();
  for (const source of sources.filter(Boolean)) if (!selected.has(source.id)) selected.set(source.id, source);
  return [...selected.values()]; // Catalog revisions precede compatibility views.
}
function dateSelector(value, nowMs, zone = "Asia/Shanghai") {
  const format = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
  const local = timestamp => { const p = format.formatToParts(timestamp); return ["year", "month", "day"].map(k => p.find(x => x.type === k).value).join("-"); };
  const dates = new Set();
  let invalid = false;
  const anchor = Date.parse(`${local(nowMs)}T00:00:00Z`);
  for (const [pattern, shift] of [[/今天|今日|\btoday\b/, 0], [/昨天|昨日|\byesterday\b/, -1], [/明天|明日|\btomorrow\b/, 1]]) if (pattern.test(value)) dates.add(new Date(anchor + shift * 86400000).toISOString().slice(0, 10));
  for (const match of value.matchAll(/(?:(20\d{2})[-年/])?(\d{1,2})[-月/](\d{1,2})(?:日|号)?/g)) {
    const date = `${match[1] || local(nowMs).slice(0, 4)}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    if (time(`${date}T00:00:00Z`) !== null && new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date) dates.add(date);
    else invalid = true;
  }
  return { dates, matches: timestamp => !invalid && (dates.size === 0 || dates.has(local(timestamp))) };
}

/** Returns null for non-event turns. User/assistant statements never become evidence. */
export function resolveCompanionEventQuery({ message, history = [], currentPublicContext = {}, now = new Date(), depth = 0 } = {}) {
  const value = text(message);
  if (!value || depth > 4) return null;
  const nowMs = now instanceof Date ? now.getTime() : time(now);
  if (!Number.isFinite(nowMs)) return null;
  const context = currentPublicContext;
  if (!Array.isArray(context.event_catalog) && !Array.isArray(context.result_catalog)) return null;
  const events = unique([...(context.event_catalog || []), ...(context.public_sources || []).filter(s => s.kind === "schedule")]).filter(s => time(s.facts?.race_start) !== null);
  const results = unique([...(context.result_catalog || []), ...(context.public_sources || []).filter(s => s.kind === "session_result")]).filter(s => time(s.facts?.session_start) !== null);
  const named = events.filter(source => eventAliases(source).some(alias => boundaryMatch(value, alias)));
  const ownSession = sessionType(value);
  const earlier = /再(?:往)?前(?:一)?(?:场|站|次)?|前一场|之前那场|before that|one before|race before/.test(value);
  const next = /下(?:一)?(?:场|站|次|节)|接下来|下一个|\bnext\b|upcoming/.test(value);
  const previous = /上(?:一)?(?:场|站|次|回|节)|上回|最近(?:的|一场|一次)?|刚(?:刚)?(?:结束|跑完|比完)|\b(?:last|latest|previous|most recent)\b/.test(value);
  const looksLikeFollowup = FOLLOWUP.test(value);
  const userHistory = Array.isArray(history) ? history.filter(item => item?.role === "user" && typeof item.content === "string").slice(-4) : [];
  let prior = null;
  const eventFollowup = RACE_CUE.test(value) || /那[场站次]|你那|这[场站]|第几|成绩|结果|名次|在哪|哪里|哪儿|什么时候|何时|接下来|下一个|再前|前一|今天|昨天|明天|去年|前年|今年|明年|20\d{2}|\d{1,2}月|where|when|which circuit|what position|how did|before that|\b(?:last|this|next) year\b|\bnext\b|\btomorrow\b|\byesterday\b|\btoday\b/.test(value);
  if (looksLikeFollowup && eventFollowup && userHistory.length) {
    const priorMessage = userHistory.at(-1).content;
    prior = resolveCompanionEventQuery({ message: priorMessage, history: userHistory.slice(0, -1), currentPublicContext, now, depth: depth + 1 });
  }
  const bareRelative = /^(?:你的?|他(?:的)?|oscar(?:'s)?\s*)?(?:上|下|前)(?:一)?(?:场|站)(?:呢|是什么|是哪[场站个]|在哪里|在哪|在哪儿|什么时候|怎么样|的成绩|成绩如何)?[?？。!！]*$/.test(value);
  const eventCue = RACE_CUE.test(value) || bareRelative || /上回.{0,10}(?:跑|哪|比赛)/.test(value);
  const bareName = value.replace(/^(?:聊聊|说说|关于|talk about|tell me about)\s*/, "").replace(/(?:呢|这场|那场|那站)?[?？。!！]*$/, "").trim();
  const bareNamedTopic = named.some(source => eventAliases(source).includes(bareName));
  if (named.length && !eventCue && !prior && !bareNamedTopic && !/成绩|名次|第几|结果|\bresult\b|\bposition\b/.test(value)) return null;
  if (!named.length && !prior && !(eventCue && (previous || next || earlier))) return null;
  // Existing day/session selectors own standalone today/yesterday questions;
  // this module handles relationships and named events, not every time phrase.
  const relation = next ? "next" : earlier ? "earlier" : named.length ? "named" : previous ? (ownSession !== undefined && ownSession !== "race" ? "latest" : "previous") : prior ? prior.query.relation : "named";
  const session = ownSession !== undefined ? ownSession : prior?.query.session !== undefined ? prior.query.session : "race";
  const asksResult = /第几|成绩|结果|表现|跑得|怎么样|如何|名次|完赛|拿分|积分|result|position|finish|how.{0,30}(?:go|did|was)|points/.test(value);
  const asksIdentity = /是什么|哪[场站个里儿]|在哪|哪里|哪儿|什么时候|何时|what was|which|where|when/.test(value);
  const requested = asksResult ? "result" : relation === "next" ? "schedule" : asksIdentity || previous || earlier ? "identity" : prior?.query.requested || "context";
  const relativeYear = /前年/.test(value) ? -2 : /去年|\blast year\b/.test(value) ? -1 : /明年|\bnext year\b/.test(value) ? 1 : /今年|\bthis year\b/.test(value) ? 0 : null;
  const year = value.match(/\b(20\d{2})\b/)?.[1] || (relativeYear !== null ? String(new Date(nowMs).getUTCFullYear() + relativeYear) : null);
  const dates = dateSelector(value, nowMs, context.temporal_context?.time_zone || "Asia/Shanghai");
  // A year-only followup changes the year, not the identity of a named GP.
  const priorNamed = year && !dates.dates.size && prior?.query.relation === "named" ? events.find(s => eventId(s) === prior.query.target_event_id) : null;
  const sameNamedEvent = source => !priorNamed || text(source.facts?.name || source.facts?.race_name) === text(priorNamed.facts.name);
  const allSlots = events.flatMap(source => Object.entries(source.facts.sessions || { race: source.facts.race_start })
    .filter(([key, start]) => matchesSession(key, session) && time(start) !== null)
    .map(([key, start]) => ({ source, eventId: eventId(source), session: key, ref: `${eventId(source)}:${key}`, start: time(start) })))
    .filter(slot => sameNamedEvent(slot.source) && (!year || new Date(slot.start).getUTCFullYear() === Number(year)) && dates.matches(slot.start)).sort((a, b) => a.start - b.start);
  const observed = slot => results.find(source => source.facts.session_ref === slot.ref);
  // Scheduled elapsed time is only an expectation. An observed result is
  // separately required to say the driver participated or give a position.
  const expectedPast = slot => slot.start + (slot.session === "race" ? 135 : 75) * 60000 <= nowMs || Boolean(observed(slot));
  let slot = null;
  if (dates.dates.size) {
    const ids = named.length ? new Set(named.map(eventId)) : null;
    slot = allSlots.filter(s => !ids || ids.has(s.eventId)).at(-1) || null;
  } else if (relation === "next") {
    const ids = named.length ? new Set(named.map(eventId)) : null;
    slot = allSlots.find(s => (!ids || ids.has(s.eventId)) && fresh(s.source, context) && s.start > nowMs) || null;
  } else if (relation === "earlier") {
    const anchor = prior && allSlots.find(s => s.eventId === prior.query.target_event_id && (prior.query.target_session_ref ? s.ref === prior.query.target_session_ref : true));
    if (anchor) slot = allSlots.filter(s => fresh(s.source, context) && s.start < anchor.start && expectedPast(s)).at(-1) || null;
  } else if (named.length) {
    const ids = new Set(named.map(eventId));
    const matching = allSlots.filter(s => ids.has(s.eventId));
    slot = matching.filter(s => s.start <= nowMs).at(-1) || matching[0] || null;
  } else if (priorNamed) {
    slot = allSlots.filter(s => s.start <= nowMs).at(-1) || allSlots[0] || null;
  } else if (prior && !previous) {
    slot = allSlots.find(s => s.eventId === prior.query.target_event_id && matchesSession(s.session, session)) || null;
    if (slot && session !== "race") slot = allSlots.filter(s => s.eventId === slot.eventId && matchesSession(s.session, session)).at(-1);
  } else {
    slot = allSlots.filter(s => fresh(s.source, context) && expectedPast(s)).at(-1) || null;
  }
  let result = slot && slot.start <= nowMs && relation !== "next" ? observed(slot) : null;
  const relationVerified = Boolean(slot && fresh(slot.source, context));
  // With no usable current calendar, return the last recorded session with an
  // explicit gap about the latest relationship, never silently upgrade it.
  if (!slot && relation !== "next" && relation !== "earlier" && !named.length) result = results.filter(s => sameNamedEvent(s) && matchesSession(resultSession(s), session)
    && (!year || new Date(time(s.facts.session_start)).getUTCFullYear() === Number(year)) && dates.matches(time(s.facts.session_start)))
    .sort((a, b) => time(a.facts.session_start) - time(b.facts.session_start)).at(-1) || null;
  const targetId = slot?.eventId || eventId(result);
  const sources = unique([result, slot?.source]).slice(0, 2);
  const status = result ? relationVerified || relation === "named" ? "matched_result" : "last_known_result"
    : slot ? relation === "next" || slot.start > nowMs ? relationVerified ? "schedule_only" : "stale_schedule" : "missing_result" : "unresolved";
  return {
    query: { relation, requested, session, target_event_id: targetId || null, target_session_ref: slot?.ref || result?.facts?.session_ref || null, status, source_ids: sources.map(s => s.id) },
    sources,
    context: {
      relation_verified: relationVerified,
      result_source_id: result?.id || null,
      schedule_source_id: slot?.source?.id || null,
      target_event_name: slot?.source?.facts?.name || result?.facts?.race_name || null,
      target_event_name_zh: slot?.source?.facts?.name_zh || result?.facts?.race_name_zh || null,
      evidence_instruction: result && status === "last_known_result" ? "Give the dated last-known record and briefly note that the latest relationship is unconfirmed. Do not call it the actual most recent race/session."
        : result
        ? requested === "identity" ? "Give just the requested race/session identity, location or date in one short sentence. Do not add a position, next race, or a generic 'data I can see' disclaimer; source links and dates are displayed separately."
          : "Answer from the matching observed session result, keeping only details the user requested."
        : requested === "result" ? "There is no matching observed result. Generate a short specific missing-result reply (insufficient_current_fact / insufficient); do not repeat a position from history or cite the schedule as a result. Describing the missing data is not a real-person factual claim: set self_check.actual_facts false and temporal_scope none; omit assertions about what Oscar actually did."
          : "Only a published plan is available. Say 'on the calendar/schedule' when identifying it, not 'I raced/practised' or 'recorded for me'. Do not claim participation or completion. Keep any caveat specific and short.",
      interpretation: "Answer the current question using only the selected records. An observed result supports this named session; a schedule supports planned identity/time, not actual participation/completion. Snapshot age does not erase a historical result. A fresh calendar anchors the previous/next relationship, not result finality. If only part is supported, state that part and the specific missing part; do not invent a result, claim an old record is the latest without an anchor, or turn the whole answer into a generic refusal. Ordinary identity questions do not request a result recap. Do not repeat retrieval mechanics or unasked-for limitations. Use a dated provider result as recorded, not an assertion of final FIA classification.",
    },
  };
}
