#!/usr/bin/env node
// Opt-in six-turn event-memory regression. No credentials, feedback writes or loop.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_BASE_URL, appendGeneratedTurn, buildConversationPayload, buildCurlArgs,
  checkConversationResponse, parseConversationArgs, sanitizeConversationDiagnostic,
} from "./eval_companion_conversation.mjs";

export { DEFAULT_BASE_URL };
export const EVENT_CASES = Object.freeze([
  { id: "previous_race", message: "你的上一场比赛是什么", intent: "event_fact" },
  { id: "same_race_location", message: "那场在哪跑的", intent: "event_fact", same_event_as: "previous_race" },
  { id: "same_race_result", message: "你那场第几", intent: "event_fact", same_event_as: "previous_race" },
  { id: "next_event", message: "接下来呢", intent: "event_fact" },
  { id: "latest_practice", message: "最近一次练习呢", intent: "event_fact" },
  { id: "hello_after_events", message: "你好", intent: "greeting", micro: true, max_en_words: 18 },
].map((item) => Object.freeze({ ...item, mode: "free", kinds: Object.freeze(item.micro ? ["social"] : ["evidence", "insufficient"]) })));

const RELATIONS = new Set(["previous", "next", "latest", "named", "earlier"]);
const REQUESTED = new Set(["identity", "result", "schedule", "context"]);
const STATUSES = new Set(["matched_result", "last_known_result", "schedule_only", "missing_result", "unresolved", "stale_schedule"]);
const isRecord = (value) => value && typeof value === "object" && !Array.isArray(value);
const identifier = (value) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value);
const eventIdentity = (value) => typeof value === "string" && value.trim().length > 0 && value.length <= 240 && !/[\u0000-\u001f\u007f]/.test(value);
const code = (value) => typeof value === "string" && /^[a-zA-Z][a-zA-Z0-9_]{0,79}$/.test(value) ? value : null;
const ids = (value) => Array.isArray(value) ? [...new Set(value.filter(identifier))].slice(0, 40) : [];

export function sanitizeEventQuery(value) {
  if (!isRecord(value)) return null;
  const result = {};
  if (RELATIONS.has(value.relation)) result.relation = value.relation;
  if (REQUESTED.has(value.requested)) result.requested = value.requested;
  if (value.session === null || typeof value.session === "string" && /^[a-z][a-z0-9_]{0,39}$/.test(value.session)) result.session = value.session;
  for (const name of ["target_event_id", "target_session_ref"]) {
    if (value[name] === null || eventIdentity(value[name])) result[name] = value[name];
  }
  if (STATUSES.has(value.status)) result.status = value.status;
  if (Array.isArray(value.source_ids)) result.source_ids = ids(value.source_ids);
  return Object.keys(result).length ? result : null;
}

function selectedSources(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).flatMap((item) => {
    if (!isRecord(item) || !identifier(item.id)) return [];
    const result = { id: item.id };
    for (const name of ["title", "label", "publisher", "source", "date", "kind"]) {
      if (typeof item[name] === "string") result[name] = item[name].slice(0, 300);
    }
    try {
      const url = new URL(item.url);
      if (url.protocol === "https:" && !url.username && !url.password) result.url = url.href;
    } catch { /* An invalid source link is reported by the contract checker. */ }
    return [result];
  });
}

function safePerformance(value) {
  if (!isRecord(value)) return null;
  const result = {};
  for (const name of ["context_ms", "generation_ms", "total_ms", "model_calls", "context_chars"]) {
    if (Number.isFinite(value[name]) && value[name] >= 0 && value[name] <= 3600000) result[name] = value[name];
  }
  return Object.keys(result).length ? result : null;
}

function safeValidation(value) {
  if (!isRecord(value)) return null;
  const result = {};
  for (const name of ["status", "recovery_reason"]) if (value[name] === null || code(value[name])) result[name] = value[name];
  if (typeof value.independent_verified === "boolean") result.independent_verified = value.independent_verified;
  if (Array.isArray(value.local_checks)) result.local_checks = value.local_checks.filter(code).slice(0, 30);
  for (const name of ["repair_count", "additional_review_requests"]) {
    if (Number.isInteger(value[name]) && value[name] >= 0 && value[name] <= 100) result[name] = value[name];
  }
  return Object.keys(result).length ? result : null;
}

