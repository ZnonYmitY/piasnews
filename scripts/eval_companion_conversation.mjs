#!/usr/bin/env node
// Opt-in synthetic conversation regression. No keys, feedback writes or loop.
// node scripts/eval_companion_conversation.mjs --run --suite smoke --transport curl
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { checkModeResponse } from "./eval_companion_modes.mjs";

export const DEFAULT_BASE_URL = "https://piasnews-review.znonymity-piasnews.workers.dev";
export const ORIGIN = "https://znonymity.github.io";
// A deliberately distracting UI focus, NOT a claim about today's race/calendar.
export const AMBIENT_BAKU = { race: "Azerbaijan Grand Prix", session: "PRACTICE 1" };

const hello = { id: "hello_ambient", mode: "free", message: "你好", kinds: ["social"], intent: "greeting", max_en_words: 18, micro: true, surface_context: AMBIENT_BAKU };
const thanks = { id: "thanks", mode: "free", message: "谢谢你", kinds: ["social"], intent: "thanks", max_en_words: 12, micro: true };
const closing = { id: "closing", mode: "free", message: "先聊到这，拜拜", kinds: ["social"], intent: "closing", max_en_words: 18, micro: true };
const mixed = { id: "hello_and_today", mode: "free", message: "你好，今天有什么比赛安排吗？", kinds: ["evidence", "insufficient"], intent: "current_fact", surface_context: AMBIENT_BAKU };
const preference = { id: "preference", mode: "free", message: "你喜欢猫还是狗？", kinds: ["fictional"], intent: "preference" };
const factual = { id: "factual_followup", mode: "grounded", message: "那 Oscar 本人家里真的养过狗吗？", kinds: ["evidence", "insufficient"], intent: "historical_fact" };

export const CONVERSATION_SUITES = {
  // Six independent requests. The grounded fact case has no free-mode history.
  smoke: [hello, thanks, closing, mixed, preference, { ...factual, message: "Oscar 本人家里真的养过狗吗？" }],
  // One six-turn conversation, carrying actual generated replies (up to the
  // endpoint's eight-message history limit) inside free mode, as in the UI.
  // A real-person factual follow-up still needs evidence in free mode.
  multi: [hello, preference, { ...factual, mode: "free" }, thanks, mixed, closing],
};

