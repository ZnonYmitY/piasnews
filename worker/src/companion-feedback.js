// Feedback is an explicitly consented, client-reported snapshot. It is never
// authoritative model telemetry and is not consumed by the persona runtime.
export const FEEDBACK_RETENTION_DAYS = 90;
const MAX_FEEDBACK_BYTES = 48 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORIES = new Set([
  "off_persona", "unnatural", "fact_error", "irrelevant", "over_refusal",
  "boundary_miss", "invented_private", "rumor_handling", "translation",
  "too_long", "context_loss", "technical", "other",
]);
const STATUSES = new Set(["new", "triaged", "resolved", "dismissed"]);
const ENGINES = new Set(["deepseek", "boundary", "ledger", "fallback", "welcome"]);

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value, limit, field) {
  if (value == null) return "";
  if (typeof value !== "string" || value.length > limit) throw new Error(`Invalid ${field}; maximum ${limit} characters.`);
  return value.trim();
}

function idList(value, limit, field) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > limit
      || value.some((id) => typeof id !== "string" || !/^[A-Za-z0-9._:-]{1,80}$/.test(id))
      || new Set(value).size !== value.length) throw new Error(`Invalid ${field}.`);
  return [...value];
}

function uuid(value, field) {
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`Invalid ${field}.`);
  return value.toLowerCase();
}

export function validateFeedback(body) {
  if (!object(body)) throw new Error("Request body must be an object.");
  if (body.consent !== true) throw new Error("Explicit feedback consent is required.");
  if (typeof body.include_context !== "boolean") throw new Error("include_context must be a boolean.");
  if (!["positive", "negative"].includes(body.rating)) throw new Error("Invalid rating.");
  if (!Array.isArray(body.categories) || body.categories.length > 4
      || body.categories.some((category) => !CATEGORIES.has(category))
      || new Set(body.categories).size !== body.categories.length) throw new Error("Choose at most four known categories.");
  if (body.rating === "negative" && body.categories.length === 0) throw new Error("Negative feedback needs at least one category.");
  if (!object(body.snapshot)) throw new Error("Missing feedback snapshot.");
  const snapshot = body.snapshot;
  if (!ENGINES.has(snapshot.engine)) throw new Error("Invalid snapshot engine.");
  if (snapshot.facts_only != null && typeof snapshot.facts_only !== "boolean") throw new Error("Invalid facts_only.");
  const history = snapshot.history ?? [];
  if (!Array.isArray(history) || history.length > 4 || (!body.include_context && history.length)) {
    throw new Error("History requires include_context and contains at most four items.");
  }
  const normalizedHistory = history.map((item) => {
    if (!object(item) || !["user", "assistant"].includes(item.role)) throw new Error("Invalid history role.");
    const content = text(item.content, 900, "history content");
    if (!content) throw new Error("Empty history content.");
    return { role: item.role, content };
  });
  const answerEn = text(snapshot.answer_en, 900, "answer_en");
  const answerZh = text(snapshot.answer_zh, 900, "answer_zh");
  if (!answerEn && !answerZh) throw new Error("A feedback answer is required.");
  const latency = snapshot.latency_ms ?? null;
  if (latency !== null && (!Number.isFinite(latency) || latency < 0 || latency > 3600000)) throw new Error("Invalid latency_ms.");
  return {
    feedback_id: uuid(body.feedback_id, "feedback_id"),
    message_id: uuid(body.message_id, "message_id"),
    rating: body.rating,
    categories: [...body.categories].sort(),
    comment: text(body.comment, 1000, "comment"),
    expected_reply: text(body.expected_reply, 1000, "expected_reply"),
    consent: true,
    include_context: body.include_context,
    snapshot: {
      prompt: text(snapshot.prompt, 500, "prompt"),
      answer_en: answerEn,
      answer_zh: answerZh,
      history: normalizedHistory,
      engine: snapshot.engine,
      model: text(snapshot.model, 80, "model"),
      route: text(snapshot.route, 80, "route"),
      style_card_id: text(snapshot.style_card_id, 40, "style_card_id"),
      package_version: text(snapshot.package_version, 40, "package_version"),
      source_hash: text(snapshot.source_hash, 80, "source_hash"),
      facts_only: snapshot.facts_only === true,
      app_version: text(snapshot.app_version, 60, "app_version"),
      knowledge_fact_ids: idList(snapshot.knowledge_fact_ids, 4, "knowledge_fact_ids"),
      rumor_item_ids: idList(snapshot.rumor_item_ids, 1, "rumor_item_ids"),
      judgment_rule_ids: idList(snapshot.judgment_rule_ids, 1, "judgment_rule_ids"),
      evidence_ids: idList(snapshot.evidence_ids, 8, "evidence_ids"),
      latency_ms: latency,
    },
  };
}

