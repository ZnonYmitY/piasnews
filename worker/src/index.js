const DEFAULT_ORIGIN = "https://znonymity.github.io";
const MAX_BODY_BYTES = 64 * 1024;
const ANALYTICS_RETENTION_DAYS = 90;

function allowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return DEFAULT_ORIGIN;
  const configured = (env.ADMIN_ALLOWED_ORIGINS || DEFAULT_ORIGIN)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return configured.includes(origin) ? origin : null;
}

function responseHeaders(origin) {
  return {
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Origin": origin || DEFAULT_ORIGIN,
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  };
}

function jsonResponse(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(origin),
  });
}

async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function safeEqual(left, right) {
  if (!left || !right) return false;
  const [leftHash, rightHash] = await Promise.all([digest(left), digest(right)]);
  let difference = 0;
  for (let index = 0; index < leftHash.length; index += 1) {
    difference |= leftHash[index] ^ rightHash[index];
  }
  return difference === 0;
}

function suppliedAdminKey(request) {
  const authorization = request.headers.get("Authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

function base64Url(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function validateReview(body) {
  if (!body || typeof body !== "object") return "Request body must be an object.";
  if (!/^[a-z0-9-]{8,160}$/.test(body.candidate_id || "")) return "Invalid candidate_id.";
  if (!["approve", "reject"].includes(body.decision)) return "Invalid decision.";
  if (!body.review || typeof body.review !== "object") return "Missing review payload.";

  if (body.decision === "approve") {
    const requiredChineseFields = ["title_zh", "summary_zh", "inclusion_reason_zh"];
    if (requiredChineseFields.some((field) => typeof body.review[field] !== "string" || !body.review[field].trim())) {
      return "Approval requires Chinese title, summary, and inclusion reason.";
    }
  }
  return null;
}

function validateAnalyticsView(body) {
  if (!body || typeof body !== "object") return "Request body must be an object.";
  if (typeof body.path !== "string" || !/^\/[a-zA-Z0-9/_.-]{0,200}$/.test(body.path)) return "Invalid path.";
  if (body.referrer_host == null || body.referrer_host === "") return null;
  if (typeof body.referrer_host !== "string" || body.referrer_host.length > 253) return "Invalid referrer_host.";
  if (!/^(?=.{1,253}$)[a-zA-Z0-9.-]+$/.test(body.referrer_host)) return "Invalid referrer_host.";
  return null;
}

function dayKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function shiftDay(value, amount) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

function queryDays(url) {
  const parsed = Number.parseInt(url.searchParams.get("days") || "7", 10);
  return [7, 30].includes(parsed) ? parsed : 7;
}

async function recordAnalyticsView(body, env, context) {
  const now = new Date();
  const day = dayKey(now);
  const referrer = body.referrer_host ? body.referrer_host.toLowerCase() : null;
  await env.ANALYTICS_DB.prepare(
    "INSERT INTO page_views (viewed_at, day, path, referrer_host) VALUES (?, ?, ?, ?)",
  ).bind(now.toISOString(), day, body.path, referrer).run();

  const cleanup = env.ANALYTICS_DB.prepare("DELETE FROM page_views WHERE day < ?")
    .bind(shiftDay(day, -(ANALYTICS_RETENTION_DAYS - 1)))
    .run();
  if (context?.waitUntil) context.waitUntil(cleanup);
  else await cleanup;
}

async function analyticsSummary(url, env) {
  const days = queryDays(url);
  const today = dayKey();
  const start = shiftDay(today, -(days - 1));
  const previousEnd = shiftDay(start, -1);
  const previousStart = shiftDay(previousEnd, -(days - 1));

  const [todayRow, periodRow, previousRow, dailyRows, pathRows, referrerRows] = await Promise.all([
    env.ANALYTICS_DB.prepare("SELECT COUNT(*) AS total FROM page_views WHERE day = ?").bind(today).first(),
    env.ANALYTICS_DB.prepare("SELECT COUNT(*) AS total FROM page_views WHERE day BETWEEN ? AND ?")
      .bind(start, today).first(),
    env.ANALYTICS_DB.prepare("SELECT COUNT(*) AS total FROM page_views WHERE day BETWEEN ? AND ?")
      .bind(previousStart, previousEnd).first(),
    env.ANALYTICS_DB.prepare(
      "SELECT day, COUNT(*) AS views FROM page_views WHERE day BETWEEN ? AND ? GROUP BY day ORDER BY day",
    ).bind(start, today).all(),
    env.ANALYTICS_DB.prepare(
      "SELECT path, COUNT(*) AS views FROM page_views WHERE day BETWEEN ? AND ? GROUP BY path ORDER BY views DESC, path LIMIT 8",
    ).bind(start, today).all(),
    env.ANALYTICS_DB.prepare(
      "SELECT referrer_host, COUNT(*) AS views FROM page_views WHERE day BETWEEN ? AND ? AND referrer_host IS NOT NULL GROUP BY referrer_host ORDER BY views DESC, referrer_host LIMIT 8",
    ).bind(start, today).all(),
  ]);

  const todayViews = Number(todayRow?.total || 0);
  const periodViews = Number(periodRow?.total || 0);
  const previousViews = Number(previousRow?.total || 0);
  const dailyMap = new Map((dailyRows.results || []).map((row) => [row.day, Number(row.views)]));
  const daily = Array.from({ length: days }, (_, index) => {
    const day = shiftDay(start, index);
    return { day, views: dailyMap.get(day) || 0 };
  });

  return {
    generated_at: new Date().toISOString(),
    timezone: "Asia/Shanghai",
    days,
    range: { start, end: today },
    metrics: {
      today: todayViews,
      period: periodViews,
      previous_period: previousViews,
      change_percent: previousViews ? Math.round(((periodViews - previousViews) / previousViews) * 1000) / 10 : null,
      average_per_day: Math.round((periodViews / days) * 10) / 10,
    },
    daily,
    top_paths: (pathRows.results || []).map((row) => ({ path: row.path, views: Number(row.views) })),
    top_referrers: (referrerRows.results || []).map((row) => ({
      referrer_host: row.referrer_host,
      views: Number(row.views),
    })),
  };
}

async function dispatchReview(body, env) {
  const owner = env.GITHUB_OWNER || "ZnonYmitY";
  const repository = env.GITHUB_REPOSITORY || "piasnews";
  const workflow = env.GITHUB_WORKFLOW || "review-history.yml";
  const gitRef = env.GITHUB_REF || "main";
  const endpoint = `https://api.github.com/repos/${owner}/${repository}/actions/workflows/${workflow}/dispatches`;

  const githubResponse = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "piasnews-review-worker/1.0",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      ref: gitRef,
      inputs: {
        candidate_id: body.candidate_id,
        decision: body.decision,
        review_payload_b64: base64Url(body.review),
      },
    }),
  });

  if (!githubResponse.ok) {
    const detail = (await githubResponse.text()).slice(0, 500);
    throw new Error(`GitHub workflow dispatch failed (${githubResponse.status}): ${detail}`);
  }
}

