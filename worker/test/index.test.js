import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";


function createAnalyticsDb() {
  const operations = [];
  let periodCount = 0;
  return {
    operations,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              operations.push({ sql, values });
              return { success: true };
            },
            async first() {
              if (sql.includes("day = ?")) return { total: 3 };
              periodCount += 1;
              return { total: periodCount === 1 ? 12 : 8 };
            },
            async all() {
              if (sql.includes("GROUP BY day")) return { results: [{ day: values[1], views: 3 }] };
              if (sql.includes("GROUP BY path")) return { results: [{ path: "/piasnews/", views: 12 }] };
              if (sql.includes("GROUP BY referrer_host")) {
                return { results: [{ referrer_host: "github.com", views: 5 }] };
              }
              return { results: [] };
            },
          };
        },
      };
    },
  };
}


const env = {
  ADMIN_ALLOWED_ORIGINS: "https://znonymity.github.io",
  ADMIN_API_KEY: "test-admin-key",
  ANALYTICS_DB: createAnalyticsDb(),
  GITHUB_OWNER: "ZnonYmitY",
  GITHUB_REPOSITORY: "piasnews",
  GITHUB_WORKFLOW: "review-history.yml",
  GITHUB_REF: "main",
  GITHUB_TOKEN: "test-github-token",
};


function reviewRequest(apiKey = env.ADMIN_API_KEY) {
  return new Request("https://worker.example/review", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Origin: "https://znonymity.github.io",
    },
    body: JSON.stringify({
      candidate_id: "piastri-2024-07-21-test-event",
      decision: "approve",
      review: {
        title_zh: "Oscar Piastri 在匈牙利赢得首个 F1 大奖赛冠军",
        summary_zh: "Piastri 在匈牙利赢得个人首个 F1 大奖赛冠军。",
        inclusion_reason_zh: "这是 Piastri F1 生涯的首个大奖赛冠军。",
      },
    }),
  });
}


function analyticsViewRequest(body = { path: "/piasnews/", referrer_host: "github.com" }) {
  return new Request("https://worker.example/analytics/view", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://znonymity.github.io",
    },
    body: JSON.stringify(body),
  });
}


test("health endpoint is public for an allowed origin", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/health", {
      headers: { Origin: "https://znonymity.github.io" },
    }),
    env,
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
});


test("all endpoints reject an untrusted origin", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/health", { headers: { Origin: "https://example.com" } }),
    env,
  );
  assert.equal(response.status, 403);
});


test("analytics view records only anonymous page metadata", async () => {
  const database = createAnalyticsDb();
  const pending = [];
  const response = await worker.fetch(analyticsViewRequest(), { ...env, ANALYTICS_DB: database }, {
    waitUntil(promise) {
      pending.push(promise);
    },
  });
  await Promise.all(pending);

  assert.equal(response.status, 202);
  assert.equal(database.operations.length, 2);
  const insert = database.operations.find((operation) => operation.sql.startsWith("INSERT"));
  assert.equal(insert.values[2], "/piasnews/");
  assert.equal(insert.values[3], "github.com");
  assert.equal(insert.values.length, 4);
});


test("analytics view validates the public path", async () => {
  const response = await worker.fetch(analyticsViewRequest({ path: "https://example.com", referrer_host: null }), env);
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Invalid path/);
});


test("analytics view requires a browser origin", async () => {
  const request = analyticsViewRequest();
  request.headers.delete("Origin");
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 403);
});


test("analytics summary requires the admin key", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/analytics/summary?days=7", {
      headers: { Origin: "https://znonymity.github.io" },
    }),
    env,
  );
  assert.equal(response.status, 401);
});


test("analytics summary returns aggregate data without raw records", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/analytics/summary?days=30", {
      headers: {
        Authorization: `Bearer ${env.ADMIN_API_KEY}`,
        Origin: "https://znonymity.github.io",
      },
    }),
    { ...env, ANALYTICS_DB: createAnalyticsDb() },
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.days, 30);
  assert.equal(payload.metrics.today, 3);
  assert.equal(payload.metrics.period, 12);
  assert.equal(payload.metrics.change_percent, 50);
  assert.equal(payload.daily.length, 30);
  assert.deepEqual(payload.top_paths[0], { path: "/piasnews/", views: 12 });
  assert.equal("records" in payload, false);
});


test("analytics endpoints report a missing D1 binding", async () => {
  const response = await worker.fetch(analyticsViewRequest(), { ...env, ANALYTICS_DB: undefined });
  assert.equal(response.status, 503);
});


test("review endpoint rejects an invalid admin key", async () => {
  const response = await worker.fetch(reviewRequest("wrong-key"), env);
  assert.equal(response.status, 401);
});


test("approval requires reviewed Chinese content", async () => {
  const request = new Request("https://worker.example/review", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.ADMIN_API_KEY}`,
      "Content-Type": "application/json",
      Origin: "https://znonymity.github.io",
    },
    body: JSON.stringify({
      candidate_id: "piastri-2024-07-21-test-event",
      decision: "approve",
      review: {},
    }),
  });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /Chinese title/);
});


test("review endpoint dispatches the controlled workflow", async () => {
  const originalFetch = globalThis.fetch;
  let dispatchedBody;
  globalThis.fetch = async (_url, options) => {
    dispatchedBody = JSON.parse(options.body);
    return new Response(null, { status: 204 });
  };

  try {
    const response = await worker.fetch(reviewRequest(), env);
    assert.equal(response.status, 202);
    assert.equal(dispatchedBody.ref, "main");
    assert.equal(dispatchedBody.inputs.decision, "approve");
    assert.equal(dispatchedBody.inputs.candidate_id, "piastri-2024-07-21-test-event");
    assert.ok(dispatchedBody.inputs.review_payload_b64.length > 20);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
