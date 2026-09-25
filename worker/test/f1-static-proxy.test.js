import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";


const TOKEN = "test-f1-static-proxy-token";
const ENV = { F1_STATIC_PROXY_TOKEN: TOKEN };
const INDEX_URL = "https://livetiming.formula1.com/static/2026/Index.json";
const STREAM_URL = "https://livetiming.formula1.com/static/2026/2026-09-26_Azerbaijan_Grand_Prix/2026-09-25_Practice_3/TimingData.jsonStream";


function proxyRequest(url = INDEX_URL, options = {}) {
  const headers = {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  return new Request("https://worker.example/scheduler/f1-static", {
    method: options.method || "POST",
    headers,
    body: options.body === undefined ? JSON.stringify({ url }) : options.body,
  });
}


async function withFetch(mock, callback) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mock;
  try {
    return await callback();
  } finally {
    globalThis.fetch = originalFetch;
  }
}


test("authenticated proxy fetches only the requested F1 static index without forwarding credentials", async () => {
  let upstream;
  await withFetch(async (url, options) => {
    upstream = { url: String(url), options };
    return new Response('{"Meetings":[]}', {
      status: 200,
      headers: { "Content-Type": "text/html", "Content-Length": "15" },
    });
  }, async () => {
    const response = await worker.fetch(proxyRequest(), ENV);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '{"Meetings":[]}');
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("Content-Type"), "application/json; charset=utf-8");
    assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  });

  assert.equal(upstream.url, INDEX_URL);
  assert.equal(upstream.options.method, "GET");
  assert.equal(upstream.options.redirect, "manual");
  assert.equal(upstream.options.headers.Authorization, undefined);
  assert.equal(upstream.options.headers["User-Agent"], "piasnews-f1-static-proxy/1.0");
  assert.deepEqual(upstream.options.cf, { cacheTtl: 0 });
});


test("proxy accepts an exact same-year two-directory timing stream path", async () => {
  const payload = "00:00:00.000{\"Lines\":{}}\r\n";
  await withFetch(async () => new Response(payload), async () => {
    const response = await worker.fetch(proxyRequest(STREAM_URL), ENV);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Content-Type"), "application/octet-stream");
    assert.equal(await response.text(), payload);
  });
});


test("proxy permits only the HTTPS default port and canonicalizes it upstream", async () => {
  let fetchedUrl;
  await withFetch(async (url) => {
    fetchedUrl = String(url);
    return new Response("{}");
  }, async () => {
    const response = await worker.fetch(proxyRequest("https://livetiming.formula1.com:443/static/2026/Index.json"), ENV);
    assert.equal(response.status, 200);
  });
  assert.equal(fetchedUrl, INDEX_URL);
});


test("proxy requires its dedicated bearer token and a configured secret", async () => {
  let calls = 0;
  await withFetch(async () => { calls += 1; return new Response("unexpected"); }, async () => {
    for (const authorization of [undefined, "Basic abc", "Bearer wrong-token", "Bearer "]) {
      const headers = { "Content-Type": "application/json" };
      if (authorization !== undefined) headers.Authorization = authorization;
      const response = await worker.fetch(new Request("https://worker.example/scheduler/f1-static", {
        method: "POST",
        headers,
        body: JSON.stringify({ url: INDEX_URL }),
      }), ENV);
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: "Unauthorized." });
    }
    const unavailable = await worker.fetch(proxyRequest(), {});
    assert.equal(unavailable.status, 503);
  });
  assert.equal(calls, 0);
});


test("proxy rejects non-POST requests and non-JSON or non-exact bodies before fetching", async () => {
  let calls = 0;
  await withFetch(async () => { calls += 1; return new Response("unexpected"); }, async () => {
    const getResponse = await worker.fetch(new Request("https://worker.example/scheduler/f1-static"), ENV);
    assert.equal(getResponse.status, 405);

    const wrongType = await worker.fetch(proxyRequest(INDEX_URL, {
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "text/plain" },
    }), ENV);
    assert.equal(wrongType.status, 415);

    for (const body of [
      "{",
      "null",
      "[]",
      "{}",
      JSON.stringify({ url: INDEX_URL, extra: true }),
      JSON.stringify({ URL: INDEX_URL }),
      JSON.stringify({ url: 81 }),
    ]) {
      const response = await worker.fetch(proxyRequest(INDEX_URL, { body }), ENV);
      assert.equal(response.status, 400);
    }
  });
  assert.equal(calls, 0);
});