async function readFeedbackJson(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("Content-Type") || "")) {
    return { error: "Content-Type must be application/json.", status: 415 };
  }
  if (Number(request.headers.get("Content-Length") || 0) > MAX_FEEDBACK_BYTES) {
    return { error: "Request is too large.", status: 413 };
  }
  // Enforce the actual stream length as well: Content-Length is optional and untrusted.
  const reader = request.body?.getReader();
  if (!reader) return { error: "Invalid JSON.", status: 400 };
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_FEEDBACK_BYTES) {
        await reader.cancel();
        return { error: "Request is too large.", status: 413 };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return { body: JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) };
  } catch {
    return { error: "Invalid JSON.", status: 400 };
  } finally {
    reader.releaseLock();
  }
}

function cutoff() {
  return new Date(Date.now() - FEEDBACK_RETENTION_DAYS * 86400000).toISOString();
}

export async function cleanupCompanionFeedback(env) {
  if (!env.ANALYTICS_DB) return;
  await env.ANALYTICS_DB.prepare("DELETE FROM companion_feedback WHERE created_at < ?").bind(cutoff()).run();
}

async function feedbackRateLimit(request, env) {
  const client = request.headers.get("CF-Connecting-IP") || "browser-client";
  const clientLimiter = env.COMPANION_FEEDBACK_RATE_LIMITER || env.COMPANION_RATE_LIMITER;
  const sharedLimiter = env.COMPANION_FEEDBACK_GLOBAL_LIMITER || env.COMPANION_GLOBAL_LIMITER;
  if (clientLimiter && !(await clientLimiter.limit({ key: `feedback:${client}` })).success) return false;
  if (sharedLimiter && !(await sharedLimiter.limit({ key: "companion-feedback-global" })).success) return false;
  return true;
}