export function checkEventResponse(testCase, status, body, earlierResults = []) {
  const result = checkConversationResponse(testCase, status, body);
  const errors = result.contract_errors, flags = result.heuristic_flags;
  if (status !== 200) return result;
  for (const name of ["answer_en", "answer_zh"]) {
    if (typeof body?.[name] !== "string" || !body[name].trim()) errors.push(`${name} must be a non-empty string`);
  }
  if (body?.fallback_id) errors.push("event and social answers must not use a fixed fallback");
  for (const name of ["public_source_ids", "retrieved_public_source_ids"]) {
    if (!Array.isArray(body?.[name]) || body[name].some((id) => !identifier(id))) errors.push(`${name} must be an array of bounded source IDs`);
  }
  const cited = ids(body?.public_source_ids), retrieved = new Set(ids(body?.retrieved_public_source_ids));
  const sources = selectedSources(body?.sources), sourceIds = new Set(sources.map((item) => item.id));
  if (!Array.isArray(body?.sources)) errors.push("sources must be an array");
  if (cited.some((id) => !retrieved.has(id) || !sourceIds.has(id))) errors.push("selected public citations must be retrieved and have returned source entries");
  if (sources.some((item) => !item.url)) errors.push("returned sources need credential-free HTTPS links");
  if (testCase.micro) {
    if (body?.event_query != null) errors.push("pure hello must not retain an event query");
    if ([body?.knowledge_fact_ids, body?.rumor_item_ids, body?.public_source_ids, body?.sources].some((value) => Array.isArray(value) && value.length)) errors.push("pure hello must not cite event or factual sources");
    if (/\b(?:race|circuit|session|p\d{1,2}|podium|finished|position|standings)\b|赛道|本站|上一场|下一场|名次|积分|登台|第[一二三四五六七八九十0-9]+名/i.test(`${body?.answer_en || ""} ${body?.answer_zh || ""}`)) flags.push("event detail leaked into hello after factual history");
    return result;
  }
  const query = sanitizeEventQuery(body?.event_query);
  if (!query || !RELATIONS.has(query.relation) || !REQUESTED.has(query.requested) || !STATUSES.has(query.status)
      || !Object.hasOwn(query, "session") || !Object.hasOwn(query, "target_event_id") || !Object.hasOwn(query, "target_session_ref")
      || !Array.isArray(body?.event_query?.source_ids) || body.event_query.source_ids.some((id) => !identifier(id))) errors.push("event turn needs a complete bounded event_query trace");
  if ((query?.source_ids || []).some((id) => !retrieved.has(id))) errors.push("event query sources must belong to this turn's retrieved public sources");
  if (body?.answer_kind === "evidence") {
    if (!cited.length) errors.push("event fact cannot rely only on static persona or rumor records");
    if (!cited.some((id) => query?.source_ids?.includes(id))) errors.push("event answer must cite a source associated with its event query");
  }
  // These are source-type review signals, not semantic validation or rewritten
  // answers. A partial factual answer with an explicit result gap is permitted.
  // A result merely retrieved, present in history or unrelated to this event
  // cannot count as an actual result citation for this turn.
  const eventCitations = sources.filter((source) => cited.includes(source.id) && retrieved.has(source.id) && query?.source_ids?.includes(source.id));
  result.event_source_check = {
    result_requested: query?.requested === "result",
    session_result_cited: eventCitations.some((source) => source.kind === "session_result"),
    schedule_only_cited: eventCitations.length > 0 && eventCitations.every((source) => source.kind === "schedule"),
    participation_or_recency_review: ["missing_result", "last_known_result"].includes(query?.status),
  };
  if (result.event_source_check.result_requested && body?.answer_kind === "evidence" && !result.event_source_check.session_result_cited) {
    flags.push("result answer labeled evidence cites no session_result: manually check any result/position claim; a partial answer must preserve the explicit result gap, and history is not evidence");
  }
  if (query?.status === "missing_result") flags.push("missing_result: manually review participation, completion and latest-session wording; a schedule alone does not establish that the driver took part or produced a result");
  if (query?.status === "last_known_result") flags.push("last_known_result: manually review previous/latest and participation wording; a dated observed result supports that recorded session, not an unverified latest relationship");
  const anchor = testCase.same_event_as && earlierResults.find((item) => item.id === testCase.same_event_as)?.event_query;
  if (anchor?.target_event_id && query?.target_event_id && anchor.target_event_id !== query.target_event_id) flags.push("same-race follow-up changed event identity; inspect generated history and source support");
  if (testCase.id === "same_race_result" && anchor?.target_session_ref && query?.target_session_ref && anchor.target_session_ref !== query.target_session_ref) flags.push("same-race result changed session identity; practice must not replace the Grand Prix");
  return result;
}

export function parseEventArgs(args) {
  if (args.some((arg) => arg === "--suite")) throw new Error("Event regression has one fixed six-turn suite");
  const options = parseConversationArgs(args);
  if (options.transport !== "curl") throw new Error("Event regression uses IPv4 curl only");
  delete options.suite;
  return options;
}

async function requestEvent({ endpoint, payload }) {
  const { stdout } = await promisify(execFile)("curl", buildCurlArgs(endpoint, payload), { maxBuffer: 1024 * 1024 });
  const split = stdout.lastIndexOf("\n");
  return { status: Number(stdout.slice(split + 1)), body: JSON.parse(stdout.slice(0, split)) };
}

