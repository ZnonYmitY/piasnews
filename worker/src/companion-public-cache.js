// Bounded delivery resilience for configured public JSON feeds. Cache age
// is separate from the source's own observation/publication clocks. This module
// never refreshes those clocks, stores conversation text, or calls a model.
const CACHE_TTL_MS = 60 * 1000;
const MAX_STALE_AGE_MS = 6 * 60 * 60 * 1000;
const MAX_FEEDS = 5;
const STORE_TIMEOUT_MS = 200;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const FEED_NAMES = new Set(["calendar.json", "session-results.json", "hot-events.json", "items.json", "social.json"]);
const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);

function configuredUrl(value) {
  if (typeof value !== "string") throw new TypeError("A configured public feed URL is required.");
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash
      || !FEED_NAMES.has(url.pathname.split("/").at(-1))) throw new TypeError("Invalid configured public feed URL.");
  return url.href;
}

function generatedTime(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function validPayload(url, payload, nowMs) {
  if (!isRecord(payload)) return false;
  const generated = generatedTime(payload.generated_at);
  if (generated === null || generated > nowMs + FUTURE_TOLERANCE_MS) return false;
  const feed = new URL(url).pathname.split("/").at(-1);
  if (feed === "calendar.json") return Array.isArray(payload.races) || isRecord(payload.next_race);
  if (feed === "session-results.json") {
    return (typeof payload.result_available === "boolean" || Array.isArray(payload.results))
      && (payload.latest === null || isRecord(payload.latest) || Array.isArray(payload.results));
  }
  return Array.isArray(payload[feed === "hot-events.json" ? "events" : "items"]);
}

function unavailable(reason) {
  // Fetch errors may contain implementation details; expose a bounded code,
  // never the upstream error text or request configuration.
  const error = new Error(`Public feed unavailable: ${reason}.`);
  error.code = reason === "invalid_payload" ? "COMPANION_PUBLIC_FEED_INVALID" : "COMPANION_PUBLIC_FEED_FETCH_FAILED";
  return error;
}

async function boundedStore(operation) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise(resolve => { timer = setTimeout(() => resolve(undefined), STORE_TIMEOUT_MS); }),
    ]);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Keep one instance at module scope for a server-owned set of at most five URLs.
 * load(url) returns { data, delivery }; unknown URLs fail before any fetch.
 * Successful payloads are copied, not mutated, and every consumer gets its own
 * copy. Optional store.read/write share { data, storedAt } snapshots through a
 * server-owned cache adapter, with bounded best-effort operations. With neither
 * a usable snapshot nor a successful fetch, failure remains a failure; this is
 * neither durable storage nor evidence of source freshness.
 */
export function createCompanionPublicFeedCache({ urls, fetchJson, now = Date.now, store = null } = {}) {
  if (!Array.isArray(urls) || !urls.length || urls.length > MAX_FEEDS || typeof fetchJson !== "function" || typeof now !== "function") {
    throw new TypeError("Configure one to five public feed URLs, a fetcher and a clock.");
  }
  if (store !== null && (!isRecord(store) || typeof store.read !== "function" || typeof store.write !== "function")) {
    throw new TypeError("A shared public cache store must provide read and write functions.");
  }
  const allowed = [...new Set(urls.map(configuredUrl))];
  const entries = new Map(allowed.map(url => [url, { data: null, storedAt: null, inFlight: null }]));
  const clock = () => {
    const value = now();
    if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError("A valid cache clock is required.");
    return value;
  };
  const age = (entry, nowMs) => entry.storedAt === null ? Infinity : Math.max(0, nowMs - entry.storedAt);
  const delivered = (entry, status, nowMs, refreshError = null) => ({
    data: structuredClone(entry.data),
    delivery: {
      status, cache_stored_at: new Date(entry.storedAt).toISOString(), cache_age_ms: age(entry, nowMs),
      refresh_attempted: !["cache_hit", "shared_cache_hit"].includes(status), ...(refreshError ? { refresh_error: refreshError } : {}),
    },
  });

  return Object.freeze({
    async load(url) {
      // Exact allowlist lookup: neither user identifiers nor user-supplied URLs
      // can create extra cache entries or direct a fetch to another host.
      const entry = entries.get(url);
      if (!entry) throw new TypeError("Public feed URL is not configured.");
      const nowMs = clock();
      if (entry.data !== null && age(entry, nowMs) < CACHE_TTL_MS) return delivered(entry, "cache_hit", nowMs);
      if (!entry.inFlight) {
        entry.inFlight = (async () => {
          if (store) {
            const shared = await boundedStore(() => store.read(url));
            const checkedAt = clock();
            try {
              if (isRecord(shared) && typeof shared.storedAt === "number" && Number.isFinite(shared.storedAt)
                  && shared.storedAt <= checkedAt && checkedAt - shared.storedAt <= MAX_STALE_AGE_MS
                  && validPayload(url, shared.data, shared.storedAt)) {
                const sharedGenerated = generatedTime(shared.data.generated_at);
                const localGenerated = entry.data ? generatedTime(entry.data.generated_at) : null;
                if (!entry.data || sharedGenerated > localGenerated || (sharedGenerated === localGenerated && shared.storedAt > entry.storedAt)) {
                  // Retain the successful observation clock from the other
                  // isolate, not the moment this request reads its cache copy.
                  const snapshot = structuredClone(shared.data);
                  entry.data = snapshot;
                  entry.storedAt = shared.storedAt;
                  if (age(entry, checkedAt) < CACHE_TTL_MS) return { status: "shared_cache_hit", at: checkedAt };
                }
              }
            } catch {
              // Malformed or uncloneable shared entries are cache misses.
            }
          }
          let reason = "fetch_failed";
          try {
            const payload = await fetchJson(url);
            const receivedAt = clock();
            reason = "invalid_payload";
            if (!validPayload(url, payload, receivedAt)) throw unavailable(reason);
            // A CDN serving an older file is not a successful update to a newer
            // cached snapshot. Keep the last good copy within the same age cap.
            if (entry.data && generatedTime(payload.generated_at) < generatedTime(entry.data.generated_at)) throw unavailable(reason);
            const snapshot = structuredClone(payload);
            entry.data = snapshot;
            entry.storedAt = receivedAt;
            if (store) await boundedStore(() => store.write(url, { data: structuredClone(snapshot), storedAt: receivedAt }));
            return { status: "network", at: clock() };
          } catch {
            const failedAt = clock();
            if (entry.data !== null && age(entry, failedAt) <= MAX_STALE_AGE_MS) {
              return { status: "stale_if_error", at: failedAt, refreshError: reason };
            }
            throw unavailable(reason);
          }
        })();
      }
      const pending = entry.inFlight;
      try {
        const result = await pending;
        return delivered(entry, result.status, result.at, result.refreshError);
      } finally {
        if (entry.inFlight === pending) entry.inFlight = null;
      }
    },
  });
}