async function readJson(request, origin) {
  const contentLength = Number(request.headers.get("Content-Length") || "0");
  if (contentLength > MAX_BODY_BYTES) return { response: jsonResponse({ error: "Request is too large." }, 413, origin) };
  try {
    return { body: await request.json() };
  } catch {
    return { response: jsonResponse({ error: "Invalid JSON." }, 400, origin) };
  }
}

export default {
  async fetch(request, env, context) {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env);
    if (!origin) return jsonResponse({ error: "Origin is not allowed." }, 403, DEFAULT_ORIGIN);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: responseHeaders(origin) });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({ ok: true, service: "piasnews-worker" }, 200, origin);
    }

    if (request.method === "POST" && url.pathname === "/analytics/view") {
      if (!request.headers.get("Origin")) return jsonResponse({ error: "Origin is required." }, 403, origin);
      if (!env.ANALYTICS_DB) return jsonResponse({ error: "Worker is missing ANALYTICS_DB." }, 503, origin);
      const parsed = await readJson(request, origin);
      if (parsed.response) return parsed.response;
      const validationError = validateAnalyticsView(parsed.body);
      if (validationError) return jsonResponse({ error: validationError }, 400, origin);
      try {
        await recordAnalyticsView(parsed.body, env, context);
        return jsonResponse({ accepted: true }, 202, origin);
      } catch {
        return jsonResponse({ error: "Unable to record page view." }, 503, origin);
      }
    }

    if (request.method === "GET" && url.pathname === "/analytics/summary") {
      if (!(await safeEqual(suppliedAdminKey(request), env.ADMIN_API_KEY))) {
        return jsonResponse({ error: "Unauthorized." }, 401, origin);
      }
      if (!env.ANALYTICS_DB) return jsonResponse({ error: "Worker is missing ANALYTICS_DB." }, 503, origin);
      try {
        return jsonResponse(await analyticsSummary(url, env), 200, origin);
      } catch {
        return jsonResponse({ error: "Unable to read analytics." }, 503, origin);
      }
    }

    if (request.method !== "POST" || url.pathname !== "/review") {
      return jsonResponse({ error: "Not found." }, 404, origin);
    }

    if (!(await safeEqual(suppliedAdminKey(request), env.ADMIN_API_KEY))) {
      return jsonResponse({ error: "Unauthorized." }, 401, origin);
    }
    if (!env.GITHUB_TOKEN) return jsonResponse({ error: "Worker is missing GITHUB_TOKEN." }, 503, origin);

    const parsed = await readJson(request, origin);
    if (parsed.response) return parsed.response;
    const validationError = validateReview(parsed.body);
    if (validationError) return jsonResponse({ error: validationError }, 400, origin);

    try {
      await dispatchReview(parsed.body, env);
      return jsonResponse(
        {
          accepted: true,
          candidate_id: parsed.body.candidate_id,
          decision: parsed.body.decision,
          message: "Review workflow queued.",
        },
        202,
        origin,
      );
    } catch (error) {
      return jsonResponse({ error: error.message || "Workflow dispatch failed." }, 502, origin);
    }
  },
};