export async function runEventSuite(options, { request = requestEvent, emit = (value) => console.log(JSON.stringify(value)), now = Date.now } = {}) {
  if (options.run !== true) throw new Error("Live event evaluation requires explicit --run");
  const safeOptions = parseEventArgs(["--run", "--base-url", options.baseUrl || DEFAULT_BASE_URL, "--transport", options.transport || "curl"]);
  const endpoint = new URL("/companion/chat", safeOptions.baseUrl).href;
  const results = [];
  let history = [], blocked = false;
  for (const testCase of EVENT_CASES) {
    if (blocked) {
      const skipped = { id: testCase.id, skipped: true, reason: "previous event turn failed its contract; no fabricated replacement history" };
      results.push(skipped); emit(skipped); continue;
    }
    const payload = buildConversationPayload(testCase, history), start = now();
    try {
      const { status, body } = await request({ endpoint, payload, transport: "curl" });
      const check = checkEventResponse(testCase, status, body, results);
      const result = {
        id: testCase.id, mode: testCase.mode, message: testCase.message, history_messages: payload.history.length,
        status, contract_passed: !check.contract_errors.length, heuristic_clear: !check.heuristic_flags.length,
        engine: body?.engine, model: body?.model, package_version: body?.package_version, source_hash: body?.source_hash,
        answer_kind: body?.answer_kind, route: body?.route, answer_en: body?.answer_en, answer_zh: body?.answer_zh,
        event_query: sanitizeEventQuery(body?.event_query), public_source_ids: ids(body?.public_source_ids),
        retrieved_public_source_ids: ids(body?.retrieved_public_source_ids), sources: selectedSources(body?.sources),
        ...check, performance: safePerformance(body?.performance), validation_trace: safeValidation(body?.validation_trace),
        request_id: typeof body?.request_id === "string" && /^[a-f0-9-]{36}$/i.test(body.request_id) ? body.request_id : null,
        error_code: code(body?.error_code), diagnostic: sanitizeConversationDiagnostic(body?.diagnostic), client_ms: now() - start,
      };
      results.push(result); emit(result);
      if (result.contract_passed) history = appendGeneratedTurn(history, testCase, body);
      else blocked = true;
    } catch (error) {
      const failed = { id: testCase.id, mode: testCase.mode, message: testCase.message, contract_passed: false, heuristic_clear: false, error: code(error.name) || "Error", cause: code(error.cause?.code || error.code), client_ms: now() - start };
      results.push(failed); emit(failed); blocked = true;
    }
  }
  const attempted = results.filter((item) => !item.skipped), times = attempted.map((item) => item.client_ms).sort((a, b) => a - b);
  const summary = {
    type: "summary", suite: "events", planned: EVENT_CASES.length, attempted: attempted.length, skipped: results.length - attempted.length,
    contract_passed: attempted.filter((item) => item.contract_passed).length, contract_failed: attempted.filter((item) => !item.contract_passed).length,
    heuristic_flagged: attempted.filter((item) => item.heuristic_flags?.length).length,
    event_evidence_labeled_answers: attempted.filter((item) => item.id !== "hello_after_events" && item.answer_kind === "evidence").length,
    event_answers_citing_session_result: attempted.filter((item) => item.event_source_check?.session_result_cited).length,
    event_answers_citing_schedule_only: attempted.filter((item) => item.event_source_check?.schedule_only_cited).length,
    event_result_answers_without_result_citation: attempted.filter((item) => item.answer_kind === "evidence" && item.event_source_check?.result_requested && !item.event_source_check.session_result_cited).length,
    event_participation_or_recency_reviews: attempted.filter((item) => item.event_source_check?.participation_or_recency_review).length,
    event_information_gaps: attempted.filter((item) => item.id !== "hello_after_events" && item.answer_kind === "insufficient").length,
    total_model_calls: attempted.every((item) => Number.isInteger(item.model_calls)) ? attempted.reduce((sum, item) => sum + item.model_calls, 0) : null,
    client_median_ms: times.length ? (times[Math.floor((times.length - 1) / 2)] + times[Math.floor(times.length / 2)]) / 2 : null,
    client_max_ms: times.length ? times.at(-1) : null,
    note: "Synthetic six-turn regression, not semantic proof or a complete-season coverage claim. Evidence labels and source-type counts are not verified claim coverage. Missing-result and last-known-result flags request human review, not automatic rejection of an honest partial answer. Inspect event identity, session type, participation/latest claims, source dates, exact gaps and bilingual fidelity manually. No fixed current event/position, feedback writes, automatic retry or extra model judge.",
  };
  emit(summary);
  return { results, summary };
}

async function main() {
  const options = parseEventArgs(process.argv.slice(2));
  if (!options.run) {
    console.log("Dry run: no requests. Add --run for one six-turn free-mode event conversation; not a continuous monitor. --transport curl (IPv4) --base-url HTTPS_ORIGIN. No credentials or feedback writes. Wait at least a minute between runs because the API rate limit is shared.");
    console.log(JSON.stringify({ suite: "events", transport: options.transport, base_url: options.baseUrl, cases: EVENT_CASES.map(({ id, mode, message }) => ({ id, mode, message })) }));
    return;
  }
  const { summary } = await runEventSuite(options);
  process.exitCode = summary.contract_failed || summary.heuristic_flagged || summary.skipped ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
