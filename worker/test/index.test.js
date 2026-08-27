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
  ADMIN_KEYS_JSON: JSON.stringify({
    "viewer-key": { user: "viewer@example.com", role: "viewer" },
    "editor-key": { user: "editor@example.com", role: "editor" },
    "publisher-key": { user: "publisher@example.com", role: "publisher" },
  }),
  ANALYTICS_DB: createAnalyticsDb(),
  GITHUB_OWNER: "ZnonYmitY",
  GITHUB_REPOSITORY: "piasnews",
  GITHUB_WORKFLOW: "review-history.yml",
  GITHUB_REF: "main",
  GITHUB_TOKEN: "test-github-token",
};


function hotChangeRequest(apiKey, status = "draft", changeOverrides = {}, requestOverrides = {}) {
  return new Request("https://worker.example/hot-events/change", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Origin: "https://znonymity.github.io",
    },
    body: JSON.stringify({
      event_id: "evt-test-hot-event",
      status,
      expected_updated_at: null,
      ...requestOverrides,
      change: {
        hot_word_zh: "Oscar 分享测试花絮",
        hot_word_en: "Oscar shares a test clip",
        source_labels: ["粉"],
        heat: 72,
        reason: "修正热点词",
        ...changeOverrides,
      },
    }),
  });
}


function hotEventFetchMock(overrides = { changes: [] }, onDispatch = () => {}) {
  return async (url, options = {}) => {
    if (String(url).includes("/contents/data/hot-event-overrides.json")) {
      return new Response(JSON.stringify(overrides), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    onDispatch(JSON.parse(options.body));
    return new Response(null, { status: 204 });
  };
}


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


test("session endpoint returns role permissions without exposing the key", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/session", {
      headers: { Authorization: "Bearer editor-key", Origin: "https://znonymity.github.io" },
    }),
    env,
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.user, "editor@example.com");
  assert.equal(payload.role, "editor");
  assert.equal(payload.permissions.edit, true);
  assert.equal(payload.permissions.publish, false);
  assert.equal(JSON.stringify(payload).includes("editor-key"), false);
});


test("editor may save a hot-event draft but may not activate it", async () => {
  const originalFetch = globalThis.fetch;
  let dispatchedBody;
  globalThis.fetch = hotEventFetchMock({ changes: [] }, (body) => { dispatchedBody = body; });
  try {
    const draftResponse = await worker.fetch(hotChangeRequest("editor-key", "draft"), env);
    assert.equal(draftResponse.status, 202);
    assert.equal(dispatchedBody.inputs.override_status, "draft");
    assert.equal(dispatchedBody.inputs.reviewer, "editor@example.com");
    assert.equal(dispatchedBody.inputs.expected_updated_at, "__none__");

    const activeResponse = await worker.fetch(hotChangeRequest("editor-key", "active"), env);
    assert.equal(activeResponse.status, 403);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("publisher may activate a hot-event override", async () => {
  const originalFetch = globalThis.fetch;
  let dispatchedBody;
  globalThis.fetch = hotEventFetchMock({ changes: [] }, (body) => { dispatchedBody = body; });
  try {
    const response = await worker.fetch(hotChangeRequest("publisher-key", "active"), env);
    assert.equal(response.status, 202);
    assert.equal(dispatchedBody.inputs.override_status, "active");
    assert.equal(dispatchedBody.inputs.reviewer, "publisher@example.com");
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("hot-event overrides accept per-content media and reject insecure URLs", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = hotEventFetchMock();
  const contentItems = [{
    item_id: "content-1",
    source_type: "fan",
    source: "X",
    title_zh: "Oscar 分享花絮视频",
    url: "https://x.com/example/status/1",
    image_url: "https://images.example/poster.jpg",
    video_url: "https://video.example/clip.mp4",
    video_poster_url: "https://images.example/video-poster.jpg",
  }];
  try {
    const validResponse = await worker.fetch(
      hotChangeRequest("publisher-key", "active", { content_items: contentItems }),
      env,
    );
    assert.equal(validResponse.status, 202);

    const invalidResponse = await worker.fetch(
      hotChangeRequest("publisher-key", "active", {
        content_items: [{ ...contentItems[0], url: "http://insecure.example/post" }],
      }),
      env,
    );
    assert.equal(invalidResponse.status, 400);
    assert.match((await invalidResponse.json()).error, /HTTPS/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("stale hot-event edits are rejected before workflow dispatch", async () => {
  const originalFetch = globalThis.fetch;
  let dispatchCount = 0;
  globalThis.fetch = hotEventFetchMock({
    changes: [{
      event_id: "evt-test-hot-event",
      status: "active",
      updated_at: "2026-08-27T08:00:00Z",
    }],
  }, () => { dispatchCount += 1; });
  try {
    const response = await worker.fetch(
      hotChangeRequest("publisher-key", "active", {}, { expected_updated_at: "2026-08-27T07:00:00Z" }),
      env,
    );
    assert.equal(response.status, 409);
    assert.equal(dispatchCount, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
