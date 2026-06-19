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
        scores: {
          historical_value: 95,
          peak_attention: 90,
          lasting_significance: 92,
          career_impact: 96,
          fan_recognition: 94,
        },
        strong_keys: ["first_grand_prix_win"],
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