export function englishWordCount(value) {
  return typeof value === "string" ? (value.match(/[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g) || []).length : 0;
}

export function sanitizeConversationDiagnostic(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const safe = {};
  // Copy only documented diagnostic fields, never arbitrary provider metadata,
  // error messages, raw output, headers or nested objects. Strings must be
  // controlled codes, not free-form text that could carry private content.
  if (["rate_limit", "context", "upstream", "parse", "normalize", "validation"].includes(value.stage)) safe.stage = value.stage;
  if (typeof value.reason === "string" && /^[a-z][a-z0-9_]{0,79}$/.test(value.reason)) safe.reason = value.reason;
  if (value.upstream_status === null || Number.isInteger(value.upstream_status) && value.upstream_status >= 100 && value.upstream_status <= 599) safe.upstream_status = value.upstream_status;
  if (value.model_finish_reason === null || ["stop", "length", "content_filter", "tool_calls", "function_call", "unknown"].includes(value.model_finish_reason)) safe.model_finish_reason = value.model_finish_reason;
  if (Number.isInteger(value.repair_count) && value.repair_count >= 0 && value.repair_count <= 100) safe.repair_count = value.repair_count;
  if (Number.isFinite(value.elapsed_ms) && value.elapsed_ms >= 0 && value.elapsed_ms <= 3600000) safe.elapsed_ms = value.elapsed_ms;
  if (["f1_grounded", "fan_light", "public_fact", "rumor_check", "public_adjacent", "unrelated_general", "private_or_inner_state_unverified", "team_secret_or_live_engineering", "medical_legal_financial", "gambling", "illegal_hate_harm", "identity_or_impersonation", "insufficient_current_fact", "unverified_rumor_source"].includes(value.validation_route)) safe.validation_route = value.validation_route;
  if (["fictional", "evidence", "social", "boundary", "insufficient"].includes(value.validation_answer_kind)) safe.validation_answer_kind = value.validation_answer_kind;
  if (typeof value.validation_actual_facts === "boolean") safe.validation_actual_facts = value.validation_actual_facts;
  if (["none", "historical", "current"].includes(value.validation_temporal_scope)) safe.validation_temporal_scope = value.validation_temporal_scope;
  if (Number.isInteger(value.selected_factual_id_count) && value.selected_factual_id_count >= 0 && value.selected_factual_id_count <= 36) safe.selected_factual_id_count = value.selected_factual_id_count;
  return Object.keys(safe).length ? safe : null;
}

export function checkConversationResponse(testCase, status, body) {
  const contractErrors = checkModeResponse(testCase, status, body);
  const flags = [];
  const en = typeof body?.answer_en === "string" ? body.answer_en : "";
  const zh = typeof body?.answer_zh === "string" ? body.answer_zh : "";
  const words = englishWordCount(en);
  const calls = body?.performance?.model_calls;
  if (status === 200 && (!Number.isInteger(calls) || calls < 1 || calls > 2)) contractErrors.push("model_calls must be an integer between 1 and 2");
  if (Number(body?.validation_trace?.additional_review_requests || 0) > 0) contractErrors.push("unexpected additional model-review requests");
  if (/[\u3400-\u9fff]/.test(en)) contractErrors.push("answer_en contains Chinese");
  const cited = [body?.knowledge_fact_ids, body?.rumor_item_ids, body?.public_source_ids].some((ids) => Array.isArray(ids) && ids.length > 0);
  if (body?.answer_kind === "evidence" && !cited) contractErrors.push("factual answer has no selected factual citation IDs");
  if (testCase.intent === "current_fact" && body?.answer_kind === "evidence" && !body?.public_source_ids?.length) contractErrors.push("current fact has no selected current public source");
  if (testCase.micro) {
    if (words > testCase.max_en_words) flags.push(`micro answer exceeds ${testCase.max_en_words} English words (${words})`);
    // These are review flags, not semantic judgments. The model still authors
    // every answer; none of these patterns supplies replacement reply text.
    if (/\b(?:baku|azerbaijan|madrid|practice|qualifying|grand prix|race weekend|race day|fp[1-3]|calendar|schedule|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\b\d{1,2}:\d{2}\b|巴库|阿塞拜疆|马德里|练习赛|排位赛|赛程|比赛日|正赛|大奖赛|北京时间/i.test(`${en} ${zh}`)) flags.push("unsolicited calendar/race/date detail in pure social turn");
    // Retrieved background and style evidence are not factual citations. Only
    // actual answer citations count here; available context may remain shared.
    if (cited || Array.isArray(body?.sources) && body.sources.length) flags.push("unsolicited factual citations in pure social turn");
  }
  if (testCase.intent === "closing" && (/[?？]/.test(`${en} ${zh}`) || /\b(?:want to|would you like|shall we|anything else|what about you)\b|要不要|还想聊|还有什么想问/i.test(`${en} ${zh}`))) flags.push("closing reopens the conversation with a question/hook");
  if (testCase.intent === "preference" && (!/\b(?:cats?|dogs?)\b|猫|狗/i.test(`${en} ${zh}`) || /^(?:what do you mean|could you clarify|can you clarify|什么意思|请澄清)/i.test(en.trim()))) flags.push("clear preference may not have received a direct choice");
  if (testCase.mode === "free" && testCase.intent === "preference"
      && /\b(?:fictional (?:preference|choice)|role[- ]?play (?:preference|choice)|not (?:an? )?(?:public|official|verified) (?:ranking|preference))\b|角色(?:扮演|演绎)(?:里|中)?的?偏好|(?:不是|并非|不代表)(?:本人)?的?(?:公开|真实)的?(?:排名|偏好)/i.test(`${en} ${zh}`)) flags.push("preference repeats roleplay/public-ranking disclaimers; human naturalness review needed");
  if ((testCase.micro || testCase.intent === "preference") && /not (?:really )?my field|outside my lane|out of (?:my|the) scope|不在我的范围|不属于我的领域|超出我的范围/i.test(`${en} ${zh}`)) flags.push("ordinary conversation still sounds out of scope");
  return { contract_errors: contractErrors, heuristic_flags: flags, en_words: words, model_calls: Number.isInteger(calls) ? calls : null };
}

export function parseConversationArgs(args) {
  const options = { run: false, help: false, suite: "smoke", transport: "curl", baseUrl: DEFAULT_BASE_URL };
  const seen = new Set();
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (seen.has(key)) throw new Error("Duplicate option");
    seen.add(key);
    if (key === "--run") { options.run = true; continue; }
    if (key === "--help" || key === "-h") { options.help = true; continue; }
    const target = { "--suite": "suite", "--transport": "transport", "--base-url": "baseUrl" }[key];
    if (!target || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error("Unknown option or missing option value");
    options[target] = args[++index];
  }
  if (!Object.hasOwn(CONVERSATION_SUITES, options.suite)) throw new Error("Unknown conversation suite");
  if (!["curl", "fetch"].includes(options.transport)) throw new Error("Unknown transport");
  const base = new URL(options.baseUrl);
  if (base.username || base.password || base.search || base.hash || base.pathname !== "/" || !["https:", "http:"].includes(base.protocol)
      || base.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) throw new Error("Invalid base URL: use an HTTPS origin or local HTTP origin, without credentials/path/query");
  options.baseUrl = base.origin;
  if (options.help) options.run = false;
  return options;
}

export function buildConversationPayload(testCase, history = testCase.history || []) {
  return {
    message: testCase.message, mode: testCase.mode, facts_only: testCase.mode === "grounded",
    history: history.slice(-8).map(({ role, content }) => ({ role, content: content.slice(0, 900) })),
    candidate_mode: true, disclosure_shown: true, time_zone: "Asia/Shanghai",
    ...(testCase.surface_context ? { surface_context: { ...testCase.surface_context } } : {}),
  };
}

export function appendGeneratedTurn(history, testCase, body) {
  const content = [body.answer_en, body.answer_zh].filter((value) => typeof value === "string" && value.trim()).join("\n");
  if (!content) return history.slice(-8);
  return [...history, { role: "user", content: testCase.message }, { role: "assistant", content: content.slice(0, 900) }].slice(-8);
}

export function buildCurlArgs(endpoint, payload) {
  return ["-4", "--silent", "--show-error", "--connect-timeout", "15", "--max-time", "60", "--write-out", "\n%{http_code}",
    endpoint, "-H", `Origin: ${ORIGIN}`, "-H", "Content-Type: application/json", "--data-binary", JSON.stringify(payload)];
}

async function requestConversation({ endpoint, payload, transport }) {
  if (transport === "curl") {
    const { stdout } = await promisify(execFile)("curl", buildCurlArgs(endpoint, payload), { maxBuffer: 1024 * 1024 });
    const split = stdout.lastIndexOf("\n");
    return { status: Number(stdout.slice(split + 1)), body: JSON.parse(stdout.slice(0, split)) };
  }
  const response = await fetch(endpoint, { method: "POST", signal: AbortSignal.timeout(65000), headers: { Origin: ORIGIN, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  return { status: response.status, body: await response.json() };
}

export async function runConversationSuite(options, { request = requestConversation, emit = (value) => console.log(JSON.stringify(value)), now = Date.now } = {}) {
  // This guard also protects direct programmatic callers, not only the CLI.
  if (options.run !== true) throw new Error("Live conversation evaluation requires explicit --run");
  const cases = CONVERSATION_SUITES[options.suite];
  if (!cases || cases.length > 6) throw new Error("A conversation suite must contain at most six requests");
  if (options.suite === "multi" && new Set(cases.map((item) => item.mode)).size !== 1) throw new Error("Multi-turn history must stay within one mode, matching the UI");
  const endpoint = new URL("/companion/chat", options.baseUrl || DEFAULT_BASE_URL).href;
  const results = [];
  let history = [], blocked = false;
  for (const testCase of cases) {
    if (blocked) {
      const skipped = { id: testCase.id, skipped: true, reason: "previous multi-turn request failed; no fabricated replacement history" };
      results.push(skipped); emit(skipped); continue;
    }
    const payload = buildConversationPayload(testCase, options.suite === "multi" ? history : testCase.history || []);
    const start = now();
    try {
      const { status, body } = await request({ endpoint, payload, transport: options.transport || "curl" });
      const check = checkConversationResponse(testCase, status, body);
      const result = {
        id: testCase.id, mode: testCase.mode, intent: testCase.intent, message: testCase.message,
        history_messages: payload.history.length, synthetic_ambient_context: payload.surface_context || null,
        status, contract_passed: !check.contract_errors.length, heuristic_clear: !check.heuristic_flags.length,
        engine: body?.engine, model: body?.model, package_version: body?.package_version, source_hash: body?.source_hash,
        answer_kind: body?.answer_kind, route: body?.route, answer_en: body?.answer_en, answer_zh: body?.answer_zh,
        sources: (body?.sources || []).map(({ id, url }) => ({ id, url })),
        ...check, performance: body?.performance || null, validation_trace: body?.validation_trace || null,
        request_id: body?.request_id, error_code: body?.error_code,
        diagnostic: sanitizeConversationDiagnostic(body?.diagnostic), client_ms: now() - start,
      };
      results.push(result); emit(result);
      if (options.suite === "multi") {
        if (status === 200 && typeof body?.answer_en === "string" && body.answer_en.trim()) history = appendGeneratedTurn(history, testCase, body);
        else blocked = true;
      }
    } catch (error) {
      const failed = { id: testCase.id, mode: testCase.mode, message: testCase.message, contract_passed: false, heuristic_clear: false, error: error.name, cause: error.cause?.code || error.code || null, client_ms: now() - start };
      results.push(failed); emit(failed);
      if (options.suite === "multi") blocked = true;
    }
  }
  const attempted = results.filter((item) => !item.skipped);
  const times = attempted.map((item) => item.client_ms).sort((a, b) => a - b);
  const knownCalls = attempted.filter((item) => Number.isInteger(item.model_calls));
  const summary = {
    type: "summary", suite: options.suite, planned: cases.length, attempted: attempted.length,
    contract_passed: attempted.filter((item) => item.contract_passed).length,
    contract_failed: attempted.filter((item) => !item.contract_passed).length,
    heuristic_flagged: attempted.filter((item) => item.heuristic_flags?.length).length,
    skipped: results.length - attempted.length,
    total_model_calls: knownCalls.length === attempted.length ? knownCalls.reduce((sum, item) => sum + item.model_calls, 0) : null,
    client_median_ms: times.length ? (times[Math.floor((times.length - 1) / 2)] + times[Math.floor(times.length / 2)]) / 2 : null,
    client_max_ms: times.length ? times.at(-1) : null,
    note: "Synthetic one-shot regression. Heuristics are review signals, not semantic proof: inspect relevance, source support, naturalness and English/Chinese consistency manually. Baku is a synthetic UI focus, not today's verified event. No feedback was written.",
  };
  emit(summary);
  return { results, summary };
}

async function main() {
  const options = parseConversationArgs(process.argv.slice(2));
  if (!options.run) {
    console.log("Dry run: no requests. Add --run for one synthetic six-request suite (not a continuous monitor). --suite smoke|multi --transport curl|fetch --base-url HTTPS_ORIGIN. curl uses IPv4. No credentials or feedback writes. Wait at least a minute between invocations to respect the shared API rate limit.");
    console.log(JSON.stringify({ suite: options.suite, transport: options.transport, base_url: options.baseUrl, cases: CONVERSATION_SUITES[options.suite].map(({ id, mode, message, intent }) => ({ id, mode, message, intent })) }));
    return;
  }
  const { summary } = await runConversationSuite(options);
  process.exitCode = summary.contract_failed || summary.heuristic_flagged || summary.skipped ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
