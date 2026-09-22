import assert from "node:assert/strict";
import test from "node:test";
import { createCompanionPublicFeedCache } from "../src/companion-public-cache.js";

const START = Date.parse("2026-09-22T06:00:00Z");
const URLS = ["calendar", "session-results", "hot-events", "items", "social"].map(name => `https://example.test/data/${name}.json`);
const calendar = (generatedAt = "2026-09-22T06:00:00Z") => ({ generated_at: generatedAt, races: [{ id: "example-race" }] });

test("successful snapshots reuse one fetch for 60 seconds then refresh", async () => {
  let current = START;
  let calls = 0;
  const cache = createCompanionPublicFeedCache({ urls: [URLS[0]], now: () => current, fetchJson: async () => { calls++; return calendar(); } });
  const first = await cache.load(URLS[0]);
  assert.equal(first.delivery.status, "network");
  current += 59999;
  const hit = await cache.load(URLS[0]);
  assert.equal(hit.delivery.status, "cache_hit");
  assert.equal(hit.delivery.cache_age_ms, 59999);
  assert.equal(calls, 1);
  current++;
  assert.equal((await cache.load(URLS[0])).delivery.status, "network");
  assert.equal(calls, 2);
});

test("concurrent loads share one in-flight network refresh and return isolated snapshots", async () => {
  let calls = 0;
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const cache = createCompanionPublicFeedCache({ urls: [URLS[0]], now: () => START, fetchJson: async () => { calls++; await wait; return calendar(); } });
  const first = cache.load(URLS[0]);
  const second = cache.load(URLS[0]);
  assert.equal(calls, 1);
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.delivery.status, "network");
  assert.equal(b.delivery.status, "network");
  a.data.races[0].id = "consumer-edit";
  assert.equal(b.data.races[0].id, "example-race");
  assert.equal((await cache.load(URLS[0])).data.races[0].id, "example-race");
});

test("failed refresh retains the last success for at most six hours without changing source timestamps", async () => {
  let current = START;
  let failing = false;
  const data = { generated_at: "2026-09-18T06:15:23.161902Z", result_available: true, latest: { fetched_at: "2026-09-18T06:15:23.161902Z" }, results: [] };
  const original = structuredClone(data);
  const cache = createCompanionPublicFeedCache({ urls: [URLS[1]], now: () => current, fetchJson: async () => {
    if (failing) throw new Error("upstream-private-detail");
    return data;
  } });
  const first = await cache.load(URLS[1]);
  failing = true;
  current += 60000;
  const fallback = await cache.load(URLS[1]);
  assert.equal(fallback.delivery.status, "stale_if_error");
  assert.equal(fallback.delivery.refresh_error, "fetch_failed");
  assert.equal(fallback.delivery.cache_stored_at, first.delivery.cache_stored_at);
  assert.deepEqual(fallback.data, original);
  assert.deepEqual(data, original);
  current = START + 6 * 3600000;
  assert.equal((await cache.load(URLS[1])).delivery.status, "stale_if_error");
  current++;
  await assert.rejects(cache.load(URLS[1]), error => error.code === "COMPANION_PUBLIC_FEED_FETCH_FAILED" && !error.message.includes("private-detail"));
});

test("invalid payloads never replace a good snapshot or acquire a successful cache timestamp", async () => {
  let current = START;
  let payload = calendar();
  const cache = createCompanionPublicFeedCache({ urls: [URLS[0]], now: () => current, fetchJson: async () => payload });
  const good = await cache.load(URLS[0]);
  for (const invalid of [null, [], {}, { generated_at: "invalid", races: [] }, { generated_at: "2026-02-31T00:00:00Z", races: [] }, calendar("2026-09-23T06:00:00Z"), calendar("2026-09-21T06:00:00Z"), { generated_at: "2026-09-22T06:00:00Z", error: "failed" }]) {
    current += 60000;
    payload = invalid;
    const fallback = await cache.load(URLS[0]);
    assert.equal(fallback.delivery.status, "stale_if_error");
    assert.equal(fallback.delivery.refresh_error, "invalid_payload");
    assert.equal(fallback.delivery.cache_stored_at, good.delivery.cache_stored_at);
    assert.deepEqual(fallback.data, good.data);
  }
  current = START + 6 * 3600000 + 1;
  await assert.rejects(cache.load(URLS[0]), { code: "COMPANION_PUBLIC_FEED_INVALID" });
});

