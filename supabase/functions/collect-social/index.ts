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
  stage?: string;
  platform?: string;
  handle?: string;
  source?: string;
  ok: boolean;
  items?: number;
  skipped?: number;
  reason?: string;
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

function splitEnvList(name: string): string[] {
  return env(name)
    .split(/[\n,]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function unwrapImportPayload(payload: any): any {
  if (Array.isArray(payload)) {
    for (const row of payload) {
      if (row && typeof row === "object" && (Array.isArray(row.payload) || typeof row.payload === "object")) {
        return row.payload;
      }
    }
    return payload;
  }
  if (!payload || typeof payload !== "object") return payload;
  for (const key of ["payload", "compact_payload", "social_import"]) {
    if (Array.isArray(payload[key]) || (payload[key] && typeof payload[key] === "object")) return payload[key];
  }
  if (Array.isArray(payload.data) || (payload.data && typeof payload.data === "object")) {
    return unwrapImportPayload(payload.data);
  }
  return payload;
}

function compactImportedItem(raw: any): Record<string, unknown> | null {
  const platform = cleanText(raw?.platform || raw?.source_type).toLowerCase();
  const handle = cleanText(raw?.handle || raw?.source_handle || raw?.source || "").replace(/^@/, "");
  const url = cleanText(raw?.url);
  const text = cleanText(raw?.text || raw?.summary || raw?.title);
  const createdAt = cleanText(raw?.created_at || raw?.published_at);
  if (!platform || !handle || !url || !text || !createdAt) return null;
  const id = cleanText(raw?.id || url.replace(/\/+$/, "").split("/").pop());
  return {
    platform,
    handle,
    id,
    url,
    text,
    created_at: createdAt,
    kind: cleanText(raw?.kind || raw?.post_kind || "post").toLowerCase() || "post",
    metrics: raw?.metrics || raw?.public_metrics || {},
    language: raw?.language || raw?.lang || "unknown",
  };
}

function importItemsFromPayload(payload: any): { items: Record<string, unknown>[]; skipped: number } {
  const unwrapped = unwrapImportPayload(payload);
  const rawItems = Array.isArray(unwrapped) ? unwrapped : Array.isArray(unwrapped?.items) ? unwrapped.items : [];
  const items: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const raw of rawItems) {
    const item = compactImportedItem(raw);
    if (item) items.push(item);
    else skipped += 1;
  }
  return { items, skipped };
}

async function readImportUrl(url: string, bearerToken = ""): Promise<any> {
  return await fetchJson(url, {
    headers: {
      ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}),
      "user-agent": "piasnews-social-supabase/0.1",
    },
  });
}

async function readOptionalRequestJson(request: Request): Promise<any | null> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) return null;
  const body = await request.text();
  if (!body.trim()) return null;
  return JSON.parse(body);
}

async function collectImportUrl(label: string, url: string, bearerToken = ""): Promise<{
  items: Record<string, unknown>[];
  status: Status;
}> {
  const status: Status = { stage: "json_import_url", source: label, ok: false, items: 0 };
  try {
    const result = importItemsFromPayload(await readImportUrl(url, bearerToken));
    status.ok = true;
    status.items = result.items.length;
    status.skipped = result.skipped;
    return { items: result.items, status };
  } catch (error) {
    status.error = error instanceof Error ? error.message : String(error);
    return { items: [], status };
  }
}

function collectImportPayload(label: string, payload: any): { items: Record<string, unknown>[]; status: Status } {
  const result = importItemsFromPayload(payload);
  return {
    items: result.items,
    status: {
      stage: "json_import",
      source: label,
      ok: true,
      items: result.items.length,
      skipped: result.skipped,
    },
  };
}

async function collectExternalImports(requestPayload: any | null): Promise<{
  items: Record<string, unknown>[];
  statuses: Status[];
}> {
  const items: Record<string, unknown>[] = [];
  const statuses: Status[] = [];

  if (requestPayload) {
    const result = collectImportPayload("request_body", requestPayload);
    items.push(...result.items);
    statuses.push(result.status);
  }

  for (
    const [label, raw] of [
      ["PIASNEWS_SOCIAL_EXTRA_INPUT_JSON", env("PIASNEWS_SOCIAL_EXTRA_INPUT_JSON")],
      ["PIASNEWS_INSTAGRAM_INPUT_JSON", env("PIASNEWS_INSTAGRAM_INPUT_JSON")],
    ]
  ) {
    if (!raw.trim()) continue;
    try {
      const result = collectImportPayload(label, JSON.parse(raw));
      items.push(...result.items);
      statuses.push(result.status);
    } catch (error) {
      statuses.push({
        stage: "json_import",
        source: label,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const genericBearer = env("PIASNEWS_SOCIAL_EXTRA_INPUT_AUTH_BEARER");
  for (const url of splitEnvList("PIASNEWS_SOCIAL_EXTRA_INPUT_URLS")) {
    const result = await collectImportUrl(url, url, genericBearer);
    items.push(...result.items);
    statuses.push(result.status);
  }

  const instagramUrl = env("PIASNEWS_INSTAGRAM_INPUT_URL");
  if (instagramUrl) {
    const result = await collectImportUrl(
      "PIASNEWS_INSTAGRAM_INPUT_URL",
      instagramUrl,
      env("PIASNEWS_INSTAGRAM_INPUT_AUTH_BEARER") || genericBearer,
    );
    items.push(...result.items);
    statuses.push(result.status);
  }

  return { items, statuses };
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

function dedupeItems(items: Record<string, unknown>[]): Record<string, unknown>[] {
  const result = new Map<string, Record<string, unknown>>();
  for (const item of items) {
    const key = cleanText(item.url) || `${cleanText(item.platform)}:${cleanText(item.handle)}:${cleanText(item.id)}`;
    if (!key) continue;
    if (!result.has(key)) result.set(key, item);
  }
  return [...result.values()];
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

    const windowDays = Number(env("PIASNEWS_DAYS", "3"));
    const perSource = Number(env("PIASNEWS_PER_SOURCE", "30"));
    const requestPayload = await readOptionalRequestJson(request);
    const sourceStatus: Status[] = [];
    const items: Record<string, unknown>[] = [];

    const bearerToken = env("PIASNEWS_X_BEARER_TOKEN") || env("X_BEARER_TOKEN");
    if (bearerToken) {
      const sources = await loadSources();
      for (const source of sources) {
        const result = await collectSource(source, bearerToken, perSource);
        sourceStatus.push(result.status);
        items.push(...result.items);
      }
    } else {
      sourceStatus.push({
        stage: "x_api",
        platform: "x",
        ok: false,
        reason: "PIASNEWS_X_BEARER_TOKEN is not configured",
      });
    }

    const externalImports = await collectExternalImports(requestPayload);
    sourceStatus.push(...externalImports.statuses);
    items.push(...externalImports.items);

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

    const compactItems = dedupeItems(items);
    const payload = {
      source: sourceStatus.some((status) => status.stage?.startsWith("json_import"))
        ? "supabase-edge/x-api+external-import"
        : "supabase-edge/x-api",
      generated_at: new Date().toISOString(),
      window_days: windowDays,
      items: compactItems,
      source_status: sourceStatus,
    };
    await insertSnapshot(payload, sourceStatus);
    const dispatched = await dispatchWorkflow();

    return jsonResponse(200, {
      ok: sourceStatus.some((status) => status.ok),
      total_items: compactItems.length,
      source_status: sourceStatus,
      dispatched,
    });
  } catch (error) {
    return jsonResponse(500, { ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
