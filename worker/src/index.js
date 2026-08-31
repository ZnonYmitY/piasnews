const DEFAULT_ORIGIN = "https://znonymity.github.io";
const MAX_BODY_BYTES = 64 * 1024;
const ANALYTICS_RETENTION_DAYS = 90;
const ROLE_LEVEL = { viewer: 1, editor: 2, publisher: 3, admin: 4 };

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

function appendConfiguredSessions(sessions, configuredJson) {
  if (!configuredJson) return;
  try {
    const configured = JSON.parse(configuredJson);
    for (const [key, value] of Object.entries(configured || {})) {
      if (!key || !value || !ROLE_LEVEL[value.role]) continue;
      sessions.push({
        key,
        user: String(value.user || value.nickname || "workbench-user"),
        email: value.email ? String(value.email) : null,
        role: value.role,
      });
    }
  } catch {
    // A malformed optional role map must not disable the other authentication paths.
  }
}

function configuredSessions(env) {
  const sessions = [];
  appendConfiguredSessions(sessions, env.ADMIN_KEYS_JSON);
  appendConfiguredSessions(sessions, env.ADMIN_ADDITIONAL_KEYS_JSON);
  if (env.ADMIN_API_KEY) {
    sessions.push({ key: env.ADMIN_API_KEY, user: "legacy-admin", email: null, role: "admin" });
  }
  return sessions;
}

async function authenticatedSession(request, env) {
  const supplied = suppliedAdminKey(request);
  for (const session of configuredSessions(env)) {
    if (await safeEqual(supplied, session.key)) return { user: session.user, email: session.email, role: session.role };
  }
  return null;
}

function hasRole(session, minimumRole) {
  return Boolean(session && ROLE_LEVEL[session.role] >= ROLE_LEVEL[minimumRole]);
}

function sessionPayload(session) {
  return {
    authenticated: true,
    user: session.user,
    email: session.email || null,
    role: session.role,
    permissions: {
      view: hasRole(session, "viewer"),
      edit: hasRole(session, "editor"),
      publish: hasRole(session, "publisher"),
      administer: hasRole(session, "admin"),
    },
  };
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

function validateHotEventChange(body) {
  if (!body || typeof body !== "object") return "Request body must be an object.";
  if (!/^evt-[a-z0-9-]{4,120}$/.test(body.event_id || "")) return "Invalid event_id.";
  if (!["draft", "active"].includes(body.status)) return "Invalid override status.";
  if (!body.change || typeof body.change !== "object") return "Missing hot-event change.";
  if (body.expected_updated_at != null && (
    typeof body.expected_updated_at !== "string" || body.expected_updated_at.length > 40
  )) return "Invalid expected_updated_at.";
  const change = body.change;
  if (typeof change.hot_word_zh !== "string" || !change.hot_word_zh.trim() || change.hot_word_zh.length > 80) {
    return "Chinese hot word is required and must be at most 80 characters.";
  }
  if (typeof change.reason !== "string" || !change.reason.trim() || change.reason.length > 500) {
    return "A change reason is required and must be at most 500 characters.";
  }
  if (change.source_labels != null && (
    !Array.isArray(change.source_labels) || change.source_labels.some((label) => !["官", "媒", "粉"].includes(label))
  )) return "Invalid source labels.";
  for (const field of ["image_url", "video_url"]) {
    if (change[field] && (typeof change[field] !== "string" || !change[field].startsWith("https://"))) {
      return `${field} must use HTTPS.`;
    }
  }
  if (change.content_items != null) {
    if (!Array.isArray(change.content_items) || change.content_items.length > 50) {
      return "content_items must contain at most 50 entries.";
    }
    const seenIds = new Set();
    for (const item of change.content_items) {
      if (!item || typeof item !== "object") return "Each content item must be an object.";
      if (!/^[A-Za-z0-9._:-]{3,180}$/.test(item.item_id || "") || seenIds.has(item.item_id)) {
        return "Each content item needs a unique valid item_id.";
      }
      seenIds.add(item.item_id);
      if (!["official", "media", "fan"].includes(item.source_type)) return "Invalid content source_type.";
      if (typeof item.source !== "string" || !item.source.trim() || item.source.length > 120) {
        return "Each content item needs a source.";
      }
      if (![item.title, item.title_zh].some((value) => typeof value === "string" && value.trim())) {
        return "Each content item needs a title.";
      }
      for (const field of ["url", "image_url", "video_url", "video_poster_url"]) {
        if ((field === "url" || item[field]) && (typeof item[field] !== "string" || !item[field].startsWith("https://"))) {
          return `${field} must use HTTPS.`;
        }
      }
    }
  }
  const heat = change.heat;
  if (heat != null && heat !== "" && (!Number.isInteger(Number(heat)) || Number(heat) < 0 || Number(heat) > 100)) {
    return "Heat must be an integer from 0 to 100.";
  }
  const pinnedRank = change.pinned_rank;
  if (pinnedRank != null && pinnedRank !== "" && (
    !Number.isInteger(Number(pinnedRank)) || Number(pinnedRank) < 1 || Number(pinnedRank) > 15
  )) return "Pinned rank must be an integer from 1 to 15.";
  return null;
}

function preferredHotOverride(overrides, eventId) {
  const changes = overrides?.changes || [];
  return changes.find((row) => row.event_id === eventId && row.status === "draft")
    || changes.find((row) => row.event_id === eventId && row.status === "active")
    || null;
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
  return [7, 30, 90].includes(parsed) ? parsed : 7;
}

function isValidDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
}