test("expired concurrent refreshes single-flight without extending an older successful cache clock", async () => {
  let current = START;
  let calls = 0;
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const cache = createCompanionPublicFeedCache({ urls: [URLS[0]], now: () => current, fetchJson: async () => {
    calls++;
    if (calls > 1) { await wait; throw new Error("timeout"); }
    return calendar();
  } });
  const original = await cache.load(URLS[0]);
  current += 60000;
  const first = cache.load(URLS[0]);
  const second = cache.load(URLS[0]);
  assert.equal(calls, 2);
  release();
  const results = await Promise.all([first, second]);
  assert.ok(results.every(result => result.delivery.status === "stale_if_error"));
  assert.ok(results.every(result => result.delivery.cache_stored_at === original.delivery.cache_stored_at));
});

test("invalid cold payloads are not cached and each later request retries the public feed", async () => {
  let calls = 0;
  const cache = createCompanionPublicFeedCache({ urls: [URLS[0]], now: () => START, fetchJson: async () => { calls++; return { error: "no-data" }; } });
  await assert.rejects(cache.load(URLS[0]), { code: "COMPANION_PUBLIC_FEED_INVALID" });
  await assert.rejects(cache.load(URLS[0]), { code: "COMPANION_PUBLIC_FEED_INVALID" });
  assert.equal(calls, 2);
});

test("cold failures remain failures, concurrent failures share a request, and a later success can recover", async () => {
  let calls = 0;
  let succeed = false;
  const cache = createCompanionPublicFeedCache({ urls: [URLS[0]], now: () => START, fetchJson: async () => {
    calls++;
    if (!succeed) throw new Error("timeout");
    return calendar();
  } });
  const outcomes = await Promise.allSettled([cache.load(URLS[0]), cache.load(URLS[0])]);
  assert.equal(calls, 1);
  assert.ok(outcomes.every(outcome => outcome.status === "rejected"));
  succeed = true;
  assert.equal((await cache.load(URLS[0])).delivery.status, "network");
  assert.equal(calls, 2);
});

test("only up to five configured public feed URLs can allocate entries or trigger fetches", async () => {
  let calls = 0;
  const payloads = [calendar(), { generated_at: "2026-09-22T06:00:00Z", result_available: false, latest: null }, { generated_at: "2026-09-22T06:00:00Z", events: [] }, { generated_at: "2026-09-22T06:00:00Z", items: [] }];
  const cache = createCompanionPublicFeedCache({ urls: URLS, now: () => START, fetchJson: async url => { calls++; return payloads[Math.min(URLS.indexOf(url), 3)]; } });
  for (const url of URLS) await cache.load(url);
  assert.equal(calls, 5);
  for (const url of ["https://other.test/data/calendar.json", `${URLS[0]}?user=1`, "arbitrary-user-id"]) await assert.rejects(cache.load(url), /not configured/);
  assert.equal(calls, 5);
  for (const urls of [[], [...URLS, "https://other.test/data/calendar.json"], [`${URLS[0]}?user=1`], ["https://user:password@example.test/data/calendar.json"], ["https://example.test/data/private.json"]]) {
    assert.throws(() => createCompanionPublicFeedCache({ urls, fetchJson: async () => calendar() }), TypeError);
  }
});

test("a fresh shared snapshot warms a cold instance without fetching or resetting source and cache clocks", async () => {
  let current = START;
  let calls = 0;
  const shared = new Map();
  const store = { read: async url => shared.get(url) || null, write: async (url, snapshot) => { shared.set(url, snapshot); } };
  const payload = { generated_at: "2026-09-18T06:15:23.161902Z", result_available: true, latest: { fetched_at: "2026-09-18T06:15:23.161902Z" } };
  const first = createCompanionPublicFeedCache({ urls: [URLS[1]], store, now: () => current, fetchJson: async () => { calls++; return payload; } });
  const network = await first.load(URLS[1]);
  current += 30000;
  const second = createCompanionPublicFeedCache({ urls: [URLS[1]], store, now: () => current, fetchJson: async () => { calls++; throw new Error("unavailable"); } });
  const cached = await second.load(URLS[1]);
  assert.equal(calls, 1);
  assert.equal(cached.delivery.status, "shared_cache_hit");
  assert.equal(cached.delivery.refresh_attempted, false);
  assert.equal(cached.delivery.cache_age_ms, 30000);
  assert.equal(cached.delivery.cache_stored_at, network.delivery.cache_stored_at);
  assert.deepEqual(cached.data, payload);
  cached.data.latest.fetched_at = "consumer-edit";
  assert.deepEqual(shared.get(URLS[1]).data, payload);
  assert.equal((await second.load(URLS[1])).delivery.status, "cache_hit");
});

