const X_API_BASES = ["https://api.x.com/2", "https://api.twitter.com/2"];
const DEFAULT_REPOSITORY = "ZnonYmitY/piasnews";
const DEFAULT_WORKFLOW = "update-piasnews.yml";
const DEFAULT_REF = "main";
const DEFAULT_SOURCES_URL =
  "https://raw.githubusercontent.com/ZnonYmitY/piasnews/main/piasnews/references/x-sources.json";

type Source = {
  platform?: string;
  handle?: string;
  enabled?: boolean;
  group?: string;
};

type Status = {
  platform: string;
  handle: string;
  ok: boolean;
  items?: number;
  error?: string;
};

function env(name: string, fallback = ""): string {
  return Deno.env.get(name) || fallback;
}

function jsonResponse(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload, null, 2) + "\n", {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function cleanText(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function requestToken(request: Request): string {
  const auth = request.headers.get("authorization") || "";
  return request.headers.get("x-piasnews-token") || auth.replace(/^Bearer\s+/i, "");
}

function authorizedByOptionalToken(request: Request, tokenName: string): boolean {
  const expected = env(tokenName);
  return !expected || requestToken(request) === expected;
}

async function fetchJson(url: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch(url, {
    ...init,
    headers: {
      accept: "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${body.slice(0, 300)}`);
  }
  return body ? JSON.parse(body) : null;
}

async function xGet(path: string, bearerToken: string, params?: Record<string, string>): Promise<any> {
  const query = params ? `?${new URLSearchParams(params)}` : "";
  let lastError: Error | undefined;
  for (const base of X_API_BASES) {
    try {
      return await fetchJson(`${base}${path}${query}`, {
        headers: {
          authorization: `Bearer ${bearerToken}`,
          "user-agent": "piasnews-social-supabase/0.1",
        },
      });
    } catch (error) {
      lastError = error as Error;
    }
  }
  throw lastError || new Error("X API request failed");
}

function tweetKind(tweet: any): string {
  const refs = Array.isArray(tweet?.referenced_tweets) ? tweet.referenced_tweets : [];
  return refs.some((ref: any) => ref?.type === "retweeted") ? "repost" : "post";
}

function compactTweet(source: Source, tweet: any): Record<string, unknown> | null {
  const handle = cleanText(source.handle);
  const id = cleanText(tweet?.id);
  const text = cleanText(tweet?.text);
  const createdAt = cleanText(tweet?.created_at);
  if (!handle || !id || !text || !createdAt) return null;
  return {
    platform: "x",
    handle,
    id,
    url: `https://x.com/${handle}/status/${id}`,
    text,
    created_at: createdAt,
    kind: tweetKind(tweet),
    metrics: tweet?.public_metrics || {},
    language: tweet?.lang || "unknown",
  };
}

async function loadSources(): Promise<Source[]> {
  const sourcesUrl = env("PIASNEWS_SOCIAL_SOURCES_URL", DEFAULT_SOURCES_URL);
  const payload = await fetchJson(sourcesUrl);
  const groups = new Set(
    env("PIASNEWS_SOCIAL_GROUPS")
      .split(/\s+/)
      .map((group) => group.trim())
      .filter(Boolean),
  );
  return (Array.isArray(payload?.sources) ? payload.sources : []).filter((source: Source) => {
    if (source.platform !== "x" || source.enabled === false || !source.handle) return false;
    if (groups.size > 0 && !groups.has(String(source.group || ""))) return false;
    return true;
  });
}

async function collectSource(
  source: Source,
  bearerToken: string,
  perSource: number,
): Promise<{ items: Record<string, unknown>[]; status: Status }> {
  const handle = cleanText(source.handle);
  const status: Status = { platform: "x", handle, ok: false, items: 0 };
  try {
    const userPayload = await xGet(`/users/by/username/${encodeURIComponent(handle)}`, bearerToken, {
      "user.fields": "username,name,verified",
    });
    const userId = cleanText(userPayload?.data?.id);
    if (!userId) {
      status.error = "user_not_found";
      return { items: [], status };
    }
    const timeline = await xGet(`/users/${userId}/tweets`, bearerToken, {
      max_results: String(Math.max(5, Math.min(100, perSource))),
      "tweet.fields": "created_at,public_metrics,referenced_tweets,lang",
      exclude: "replies",
    });
    const items = (Array.isArray(timeline?.data) ? timeline.data : [])
      .map((tweet: any) => compactTweet(source, tweet))
      .filter((item: Record<string, unknown> | null): item is Record<string, unknown> => Boolean(item));
    status.ok = true;
    status.items = items.length;
    return { items, status };
  } catch (error) {
    status.error = error instanceof Error ? error.message : String(error);
    return { items: [], status };
  }
}

async function insertSnapshot(payload: Record<string, unknown>, sourceStatus: Status[]): Promise<void> {
  const supabaseUrl = env("SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return;
  await fetchJson(`${supabaseUrl}/rest/v1/social_import_snapshots`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({
      source: payload.source,
      window_days: payload.window_days,
      total_items: Array.isArray(payload.items) ? payload.items.length : 0,
      payload,
      source_status: sourceStatus,
    }),
  });
}

async function latestSnapshot(request: Request): Promise<Response> {
  const readToken = env("PIASNEWS_SOCIAL_READ_TOKEN");
  if (readToken) {
    if (requestToken(request) !== readToken) return jsonResponse(401, { ok: false, error: "unauthorized" });
  }

  const supabaseUrl = env("SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse(500, { ok: false, error: "Supabase env is not configured" });

  const rows = await fetchJson(
    `${supabaseUrl}/rest/v1/social_import_snapshots?select=payload,created_at,total_items&order=created_at.desc&limit=1`,
    {
      headers: {
        apikey: serviceRoleKey,
        authorization: `Bearer ${serviceRoleKey}`,
      },
    },
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.payload) return jsonResponse(404, { ok: false, error: "no_social_snapshot" });
  return jsonResponse(200, row.payload);
}

async function dispatchWorkflow(): Promise<boolean> {
  const githubToken = env("GITHUB_TOKEN") || env("PIASNEWS_GITHUB_TOKEN");
  if (!githubToken) return false;
  const repository = env("GITHUB_REPOSITORY", DEFAULT_REPOSITORY);
  const workflow = env("PIASNEWS_GITHUB_WORKFLOW", DEFAULT_WORKFLOW);
  const ref = env("PIASNEWS_GITHUB_REF", DEFAULT_REF);
  const response = await fetch(`https://api.github.com/repos/${repository}/actions/workflows/${workflow}/dispatches`, {
    method: "POST",
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${githubToken}`,
      "content-type": "application/json",
      "user-agent": "piasnews-social-supabase/0.1",
      "x-github-api-version": "2022-11-28",
    },
    body: JSON.stringify({ ref }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub dispatch failed: ${response.status} ${body.slice(0, 300)}`);
  }
  return true;
}

Deno.serve(async (request) => {
  try {
    if (request.method === "GET") return await latestSnapshot(request);
    if (!authorizedByOptionalToken(request, "PIASNEWS_SOCIAL_COLLECT_TOKEN")) {
      return jsonResponse(401, { ok: false, error: "unauthorized" });
    }

    const bearerToken = env("PIASNEWS_X_BEARER_TOKEN") || env("X_BEARER_TOKEN");
    if (!bearerToken) return jsonResponse(500, { ok: false, error: "PIASNEWS_X_BEARER_TOKEN is not configured" });

    const windowDays = Number(env("PIASNEWS_DAYS", "3"));
    const perSource = Number(env("PIASNEWS_PER_SOURCE", "30"));
    const sources = await loadSources();
    const sourceStatus: Status[] = [];
    const items: Record<string, unknown>[] = [];
    for (const source of sources) {
      const result = await collectSource(source, bearerToken, perSource);
      sourceStatus.push(result.status);
      items.push(...result.items);
    }
    const anySourceOk = sourceStatus.some((status) => status.ok);
    if (!anySourceOk) {
      return jsonResponse(502, {
        ok: false,
        total_items: items.length,
        source_status: sourceStatus,
        dispatched: false,
        error: "no_social_source_collected",
      });
    }

    const payload = {
      source: "supabase-edge/x-api",
      generated_at: new Date().toISOString(),
      window_days: windowDays,
      items,
      source_status: sourceStatus,
    };
    await insertSnapshot(payload, sourceStatus);
    const dispatched = await dispatchWorkflow();

    return jsonResponse(200, {
      ok: sourceStatus.some((status) => status.ok),
      total_items: items.length,
      source_status: sourceStatus,
      dispatched,
    });
  } catch (error) {
    return jsonResponse(500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
