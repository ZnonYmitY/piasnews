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
              if (sql.includes("referrer_host IS NULL")) return { total: 7 };
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
  ADMIN_ADDITIONAL_KEYS_JSON: JSON.stringify({
    "coala-key": { user: "coala", email: "janniezhenqi@163.com", role: "admin" },
  }),
  ANALYTICS_DB: createAnalyticsDb(),
  GITHUB_OWNER: "ZnonYmitY",
  GITHUB_REPOSITORY: "piasnews",
  GITHUB_WORKFLOW: "review-history.yml",
  GITHUB_REF: "main",
  GITHUB_TOKEN: "test-github-token",
  DEEPSEEK_API_KEY: "test-deepseek-key",
  DEEPSEEK_BASE_URL: "https://api.deepseek.com",
  DEEPSEEK_MODEL: "deepseek-v4-flash",
  COMPANION_ALLOW_CANDIDATE_MODE: "true",
  COMPANION_DISABLE_PUBLIC_DATA: "true",
};


function companionRequest(message = "你好", overrides = {}) {
  return new Request("https://worker.example/companion/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://znonymity.github.io",
      "CF-Connecting-IP": "203.0.113.81",
    },
    body: JSON.stringify({
      message,
      history: [],
      facts_only: false,
      candidate_mode: true,
      disclosure_shown: true,
      ...overrides,
    }),
  });
}


function deepseekFetchMock(modelResult, { status = 200 } = {}) {
  return async (url, options = {}) => {
    assert.equal(String(url), "https://api.deepseek.com/chat/completions");
    const request = JSON.parse(options.body);
    assert.equal(options.headers.Authorization, "Bearer test-deepseek-key");
    assert.equal(request.model, "deepseek-v4-flash");
    assert.deepEqual(request.response_format, { type: "json_object" });
    assert.match(request.messages[0].content, /piastri-fan-companion Skill v0\.4\.0/);
    if (status !== 200) return new Response("upstream error", { status });
    return new Response(JSON.stringify({
      model: "deepseek-v4-flash",
      choices: [{ message: { content: JSON.stringify(modelResult) } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
}


function modelResult(overrides = {}) {
  return {
    answer_en: "Hey. Good to see you.",
    answer_zh: "嗨。很高兴见到你。",
    route: "fan_light",
    knowledge_fact_ids: [],
    rumor_item_ids: [],
    judgment_rule_ids: [],
    style_card_id: "SC-05",
    fallback_id: null,
    evidence_ids: ["EV-046"],
    notes: "Simple greeting with no factual claim.",
    ...overrides,
  };
}


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


function currentAnalyticsDay() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}


function shiftAnalyticsDay(value, amount) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + amount)).toISOString().slice(0, 10);
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


test("companion status reports the DeepSeek-backed distilled package", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/companion/status", {
      headers: { Origin: "https://znonymity.github.io" },
    }),
    env,
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.online, true);
  assert.equal(payload.provider, "deepseek");
  assert.equal(payload.model, "deepseek-v4-flash");
  assert.equal(payload.package_version, "0.4.0");
  assert.equal(payload.candidate_mode, true);
  assert.match(payload.source_hash, /^[a-f0-9]{16}$/);
});


