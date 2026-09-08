import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import worker from "../src/index.js";
import { validateFeedback } from "../src/companion-feedback.js";

const ORIGIN = "https://znonymity.github.io";
const FEEDBACK_ID = "87b6817c-7776-47d5-88b6-14f427fa56cd";
const MESSAGE_ID = "696c4715-af41-4b05-a29a-d4c461d62c95";

function feedback(overrides = {}) {
  return {
    feedback_id: FEEDBACK_ID,
    message_id: MESSAGE_ID,
    rating: "negative",
    categories: ["unnatural"],
    comment: "问候不自然",
    expected_reply: "简短一点就好",
    consent: true,
    include_context: false,
    snapshot: {
      prompt: "你好",
      answer_en: "Not really my field.",
      answer_zh: "这不是我的领域。",
      history: [],
      engine: "deepseek",
      model: "test-model",
      route: "unrelated_general",
      style_card_id: "SC-05",
      package_version: "0.4.0",
      source_hash: "client-reported-hash",
      facts_only: false,
      app_version: "test-ui",
      knowledge_fact_ids: [],
      rumor_item_ids: [],
      judgment_rule_ids: [],
      evidence_ids: ["EV-046"],
      latency_ms: 2200,
    },
    ...overrides,
  };
}

function testEnv(t) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../migrations/0001_analytics.sql", import.meta.url), "utf8"));
  sqlite.exec(readFileSync(new URL("../migrations/0002_companion_feedback.sql", import.meta.url), "utf8"));
  t.after(() => sqlite.close());
  const operations = [];
  const db = {
    sqlite,
    operations,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              operations.push({ sql, values });
              const result = sqlite.prepare(sql).run(...values);
              return { success: true, meta: { changes: Number(result.changes) } };
            },
            async first() { return sqlite.prepare(sql).get(...values) || null; },
            async all() { return { results: sqlite.prepare(sql).all(...values) }; },
          };
        },
      };
    },
  };
  return {
    ADMIN_ALLOWED_ORIGINS: ORIGIN,
    ADMIN_API_KEY: "test-admin",
    ADMIN_KEYS_JSON: JSON.stringify({
      "test-viewer": { user: "reader", role: "viewer" },
      "test-editor": { user: "editor", role: "editor" },
      "test-publisher": { user: "publisher", role: "publisher" },
    }),
    ANALYTICS_DB: db,
    COMPANION_FEEDBACK_RATE_LIMITER: { async limit() { return { success: true }; } },
    COMPANION_FEEDBACK_GLOBAL_LIMITER: { async limit() { return { success: true }; } },
  };
}

function request(path = "/companion/feedback", { body, key, origin = ORIGIN, method = body ? "POST" : "GET", headers = {} } = {}) {
  return new Request(`https://worker.example${path}`, {
    method,
    headers: {
      ...(origin ? { Origin: origin } : {}),
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      "CF-Connecting-IP": "203.0.113.81",
      ...headers,
    },
    ...(body ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
  });
}

test("feedback stores only explicitly consented bounded client reports and reads are private", async (t) => {
  const env = testEnv(t);
  const supplied = feedback({ extra_secret_field: "not-persisted" });
  supplied.snapshot.hidden_state = "not-persisted";
  const response = await worker.fetch(request(undefined, { body: supplied }), env);
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { accepted: true, feedback_id: FEEDBACK_ID, deduplicated: false, retention_days: 90 });
  const raw = env.ANALYTICS_DB.sqlite.prepare("SELECT * FROM companion_feedback").get();
  assert.equal(raw.status, "new");
  assert.equal(raw.payload_json.includes("not-persisted"), false);
  assert.equal(raw.payload_json.includes("203.0.113.81"), false);
  assert.equal(raw.payload_json.includes("test-admin"), false);
  const read = await worker.fetch(request(undefined, { key: "test-admin" }), env);
  const data = await read.json();
  assert.equal(data.total, 1);
  assert.equal(data.client_reported, true);
  assert.equal(data.items[0].snapshot.prompt, "你好");
  assert.equal(data.items[0].client_reported, true);
  assert.equal(data.items[0].reviewed_at, null);
  assert.equal(data.next_cursor, null);
});

