import assert from "node:assert/strict";
import test from "node:test";

import worker from "../src/index.js";


const env = {
  ADMIN_ALLOWED_ORIGINS: "https://znonymity.github.io",
  ADMIN_API_KEY: "test-admin-key",
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
        scores: { historical_value: 100 },
      },
    }),
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
      review: { scores: { historical_value: 100 } },
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