test("companion sends the distilled Skill to DeepSeek and returns a trace", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = deepseekFetchMock(modelResult());
  try {
    const response = await worker.fetch(companionRequest(), env);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.engine, "deepseek");
    assert.equal(payload.answer_zh, "嗨。很高兴见到你。");
    assert.equal(payload.route, "fan_light");
    assert.equal(payload.style_card_id, "SC-05");
    assert.equal(payload.sources[0].id, "EV-046");
    assert.equal(payload.usage.total_tokens, 120);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("companion hard-stops an unrelated answer even if the model tries to answer", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = deepseekFetchMock(modelResult({
    answer_en: "Here is Python code.",
    answer_zh: "这是 Python 代码。",
    route: "unrelated_general",
    style_card_id: "SC-05",
  }));
  try {
    const response = await worker.fetch(companionRequest("帮我写 Python 爬虫"), env);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.answer_en, "Not really my field.");
    assert.equal(payload.answer_zh, "这不是我的领域。");
    assert.equal(payload.fallback_id, "FB-01");
    assert.equal(payload.style_card_id, "SC-06");
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("companion replaces rumor prose with the reviewed rumor-ledger response", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = deepseekFetchMock(modelResult({
    answer_en: "The model improvised this.",
    answer_zh: "模型临场发挥。",
    route: "rumor_check",
    rumor_item_ids: ["RM-001"],
    judgment_rule_ids: ["JR-01"],
    evidence_ids: [],
  }));
  try {
    const response = await worker.fetch(companionRequest("他是不是背弃了 Alpine 合同？"), env);
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.match(payload.answer_en, /^Verdict: false as stated\./);
    assert.match(payload.answer_zh, /^结论：这句话不准确。/);
    assert.deepEqual(payload.judgment_rule_ids, []);
    assert.equal(payload.sources.some((source) => source.id === "KS-010"), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("companion accepts candidate judgment rules only when server mode is enabled", async () => {
  const originalFetch = globalThis.fetch;
  const result = modelResult({
    route: "f1_grounded",
    judgment_rule_ids: ["JR-01"],
    style_card_id: "SC-01",
  });
  try {
    globalThis.fetch = deepseekFetchMock(result);
    const enabledResponse = await worker.fetch(companionRequest("怎么看这场轮胎策略？"), env);
    assert.deepEqual((await enabledResponse.json()).judgment_rule_ids, ["JR-01"]);

    globalThis.fetch = deepseekFetchMock(result);
    const disabledResponse = await worker.fetch(
      companionRequest("怎么看这场轮胎策略？"),
      { ...env, COMPANION_ALLOW_CANDIDATE_MODE: "false" },
    );
    assert.deepEqual((await disabledResponse.json()).judgment_rule_ids, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("companion validates disclosure, model configuration, and rate limits", async () => {
  const missingDisclosure = await worker.fetch(companionRequest("你好", { disclosure_shown: false }), env);
  assert.equal(missingDisclosure.status, 400);

  const missingModel = await worker.fetch(companionRequest(), { ...env, DEEPSEEK_API_KEY: "" });
  assert.equal(missingModel.status, 503);

  const limited = await worker.fetch(companionRequest(), {
    ...env,
    COMPANION_RATE_LIMITER: { async limit() { return { success: false }; } },
  });
  assert.equal(limited.status, 429);
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


test("additional admin keys preserve identity metadata and full permissions", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/session", {
      headers: { Authorization: "Bearer coala-key", Origin: "https://znonymity.github.io" },
    }),
    env,
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.user, "coala");
  assert.equal(payload.email, "janniezhenqi@163.com");
  assert.equal(payload.role, "admin");
  assert.deepEqual(payload.permissions, { view: true, edit: true, publish: true, administer: true });
  assert.equal(JSON.stringify(payload).includes("coala-key"), false);
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
  assert.equal(payload.metrics.active_days, 1);
  assert.equal(payload.metrics.peak_views, 3);
  assert.equal(payload.metrics.direct_percent, 58.3);
  assert.equal(payload.daily.length, 30);
  assert.deepEqual(payload.top_paths[0], { path: "/piasnews/", views: 12 });
  assert.equal("records" in payload, false);
});


test("analytics summary supports historical 7-day windows inside retention", async () => {
  const end = shiftAnalyticsDay(currentAnalyticsDay(), -11);
  const response = await worker.fetch(
    new Request(`https://worker.example/analytics/summary?days=7&end=${end}`, {
      headers: {
        Authorization: `Bearer ${env.ADMIN_API_KEY}`,
        Origin: "https://znonymity.github.io",
      },
    }),
    { ...env, ANALYTICS_DB: createAnalyticsDb() },
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.days, 7);
  assert.deepEqual(payload.range, { start: shiftAnalyticsDay(end, -6), end });
  assert.equal(payload.comparison.available, true);
});


test("analytics summary keeps 90-day windows inside retention", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/analytics/summary?days=90&end=2026-02-99", {
      headers: {
        Authorization: `Bearer ${env.ADMIN_API_KEY}`,
        Origin: "https://znonymity.github.io",
      },
    }),
    { ...env, ANALYTICS_DB: createAnalyticsDb() },
  );
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.days, 90);
  assert.equal(payload.daily.length, 90);
  assert.deepEqual(payload.range, { start: payload.retention.start, end: payload.retention.end });
  assert.equal(payload.comparison.available, false);
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