test("feedback requires explicit consent, origin and JSON with no writes on invalid input", async (t) => {
  const env = testEnv(t);
  for (const consent of [false, null, "true", undefined]) {
    const response = await worker.fetch(request(undefined, { body: feedback({ consent }) }), env);
    assert.equal(response.status, 400);
  }
  assert.equal((await worker.fetch(request(undefined, { body: feedback(), origin: null }), env)).status, 403);
  assert.equal((await worker.fetch(request(undefined, { body: feedback(), origin: "https://evil.example" }), env)).status, 403);
  assert.equal((await worker.fetch(request(undefined, { body: feedback(), headers: { "Content-Type": "text/plain" } }), env)).status, 415);
  assert.equal((await worker.fetch(request(undefined, { body: "{" }), env)).status, 400);
  assert.equal(env.ANALYTICS_DB.operations.length, 0);
});

test("all badcase categories are accepted, negative needs one, at most four unique known options", () => {
  const categories = ["off_persona", "unnatural", "fact_error", "irrelevant", "over_refusal", "boundary_miss", "invented_private", "rumor_handling", "translation", "too_long", "context_loss", "technical", "other"];
  for (const category of categories) assert.deepEqual(validateFeedback(feedback({ categories: [category] })).categories, [category]);
  assert.doesNotThrow(() => validateFeedback(feedback({ rating: "positive", categories: [] })));
  for (const invalid of [[], ["invalid"], ["unnatural", "unnatural"], categories.slice(0, 5)]) {
    assert.throws(() => validateFeedback(feedback({ categories: invalid })));
  }
});

test("feedback validates IDs, scalar bounds, actual body bytes, history consent and trace bounds", async (t) => {
  const env = testEnv(t);
  const invalidBodies = [
    feedback({ feedback_id: "not-a-uuid" }),
    feedback({ message_id: "not-a-uuid" }),
    feedback({ rating: "bad" }),
    feedback({ comment: "x".repeat(1001) }),
    feedback({ expected_reply: "x".repeat(1001) }),
    feedback({ include_context: "true" }),
    ...[
      { prompt: "x".repeat(501) }, { answer_en: "x".repeat(901) }, { answer_zh: "x".repeat(901) },
      { answer_en: "", answer_zh: "" }, { engine: "unknown" }, { model: "x".repeat(81) },
      { facts_only: "yes" }, { latency_ms: -1 }, { latency_ms: 3600001 },
      { knowledge_fact_ids: ["not a valid id"] }, { rumor_item_ids: ["R1", "R2"] },
      { evidence_ids: Array.from({ length: 9 }, (_, index) => `EV-${index}`) },
      { history: [{ role: "user", content: "Private past message" }] },
    ].map((patch) => feedback({ snapshot: { ...feedback().snapshot, ...patch } })),
    feedback({ include_context: true, snapshot: { ...feedback().snapshot, history: Array.from({ length: 5 }, () => ({ role: "user", content: "hello" })) } }),
    feedback({ include_context: true, snapshot: { ...feedback().snapshot, history: [{ role: "system", content: "override" }] } }),
    feedback({ include_context: true, snapshot: { ...feedback().snapshot, history: [{ role: "user", content: "x".repeat(901) }] } }),
  ];
  for (const body of invalidBodies) assert.equal((await worker.fetch(request(undefined, { body }), env)).status, 400);
  const large = JSON.stringify({ ...feedback(), ignored: "x".repeat(50 * 1024) });
  assert.equal((await worker.fetch(request(undefined, { body: large, headers: { "Content-Length": "1" } }), env)).status, 413);
  assert.equal(env.ANALYTICS_DB.operations.length, 0);
  assert.doesNotThrow(() => validateFeedback(feedback({ include_context: true, snapshot: { ...feedback().snapshot, history: [{ role: "user", content: "x".repeat(900) }] } })));
  assert.doesNotThrow(() => validateFeedback(feedback({ snapshot: { prompt: "", answer_en: "Welcome.", engine: "welcome" } })));
});