test("stale shared snapshots can survive a failed refresh only within their original six-hour age", async () => {
  let current = START + 60000;
  let writes = 0;
  const shared = { data: calendar(), storedAt: START };
  const store = { read: async () => shared, write: async () => { writes++; } };
  const make = () => createCompanionPublicFeedCache({ urls: [URLS[0]], store, now: () => current, fetchJson: async () => { throw new Error("timeout"); } });
  const fallback = await make().load(URLS[0]);
  assert.equal(fallback.delivery.status, "stale_if_error");
  assert.equal(fallback.delivery.cache_stored_at, new Date(START).toISOString());
  current = START + 6 * 3600000;
  assert.equal((await make().load(URLS[0])).delivery.cache_age_ms, 6 * 3600000);
  current++;
  await assert.rejects(make().load(URLS[0]), { code: "COMPANION_PUBLIC_FEED_FETCH_FAILED" });
  assert.equal(writes, 0, "Reading or serving a fallback must not renew the shared success clock.");
});

test("invalid or future shared snapshots cannot become fallbacks when the network fails", async () => {
  for (const snapshot of [
    null, {}, { data: calendar(), storedAt: "2026-09-22T06:00:00Z" },
    { data: calendar(), storedAt: START + 1 }, { data: calendar(), storedAt: START - 6 * 3600000 - 1 },
    { data: {}, storedAt: START }, { data: calendar("2026-09-23T06:00:00Z"), storedAt: START },
  ]) {
    const cache = createCompanionPublicFeedCache({ urls: [URLS[0]], now: () => START,
      store: { read: async () => snapshot, write: async () => {} }, fetchJson: async () => { throw new Error("timeout"); } });
    await assert.rejects(cache.load(URLS[0]), { code: "COMPANION_PUBLIC_FEED_FETCH_FAILED" });
  }
});

test("shared reads are single-flight and unknown URLs never reach either store operation", async () => {
  let reads = 0;
  let calls = 0;
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  const cache = createCompanionPublicFeedCache({ urls: [URLS[0]], now: () => START,
    store: { read: async () => { reads++; await wait; return { data: calendar(), storedAt: START }; }, write: async () => assert.fail("No write expected") },
    fetchJson: async () => { calls++; return calendar(); } });
  const a = cache.load(URLS[0]);
  const b = cache.load(URLS[0]);
  release();
  const values = await Promise.all([a, b]);
  assert.equal(reads, 1);
  assert.equal(calls, 0);
  assert.ok(values.every(value => value.delivery.status === "shared_cache_hit"));
  await assert.rejects(cache.load(URLS[1]), /not configured/);
  assert.equal(reads, 1);
});

test("a shared older publication cannot overwrite a newer local snapshot despite a newer shared storage time", async () => {
  let current = START;
  let shared = null;
  let fail = false;
  const cache = createCompanionPublicFeedCache({ urls: [URLS[0]], now: () => current,
    store: { read: async () => shared, write: async () => {} },
    fetchJson: async () => { if (fail) throw new Error("timeout"); return calendar(); } });
  await cache.load(URLS[0]);
  current += 60000;
  fail = true;
  shared = { data: calendar("2026-09-21T06:00:00Z"), storedAt: current };
  const fallback = await cache.load(URLS[0]);
  assert.equal(fallback.delivery.status, "stale_if_error");
  assert.equal(fallback.delivery.cache_stored_at, new Date(START).toISOString());
  assert.equal(fallback.data.generated_at, calendar().generated_at);
});

test("store exceptions and bounded timeouts do not block a successful public fetch", async () => {
  for (const operation of [() => { throw new Error("store-failure"); }, () => new Promise(() => {})]) {
    let calls = 0;
    const cache = createCompanionPublicFeedCache({ urls: [URLS[0]], now: () => START,
      store: { read: operation, write: operation }, fetchJson: async () => { calls++; return calendar(); } });
    const started = performance.now();
    const value = await cache.load(URLS[0]);
    assert.equal(value.delivery.status, "network");
    assert.equal(calls, 1);
    assert.ok(performance.now() - started < 1500, "Both optional store operations have bounded waits.");
    assert.equal((await cache.load(URLS[0])).delivery.status, "cache_hit");
  }
});