async function payloadHash(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function recordFeedback(payload, env) {
  const encoded = JSON.stringify(payload);
  const hash = await payloadHash(encoded);
  const result = await env.ANALYTICS_DB.prepare(`INSERT INTO companion_feedback
    (feedback_id, message_id, created_at, payload_hash, payload_json, rating, categories_json, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'new') ON CONFLICT(feedback_id) DO NOTHING`)
    .bind(payload.feedback_id, payload.message_id, new Date().toISOString(), hash, encoded, payload.rating, JSON.stringify(payload.categories)).run();
  const stored = await env.ANALYTICS_DB.prepare("SELECT payload_hash FROM companion_feedback WHERE feedback_id = ?")
    .bind(payload.feedback_id).first();
  if (!stored) throw new Error("Feedback storage unavailable.");
  if (stored.payload_hash !== hash) return { error: "feedback_id already belongs to a different submission.", status: 409 };
  const deduplicated = Number(result.meta?.changes ?? 0) === 0;
  return { body: { accepted: true, feedback_id: payload.feedback_id, deduplicated, retention_days: FEEDBACK_RETENTION_DAYS }, status: deduplicated ? 200 : 202 };
}

function encodeCursor(row) {
  return btoa(JSON.stringify({ created_at: row.created_at, feedback_id: row.feedback_id }))
    .replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeCursor(value) {
  if (!value || value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid cursor.");
  try {
    const cursor = JSON.parse(atob(value.replaceAll("-", "+").replaceAll("_", "/")));
    if (!object(cursor) || !UUID.test(cursor.feedback_id || "")
        || typeof cursor.created_at !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(cursor.created_at)
        || !Number.isFinite(Date.parse(cursor.created_at))) throw new Error();
    return cursor;
  } catch { throw new Error("Invalid cursor."); }
}

function listOptions(url, isExport) {
  const filters = [];
  const values = [];
  if (url.searchParams.has("feedback_id")) {
    filters.push("feedback_id = ?");
    values.push(uuid(url.searchParams.get("feedback_id"), "feedback_id"));
  }
  for (const [field, allowed] of [["rating", new Set(["positive", "negative"])], ["status", STATUSES], ["category", CATEGORIES]]) {
    const value = url.searchParams.get(field);
    if (value === null || value === "") continue;
    if (!allowed.has(value)) throw new Error(`Invalid ${field} filter.`);
    filters.push(field === "category" ? "EXISTS (SELECT 1 FROM json_each(categories_json) WHERE value = ?)" : `${field} = ?`);
    values.push(value);
  }
  const limitText = url.searchParams.get("limit") || (isExport ? "500" : "25");
  const limit = Number(limitText);
  if (!/^\d+$/.test(limitText) || !Number.isInteger(limit) || limit < 1 || limit > (isExport ? 500 : 50)) throw new Error("Invalid limit.");
  const cursor = url.searchParams.has("cursor") ? decodeCursor(url.searchParams.get("cursor")) : null;
  return { filters, values, limit, cursor };
}

function feedbackItem(row) {
  return {
    ...JSON.parse(row.payload_json),
    created_at: row.created_at,
    status: row.status,
    review_note: row.review_note || "",
    reviewed_at: row.reviewed_at || null,
    reviewed_by: row.reviewed_by || null,
    client_reported: true,
  };
}

async function listFeedback(options, env) {
  const conditions = ["created_at >= ?", ...options.filters];
  const values = [cutoff(), ...options.values];
  const total = await env.ANALYTICS_DB.prepare(`SELECT COUNT(*) AS total FROM companion_feedback WHERE ${conditions.join(" AND ")}`)
    .bind(...values).first();
  if (options.cursor) {
    conditions.push("(created_at < ? OR (created_at = ? AND feedback_id < ?))");
    values.push(options.cursor.created_at, options.cursor.created_at, options.cursor.feedback_id);
  }
  const result = await env.ANALYTICS_DB.prepare(`SELECT feedback_id, payload_json, created_at, status, review_note, reviewed_at, reviewed_by
    FROM companion_feedback WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC, feedback_id DESC LIMIT ?`)
    .bind(...values, options.limit + 1).all();
  const rows = result.results || [];
  const page = rows.slice(0, options.limit);
  return {
    items: page.map(feedbackItem),
    next_cursor: rows.length > options.limit ? encodeCursor(page[page.length - 1]) : null,
    total: Number(total?.total || 0),
    retention_days: FEEDBACK_RETENTION_DAYS,
    client_reported: true,
  };
}

export async function handleCompanionFeedback(request, env, { origin, jsonResponse, authenticatedSession, hasRole }) {
  const url = new URL(request.url);
  const submit = request.method === "POST" && url.pathname === "/companion/feedback";
  const review = request.method === "POST" && url.pathname === "/companion/feedback/review";
  const list = request.method === "GET" && url.pathname === "/companion/feedback";
  const isExport = request.method === "GET" && url.pathname === "/companion/feedback/export";
  if (!submit && !review && !list && !isExport) return jsonResponse({ error: "Not found." }, 404, origin);
  let session = null;
  if (submit) {
    if (!request.headers.get("Origin")) return jsonResponse({ error: "Origin is required." }, 403, origin);
  } else {
    session = await authenticatedSession(request, env);
    if (!session) return jsonResponse({ error: "Unauthorized." }, 401, origin);
    if (!hasRole(session, "admin")) return jsonResponse({ error: "Admin role required." }, 403, origin);
  }
  if (!env.ANALYTICS_DB) return jsonResponse({ error: "Feedback storage is unavailable." }, 503, origin);
  let payload;
  let options;
  if (submit || review) {
    const parsed = await readFeedbackJson(request);
    if (parsed.error) return jsonResponse({ error: parsed.error }, parsed.status, origin);
    try {
      if (submit) payload = validateFeedback(parsed.body);
      else {
        if (!object(parsed.body) || !STATUSES.has(parsed.body.status)) throw new Error("Invalid review status.");
        payload = { feedback_id: uuid(parsed.body.feedback_id, "feedback_id"), status: parsed.body.status, review_note: text(parsed.body.review_note, 1000, "review_note") };
      }
    } catch (error) { return jsonResponse({ error: error.message }, 400, origin); }
  } else {
    try { options = listOptions(url, isExport); }
    catch (error) { return jsonResponse({ error: error.message }, 400, origin); }
  }
  try {
    if (submit && !await feedbackRateLimit(request, env)) return jsonResponse({ error: "Too many feedback requests. Try again shortly." }, 429, origin);
    await cleanupCompanionFeedback(env);
    if (submit) {
      const result = await recordFeedback(payload, env);
      return jsonResponse(result.body || { error: result.error }, result.status, origin);
    }
    if (review) {
      const result = await env.ANALYTICS_DB.prepare(`UPDATE companion_feedback SET status = ?, review_note = ?, reviewed_at = ?, reviewed_by = ? WHERE feedback_id = ? AND created_at >= ?`)
        .bind(payload.status, payload.review_note, new Date().toISOString(), String(session.user).slice(0, 160), payload.feedback_id, cutoff()).run();
      if (!Number(result.meta?.changes)) return jsonResponse({ error: "Feedback not found." }, 404, origin);
      return jsonResponse({ accepted: true, feedback_id: payload.feedback_id, status: payload.status }, 200, origin);
    }
    return jsonResponse(await listFeedback(options, env), 200, origin);
  } catch {
    // Never log a submitted answer, comment, history, credential or D1 error text.
    return jsonResponse({ error: "Unable to access feedback storage." }, 503, origin);
  }
}
