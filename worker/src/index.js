const DEFAULT_ORIGIN = "https://znonymity.github.io";
const MAX_BODY_BYTES = 64 * 1024;

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = allowedOrigin(request, env);
    if (!origin) return jsonResponse({ error: "Origin is not allowed." }, 403, DEFAULT_ORIGIN);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: responseHeaders(origin) });
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({ ok: true, service: "piasnews-review-worker" }, 200, origin);
    }

    if (request.method !== "POST" || url.pathname !== "/review") {
      return jsonResponse({ error: "Not found." }, 404, origin);
    }

    const contentLength = Number(request.headers.get("Content-Length") || "0");
    if (contentLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: "Request is too large." }, 413, origin);
    }

    const authorization = request.headers.get("Authorization") || "";
    const suppliedKey = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!(await safeEqual(suppliedKey, env.ADMIN_API_KEY))) {
      return jsonResponse({ error: "Unauthorized." }, 401, origin);
    }

    if (!env.GITHUB_TOKEN) {
      return jsonResponse({ error: "Worker is missing GITHUB_TOKEN." }, 503, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON." }, 400, origin);
    }

    const validationError = validateReview(body);
    if (validationError) return jsonResponse({ error: validationError }, 400, origin);

    try {
      await dispatchReview(body, env);
      return jsonResponse(
        {
          accepted: true,
          candidate_id: body.candidate_id,
          decision: body.decision,
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