function queryRangeEnd(url, today, days) {
  const retentionStart = shiftDay(today, -(ANALYTICS_RETENTION_DAYS - 1));
  const earliestFullWindowEnd = shiftDay(retentionStart, days - 1);
  const requested = url.searchParams.get("end");
  if (!isValidDay(requested)) return today;
  if (requested > today) return today;
  if (requested < earliestFullWindowEnd) return earliestFullWindowEnd;
  return requested;
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
  const retentionStart = shiftDay(today, -(ANALYTICS_RETENTION_DAYS - 1));
  const end = queryRangeEnd(url, today, days);
  const start = shiftDay(end, -(days - 1));
  const previousEnd = shiftDay(start, -1);
  const previousStart = shiftDay(previousEnd, -(days - 1));
  const comparisonAvailable = previousStart >= retentionStart;

  const [todayRow, periodRow, previousRow, dailyRows, pathRows, referrerRows, directRow] = await Promise.all([
    env.ANALYTICS_DB.prepare("SELECT COUNT(*) AS total FROM page_views WHERE day = ?").bind(today).first(),
    env.ANALYTICS_DB.prepare("SELECT COUNT(*) AS total FROM page_views WHERE day BETWEEN ? AND ?")
      .bind(start, end).first(),
    comparisonAvailable
      ? env.ANALYTICS_DB.prepare("SELECT COUNT(*) AS total FROM page_views WHERE day BETWEEN ? AND ?")
        .bind(previousStart, previousEnd).first()
      : Promise.resolve({ total: 0 }),
    env.ANALYTICS_DB.prepare(
      "SELECT day, COUNT(*) AS views FROM page_views WHERE day BETWEEN ? AND ? GROUP BY day ORDER BY day",
    ).bind(start, end).all(),
    env.ANALYTICS_DB.prepare(
      "SELECT path, COUNT(*) AS views FROM page_views WHERE day BETWEEN ? AND ? GROUP BY path ORDER BY views DESC, path LIMIT 8",
    ).bind(start, end).all(),
    env.ANALYTICS_DB.prepare(
      "SELECT referrer_host, COUNT(*) AS views FROM page_views WHERE day BETWEEN ? AND ? AND referrer_host IS NOT NULL GROUP BY referrer_host ORDER BY views DESC, referrer_host LIMIT 8",
    ).bind(start, end).all(),
    env.ANALYTICS_DB.prepare(
      "SELECT COUNT(*) AS total FROM page_views WHERE day BETWEEN ? AND ? AND referrer_host IS NULL",
    ).bind(start, end).first(),
  ]);

  const todayViews = Number(todayRow?.total || 0);
  const periodViews = Number(periodRow?.total || 0);
  const previousViews = Number(previousRow?.total || 0);
  const directViews = Number(directRow?.total || 0);
  const dailyMap = new Map((dailyRows.results || []).map((row) => [row.day, Number(row.views)]));
  const daily = Array.from({ length: days }, (_, index) => {
    const day = shiftDay(start, index);
    return { day, views: dailyMap.get(day) || 0 };
  });
  const peak = daily.reduce(
    (current, entry) => entry.views > current.views ? entry : current,
    { day: start, views: 0 },
  );

  return {
    generated_at: new Date().toISOString(),
    timezone: "Asia/Shanghai",
    days,
    range: { start, end },
    retention: { start: retentionStart, end: today, days: ANALYTICS_RETENTION_DAYS },
    comparison: comparisonAvailable
      ? { available: true, start: previousStart, end: previousEnd }
      : { available: false, reason: "outside_retention" },
    metrics: {
      today: todayViews,
      period: periodViews,
      previous_period: previousViews,
      change_percent: comparisonAvailable && previousViews
        ? Math.round(((periodViews - previousViews) / previousViews) * 1000) / 10
        : null,
      average_per_day: Math.round((periodViews / days) * 10) / 10,
      active_days: daily.filter((entry) => entry.views > 0).length,
      peak_day: peak.day,
      peak_views: peak.views,
      direct_views: directViews,
      direct_percent: periodViews ? Math.round((directViews / periodViews) * 1000) / 10 : 0,
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

function repositoryDetails(env) {
  return {
    owner: env.GITHUB_OWNER || "ZnonYmitY",
    repository: env.GITHUB_REPOSITORY || "piasnews",
    gitRef: env.GITHUB_REF || "main",
  };
}

async function repositoryJson(path, env) {
  const { owner, repository, gitRef } = repositoryDetails(env);
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repository}/contents/${path}?ref=${encodeURIComponent(gitRef)}`,
    {
      headers: {
        Accept: "application/vnd.github.raw+json",
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "User-Agent": "piasnews-review-worker/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!response.ok) throw new Error(`Unable to read ${path} (${response.status}).`);
  return response.json();
}

async function dispatchHotEventChange(body, session, env) {
  const { owner, repository, gitRef } = repositoryDetails(env);
  const workflow = env.HOT_EVENTS_WORKFLOW || "review-hot-events.yml";
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
        event_id: body.event_id,
        override_status: body.status,
        override_payload_b64: base64Url(body.change),
        reviewer: session.user,
        expected_updated_at: body.expected_updated_at || "__none__",
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

    if (request.method === "GET" && url.pathname === "/session") {
      const session = await authenticatedSession(request, env);
      if (!session) return jsonResponse({ error: "Unauthorized." }, 401, origin);
      return jsonResponse(sessionPayload(session), 200, origin);
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
      const session = await authenticatedSession(request, env);
      if (!hasRole(session, "viewer")) return jsonResponse({ error: "Unauthorized." }, 401, origin);
      if (!env.ANALYTICS_DB) return jsonResponse({ error: "Worker is missing ANALYTICS_DB." }, 503, origin);
      try {
        return jsonResponse(await analyticsSummary(url, env), 200, origin);
      } catch {
        return jsonResponse({ error: "Unable to read analytics." }, 503, origin);
      }
    }

    if (request.method === "GET" && url.pathname === "/hot-events/config") {
      const session = await authenticatedSession(request, env);
      if (!hasRole(session, "viewer")) return jsonResponse({ error: "Unauthorized." }, 401, origin);
      if (!env.GITHUB_TOKEN) return jsonResponse({ error: "Worker is missing GITHUB_TOKEN." }, 503, origin);
      try {
        return jsonResponse({
          session: sessionPayload(session),
          overrides: await repositoryJson("data/hot-event-overrides.json", env),
        }, 200, origin);
      } catch (error) {
        return jsonResponse({ error: error.message || "Unable to read hot-event configuration." }, 502, origin);
      }
    }

    if (request.method === "POST" && url.pathname === "/hot-events/change") {
      const session = await authenticatedSession(request, env);
      if (!hasRole(session, "editor")) return jsonResponse({ error: "Editor role required." }, 403, origin);
      if (!env.GITHUB_TOKEN) return jsonResponse({ error: "Worker is missing GITHUB_TOKEN." }, 503, origin);
      const parsed = await readJson(request, origin);
      if (parsed.response) return parsed.response;
      const validationError = validateHotEventChange(parsed.body);
      if (validationError) return jsonResponse({ error: validationError }, 400, origin);
      if (parsed.body.status === "active" && !hasRole(session, "publisher")) {
        return jsonResponse({ error: "Publisher role required to activate an override." }, 403, origin);
      }
      try {
        const overrides = await repositoryJson("data/hot-event-overrides.json", env);
        const current = preferredHotOverride(overrides, parsed.body.event_id);
        if ((current?.updated_at || null) !== (parsed.body.expected_updated_at || null)) {
          return jsonResponse({ error: "Hot event was changed by another administrator. Refresh and try again." }, 409, origin);
        }
        await dispatchHotEventChange(parsed.body, session, env);
        return jsonResponse({ accepted: true, event_id: parsed.body.event_id, status: parsed.body.status }, 202, origin);
      } catch (error) {
        return jsonResponse({ error: error.message || "Workflow dispatch failed." }, 502, origin);
      }
    }

    if (request.method !== "POST" || url.pathname !== "/review") {
      return jsonResponse({ error: "Not found." }, 404, origin);
    }

    const reviewSession = await authenticatedSession(request, env);
    if (!reviewSession) return jsonResponse({ error: "Unauthorized." }, 401, origin);
    if (!hasRole(reviewSession, "publisher")) return jsonResponse({ error: "Publisher role required." }, 403, origin);
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