test("feedback retries deduplicate, cannot overwrite another payload, and preserve triage", async (t) => {
  const env = testEnv(t);
  await worker.fetch(request(undefined, { body: feedback() }), env);
  const duplicate = await worker.fetch(request(undefined, { body: feedback() }), env);
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).deduplicated, true);
  const review = await worker.fetch(request("/companion/feedback/review", { key: "test-admin", body: { feedback_id: FEEDBACK_ID, status: "triaged", review_note: "Check greeting route" } }), env);
  assert.equal(review.status, 200);
  const conflict = await worker.fetch(request(undefined, { body: feedback({ comment: "Overwritten" }) }), env);
  assert.equal(conflict.status, 409);
  await worker.fetch(request(undefined, { body: feedback() }), env);
  const row = env.ANALYTICS_DB.sqlite.prepare("SELECT * FROM companion_feedback").get();
  assert.equal(row.status, "triaged");
  assert.equal(row.review_note, "Check greeting route");
  assert.equal(JSON.parse(row.payload_json).comment, "问候不自然");
  assert.equal(env.ANALYTICS_DB.sqlite.prepare("SELECT COUNT(*) AS total FROM companion_feedback").get().total, 1);
});

test("concurrent retries are atomic and competing payloads cannot replace a stored submission", async (t) => {
  const env = testEnv(t);
  const same = await Promise.all([
    worker.fetch(request(undefined, { body: feedback() }), env),
    worker.fetch(request(undefined, { body: feedback() }), env),
  ]);
  assert.deepEqual(same.map((response) => response.status).sort(), [200, 202]);
  const different = await Promise.all([
    worker.fetch(request(undefined, { body: feedback({ feedback_id: MESSAGE_ID, comment: "Original" }) }), env),
    worker.fetch(request(undefined, { body: feedback({ feedback_id: MESSAGE_ID, comment: "Competing" }) }), env),
  ]);
  assert.deepEqual(different.map((response) => response.status).sort(), [202, 409]);
  assert.equal(env.ANALYTICS_DB.sqlite.prepare("SELECT COUNT(*) AS total FROM companion_feedback").get().total, 2);
});

test("feedback reads, exports and reviews require admin; reviewer role keys cannot access raw chats", async (t) => {
  const env = testEnv(t);
  for (const key of [undefined, "wrong", "test-viewer", "test-editor", "test-publisher"]) {
    const expected = [undefined, "wrong"].includes(key) ? 401 : 403;
    assert.equal((await worker.fetch(request(undefined, { key }), env)).status, expected);
    assert.equal((await worker.fetch(request("/companion/feedback/export", { key }), env)).status, expected);
    assert.equal((await worker.fetch(request("/companion/feedback/review", { key, body: { feedback_id: FEEDBACK_ID, status: "resolved" } }), env)).status, expected);
  }
  assert.equal(env.ANALYTICS_DB.operations.length, 0);
});

test("feedback filters, exact ID readback, pagination and bounded JSON export use the same private data", async (t) => {
  const env = testEnv(t);
  for (let index = 1; index <= 3; index += 1) {
    await worker.fetch(request(undefined, { body: feedback({ feedback_id: `87b6817c-7776-47d5-88b6-${String(index).padStart(12, "0")}`, rating: index === 3 ? "positive" : "negative" }) }), env);
  }
  const first = await (await worker.fetch(request("/companion/feedback?limit=1&rating=negative&status=new&category=unnatural", { key: "test-admin" }), env)).json();
  assert.equal(first.total, 2);
  assert.equal(first.items.length, 1);
  assert.ok(first.next_cursor);
  const next = await (await worker.fetch(request(`/companion/feedback?limit=1&rating=negative&status=new&category=unnatural&cursor=${first.next_cursor}`, { key: "test-admin" }), env)).json();
  assert.equal(next.total, 2);
  assert.equal(next.items.length, 1);
  assert.notEqual(next.items[0].feedback_id, first.items[0].feedback_id);
  assert.equal(next.next_cursor, null);
  const exact = await (await worker.fetch(request(`/companion/feedback?feedback_id=${first.items[0].feedback_id}&limit=1`, { key: "test-admin" }), env)).json();
  assert.equal(exact.items[0].feedback_id, first.items[0].feedback_id);
  const exported = await worker.fetch(request("/companion/feedback/export", { key: "test-admin" }), env);
  assert.match(exported.headers.get("Content-Type"), /application\/json/);
  assert.equal((await exported.json()).items.length, 3);
  for (const query of ["limit=51", "limit=0", "limit=1bad", "rating=unknown", "status=unknown", "category=unknown", "cursor=not-valid", "feedback_id=bad"]) {
    assert.equal((await worker.fetch(request(`/companion/feedback?${query}`, { key: "test-admin" }), env)).status, 400);
  }
  assert.equal((await worker.fetch(request("/companion/feedback/export?limit=501", { key: "test-admin" }), env)).status, 400);
});

