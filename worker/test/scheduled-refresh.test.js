import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";


const NOW = Date.parse("2026-09-25T11:00:00Z");
const HEARTBEAT = { cron: "5,20,35,50 * * * *" };
const ENV = {
  PUBLIC_DATA_BASE_URL: "https://data.example",
  GITHUB_OWNER: "ZnonYmitY",
  GITHUB_REPOSITORY: "piasnews",
  UPDATE_WORKFLOW: "update-piasnews.yml",
  GITHUB_REF: "main",
  GITHUB_TOKEN: "test-token",
};


function stateFetch({ calendar, daily, results, onDispatch = () => {} }) {
  return async (url, options = {}) => {
    const target = String(url);
    if (target === "https://data.example/calendar.json") return Response.json(calendar);
    if (target === "https://data.example/daily.json") return Response.json(daily);
    if (target === "https://data.example/session-results.json") return Response.json(results);
    if (target.includes("/actions/workflows/update-piasnews.yml/dispatches")) {
      onDispatch({ url: target, options, body: JSON.parse(options.body) });
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected fetch: ${target}`);
  };
}


test("heartbeat dispatches the repository gate for an unhandled completed session", async () => {
  const original = { fetch: globalThis.fetch, now: Date.now };
  let dispatched;
  Date.now = () => NOW;
  globalThis.fetch = stateFetch({
    calendar: { races: [{ id: "2026-round-15", sessions: { practice_3: "2026-09-25T08:30:00Z" } }] },
    daily: { generated_at: "2026-09-25T00:00:00Z" },
    results: { latest: { session_ref: "2026-round-15:practice_2" } },
    onDispatch: (value) => { dispatched = value; },
  });
  try {
    await worker.scheduled(HEARTBEAT, ENV);
    assert.equal(dispatched.body.ref, "main");
    assert.deepEqual(dispatched.body.inputs, { scheduled_check: "true", apply_only: "false" });
    assert.equal(dispatched.options.headers.Authorization, "Bearer test-token");
  } finally {
    globalThis.fetch = original.fetch;
    Date.now = original.now;
  }
});


test("heartbeat stays inside the Worker when neither daily nor session refresh is due", async () => {
  const original = { fetch: globalThis.fetch, now: Date.now };
  let dispatches = 0;
  Date.now = () => NOW;
  globalThis.fetch = stateFetch({
    calendar: { races: [{ id: "2026-round-15", sessions: { qualifying: "2026-09-25T12:00:00Z" } }] },
    daily: { generated_at: "2026-09-25T00:00:00Z" },
    results: { latest: { session_ref: "2026-round-15:practice_3" } },
    onDispatch: () => { dispatches += 1; },
  });
  try {
    await worker.scheduled(HEARTBEAT, ENV);
    assert.equal(dispatches, 0);
  } finally {
    globalThis.fetch = original.fetch;
    Date.now = original.now;
  }
});


test("heartbeat catches a missed 07:00 Beijing daily refresh", async () => {
  const original = { fetch: globalThis.fetch, now: Date.now };
  let dispatches = 0;
  Date.now = () => Date.parse("2026-09-25T23:05:00Z");
  globalThis.fetch = stateFetch({
    calendar: { races: [] },
    daily: { generated_at: "2026-09-24T23:10:00Z" },
    results: { latest: null },
    onDispatch: () => { dispatches += 1; },
  });
  try {
    await worker.scheduled(HEARTBEAT, ENV);
    assert.equal(dispatches, 1);
  } finally {
    globalThis.fetch = original.fetch;
    Date.now = original.now;
  }
});