test("proxy URL allowlist rejects alternate hosts, credentials, parameters, ports, traversal, and path variants", async () => {
  const rejected = [
    "http://livetiming.formula1.com/static/2026/Index.json",
    "https://evil.example/static/2026/Index.json",
    "https://livetiming.formula1.com.evil.example/static/2026/Index.json",
    "https://user:secret@livetiming.formula1.com/static/2026/Index.json",
    "https://livetiming.formula1.com:444/static/2026/Index.json",
    "https://livetiming.formula1.com/static/2026/Index.json?token=secret",
    "https://livetiming.formula1.com/static/2026/Index.json#fragment",
    "https://livetiming.formula1.com/static/2026/2026-09-26_Azerbaijan_Grand_Prix/TimingData.jsonStream",
    "https://livetiming.formula1.com/static/2026/a/b/c/TimingData.jsonStream",
    "https://livetiming.formula1.com/static/2026/2025-09-26_Azerbaijan_Grand_Prix/2026-09-25_Practice_3/TimingData.jsonStream",
    "https://livetiming.formula1.com/static/2026/2026-09-26_Azerbaijan_Grand_Prix/2025-09-25_Practice_3/TimingData.jsonStream",
    "https://livetiming.formula1.com/static/2026/2026-09-26_Azerbaijan_Grand_Prix/2026-09-25_Practice_3/CarData.jsonStream",
    "https://livetiming.formula1.com/static/2026/2026-09-26_Azerbaijan_Grand_Prix/2026-09-25_Practice_3/Index.json",
    "https://livetiming.formula1.com/static/2026/2026-09-26_Azerbaijan_Grand_Prix/%2e%2e/TimingData.jsonStream",
    "https://livetiming.formula1.com/static/2026/2026-09-26_Azerbaijan_Grand_Prix%2f2026-09-25_Practice_3/TimingData.jsonStream",
  ];
  let calls = 0;
  await withFetch(async () => { calls += 1; return new Response("unexpected"); }, async () => {
    for (const url of rejected) {
      const response = await worker.fetch(proxyRequest(url), ENV);
      assert.equal(response.status, 400, url);
      assert.deepEqual(await response.json(), { error: "URL is not allowed." }, url);
    }
  });
  assert.equal(calls, 0);
});


test("proxy does not follow redirects or expose upstream response bodies and errors", async () => {
  await withFetch(async () => new Response("PRIVATE UPSTREAM BODY", { status: 302, headers: { Location: "https://evil.example" } }), async () => {
    const response = await worker.fetch(proxyRequest(), ENV);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      error: "F1 static upstream request failed.",
      upstream_status: 302,
    });
  });

  await withFetch(async () => { throw new Error("PRIVATE FETCH ERROR"); }, async () => {
    const response = await worker.fetch(proxyRequest(), ENV);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: "F1 static upstream request failed." });
  });
});


test("proxy rejects declared and streamed responses larger than 8 MiB", async () => {
  await withFetch(async () => new Response("small", { headers: { "Content-Length": String(8 * 1024 * 1024 + 1) } }), async () => {
    const response = await worker.fetch(proxyRequest(), ENV);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: "F1 static upstream response is too large." });
  });

  let cancelled = false;
  const oversized = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(8 * 1024 * 1024));
      controller.enqueue(new Uint8Array(1));
    },
    cancel() { cancelled = true; },
  });
  await withFetch(async () => new Response(oversized), async () => {
    const response = await worker.fetch(proxyRequest(STREAM_URL), ENV);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: "F1 static upstream response is too large." });
  });
  assert.equal(cancelled, true);
});