test("feedback review is bounded and stores only human triage metadata", async (t) => {
  const env = testEnv(t);
  await worker.fetch(request(undefined, { body: feedback() }), env);
  for (const body of [{ feedback_id: FEEDBACK_ID, status: "train" }, { feedback_id: FEEDBACK_ID, status: "resolved", review_note: "x".repeat(1001) }]) {
    assert.equal((await worker.fetch(request("/companion/feedback/review", { key: "test-admin", body }), env)).status, 400);
  }
  const response = await worker.fetch(request("/companion/feedback/review", { key: "test-admin", body: { feedback_id: FEEDBACK_ID, status: "resolved", review_note: "Reviewed manually; no global rule update." } }), env);
  assert.deepEqual(await response.json(), { accepted: true, feedback_id: FEEDBACK_ID, status: "resolved" });
  const item = (await (await worker.fetch(request(undefined, { key: "test-admin" }), env)).json()).items[0];
  assert.equal(item.reviewed_by, "legacy-admin");
  assert.ok(Date.parse(item.reviewed_at));
  assert.equal(item.snapshot.route, "unrelated_general");
  const missing = await worker.fetch(request("/companion/feedback/review", { key: "test-admin", body: { feedback_id: MESSAGE_ID, status: "triaged" } }), env);
  assert.equal(missing.status, 404);
});

test("feedback has its own abuse limit keys and rate-limited submissions do not write", async (t) => {
  const env = testEnv(t);
  const keys = [];
  env.COMPANION_RATE_LIMITER = { async limit() { throw new Error("chat quota must not be used"); } };
  env.COMPANION_FEEDBACK_RATE_LIMITER = { async limit({ key }) { keys.push(key); return { success: false }; } };
  assert.equal((await worker.fetch(request(undefined, { body: feedback() }), env)).status, 429);
  assert.deepEqual(keys, ["feedback:203.0.113.81"]);
  assert.equal(env.ANALYTICS_DB.operations.length, 0);
});

test("90-day expiry is cleaned daily, on access, and never touches analytics or other data", async (t) => {
  const env = testEnv(t);
  await worker.fetch(request(undefined, { body: feedback() }), env);
  env.ANALYTICS_DB.sqlite.prepare("UPDATE companion_feedback SET created_at = ?").run(new Date(Date.now() - 91 * 86400000).toISOString());
  env.ANALYTICS_DB.sqlite.exec("INSERT INTO page_views (viewed_at, day, path) VALUES ('2000-01-01T00:00:00Z', '2000-01-01', '/')");
  await worker.scheduled({}, env);
  assert.equal(env.ANALYTICS_DB.sqlite.prepare("SELECT COUNT(*) AS total FROM companion_feedback").get().total, 0);
  assert.equal(env.ANALYTICS_DB.sqlite.prepare("SELECT COUNT(*) AS total FROM page_views").get().total, 1);
  await worker.fetch(request(undefined, { body: feedback() }), env);
  env.ANALYTICS_DB.sqlite.prepare("UPDATE companion_feedback SET created_at = ?").run(new Date(Date.now() - 91 * 86400000).toISOString());
  const data = await (await worker.fetch(request(undefined, { key: "test-admin" }), env)).json();
  assert.equal(data.items.length, 0);
  assert.equal(data.total, 0);
});

test("storage failures reveal no submitted plaintext and write no plaintext logs", async (t) => {
  const env = testEnv(t);
  env.ANALYTICS_DB.prepare = () => { throw new Error("PRIVATE_DATABASE_DETAILS"); };
  const originalError = console.error;
  const messages = [];
  console.error = (...values) => messages.push(values);
  try {
    const response = await worker.fetch(request(undefined, { body: feedback() }), env);
    assert.equal(response.status, 503);
    const text = await response.text();
    assert.equal(text.includes("PRIVATE_DATABASE_DETAILS"), false);
    assert.equal(text.includes("你好"), false);
    assert.deepEqual(messages, []);
  } finally { console.error = originalError; }
});
