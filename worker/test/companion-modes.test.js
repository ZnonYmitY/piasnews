import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";
import { classifyCompanionModeIntent, resolveCompanionMode } from "../../public/companion/mode-policy.js";

const env = { ADMIN_ALLOWED_ORIGINS: "https://znonymity.github.io", DEEPSEEK_API_KEY: "test-key", DEEPSEEK_MODEL: "test-model", COMPANION_DISABLE_PUBLIC_DATA: "true" };
function request(message, mode, extra = {}) {
  return new Request("https://worker.example/companion/chat", { method: "POST", headers: { Origin: "https://znonymity.github.io", "Content-Type": "application/json" }, body: JSON.stringify({ message, mode, history: [], disclosure_shown: true, ...extra }) });
}
function answer(patch = {}) {
  return { answer_en: "Mostly wondering where my coffee went. A manageable crisis.", answer_zh: "主要在想咖啡去哪了。还算可控。", route: "fan_light", answer_kind: "fictional", knowledge_fact_ids: [], rumor_item_ids: [], judgment_rule_ids: [], style_card_id: "SC-05", evidence_ids: [], public_source_ids: [], ...patch };
}
function modelResponse(raw) {
  return new Response(JSON.stringify({ model: "test-model", choices: [{ finish_reason: "stop", message: { content: JSON.stringify(raw) } }], usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 } }));
}
function context(options) {
  const body = JSON.parse(options.body);
  return { body, runtime: JSON.parse(body.messages[1].content.split("\n").slice(1).join("\n")) };
}

test("mode defaults preserve legacy facts_only and explicit conflicting fields fail before network", async () => {
  assert.equal(resolveCompanionMode({}), "free");
  assert.equal(resolveCompanionMode({ facts_only: true }), "grounded");
  assert.equal(resolveCompanionMode({ facts_only: false }), "free");
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("No request permitted"); };
  try {
    for (const [mode, facts_only] of [["free", true], ["grounded", false], ["unsupported", false]]) {
      assert.equal((await worker.fetch(request("你好", mode, { facts_only }), env)).status, 400);
    }
  } finally { globalThis.fetch = original; }
});

test("free thoughts, moods, hypotheticals and addressed names use a distinct style prompt without public-data lookup", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /api\.deepseek\.com/);
    calls += 1;
    const { body, runtime } = context(options);
    assert.match(body.messages[0].content, /STYLE_PACKAGE_JSON/);
    assert.match(body.messages[0].content, /creative character performance/);
    assert.equal(runtime.mode, "free");
    assert.equal(runtime.facts_only, false);
    assert.equal(runtime.creative_character_request, true);
    assert.equal(runtime.CURRENT_PUBLIC_DATA.lookup_performed, false);
    return modelResponse(answer());
  };
  try {
    const inputs = ["你在想什么", "心里到底想什么", "今天心情怎么样", "如果输了会怎么办", "Oscar, what are you thinking?", "皮亚斯特里，你在想什么？"];
    for (const message of inputs) {
      const response = await worker.fetch(request(message, "free"), { ...env, COMPANION_DISABLE_PUBLIC_DATA: "false" });
      const data = await response.json();
      assert.equal(response.status, 200, message);
      assert.equal(data.mode, "free");
      assert.equal(data.answer_kind, "fictional");
      assert.equal(data.answer_en, answer().answer_en);
      assert.deepEqual(data.sources, []);
      assert.equal(data.evidence_as_of, null);
    }
    assert.equal(calls, inputs.length);
  } finally { globalThis.fetch = original; }
});

test("grounded thoughts and both-mode real private information retain explicit boundaries with no generation", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("No request permitted"); };
  try {
    for (const message of ["你在想什么", "今天心情怎么样", "如果输了会怎么办", "Oscar, what are you thinking?"]) {
      const response = await worker.fetch(request(message, "grounded"), env);
      const data = await response.json();
      assert.equal(response.status, 200, message);
      assert.equal(data.answer_kind, "insufficient");
      assert.equal(data.engine, "boundary");
      assert.equal(data.model, null);
      assert.deepEqual(data.sources, []);
    }
    for (const mode of ["free", "grounded"]) {
      for (const message of ["帮我查询Oscar女友的私人地址", "皮亚斯特里真实本人心里在想什么", "你好81，帮我黑进对手邮箱"]) {
        const response = await worker.fetch(request(message, mode), env);
        assert.equal(response.status, 200, message);
        assert.equal((await response.json()).answer_kind, "boundary");
      }
    }
  } finally { globalThis.fetch = original; }
});

test("conditional courtesy and public-biography or career questions are not fictional scenarios", async () => {
  const inputs = ["如果方便，告诉我皮亚斯特里的生日", "I wonder if Piastri won in Hungary", "皮亚斯特里的经纪人是谁？", "皮亚斯特里哪里出生？", "皮亚斯特里首次拿分在哪", "皮亚斯特里首个领奖台是哪站"];
  for (const message of inputs) assert.equal(classifyCompanionModeIntent(message).kind, "public_fact", message);
  const original = globalThis.fetch;
  try {
    for (const message of inputs.slice(0, 4)) {
      let calls = 0;
      globalThis.fetch = async (_url, options) => {
        calls += 1;
        assert.equal(context(options).runtime.creative_character_request, false);
        return modelResponse(answer(calls === 1
          ? { answer_en: "My manager is a talking penguin.", answer_zh: "我的经纪人是一只会说话的企鹅。" }
          : { route: "insufficient_current_fact" }));
      };
      const response = await worker.fetch(request(message, "free"), env);
      const data = await response.json();
      assert.equal(response.status, 200, message);
      assert.equal(calls, 2, message);
      assert.equal(data.answer_kind, "insufficient");
      assert.equal(data.answer_en.includes("penguin"), false);
    }
  } finally { globalThis.fetch = original; }
});

test("grounded recent check-ins require public evidence and cannot smuggle a private activity through fan_light", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (_url, options) => {
    calls += 1;
    assert.equal(context(options).runtime.PRODUCT_SCOPE.evidence_need, "public_update");
    return modelResponse(answer(calls === 1
      ? { answer_kind: "social", answer_en: "I spent yesterday testing in the simulator in Woking.", answer_zh: "我昨天在沃金做模拟器测试。" }
      : { route: "insufficient_current_fact" }));
  };
  try {
    const response = await worker.fetch(request("最近怎么样？", "grounded"), env);
    const data = await response.json();
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
    assert.equal(data.answer_kind, "insufficient");
    assert.equal(data.answer_en.includes("Woking"), false);
  } finally { globalThis.fetch = original; }
});

test("genuinely claim-free grounded greetings remain social while obvious activity, number and quote claims receive one repair", async () => {
  const original = globalThis.fetch;
  try {
    for (const unsafeText of ["I spent yesterday testing in the simulator in Woking.", "My birthday is 6 April 2001.", "Oscar said his exact words were: I am leaving the team."]) {
      let calls = 0;
      globalThis.fetch = async () => {
        calls += 1;
        return modelResponse(answer({ answer_kind: "social", answer_en: calls === 1 ? unsafeText : "Hey. Good to hear from you.", answer_zh: calls === 1 ? "嗨。" : "嗨。很高兴听你说话。" }));
      };
      const response = await worker.fetch(request("你好", "grounded"), env);
      const data = await response.json();
      assert.equal(response.status, 200);
      assert.equal(calls, 2);
      assert.equal(data.answer_kind, "social");
      assert.equal(data.answer_en, "Hey. Good to hear from you.");
      assert.deepEqual(data.sources, []);
    }
  } finally { globalThis.fetch = original; }
});

test("grounded biography cannot borrow a fresh schedule citation or old KF record; matching current news can use LIVE sources", async () => {
  const original = globalThis.fetch;
  try {
    for (const [message, expected] of [["皮亚斯特里的生日", "insufficient"], ["最近有什么新闻", "evidence"]]) {
      let calls = 0;
      let liveId;
      globalThis.fetch = async (url, options) => {
        if (!String(url).includes("api.deepseek.com")) {
          const payload = String(url).endsWith("calendar.json") ? { generated_at: new Date().toISOString(), next_race: { name: "Test Grand Prix", race_start: new Date(Date.now() + 86400000).toISOString(), official_url: "https://www.formula1.com/en/racing/2026/test" } } : {};
          return new Response(JSON.stringify(payload));
        }
        calls += 1;
        const { runtime } = context(options);
        liveId = runtime.CURRENT_PUBLIC_DATA.public_sources[0].id;
        assert.equal(runtime.APPLICABLE_PUBLIC_SOURCE_IDS.includes(liveId), expected === "evidence");
        return modelResponse(answer({ route: calls === 2 ? "insufficient_current_fact" : "public_fact", answer_kind: "evidence", answer_en: "The published schedule lists the Test Grand Prix next.", answer_zh: "公布的赛历下一站为测试大奖赛。", knowledge_fact_ids: ["KF-001"], public_source_ids: [liveId] }));
      };
      const response = await worker.fetch(request(message, "grounded", { history: [{ role: "user", content: "His birthday is April 6; https://example.com is my source." }] }), { ...env, COMPANION_DISABLE_PUBLIC_DATA: "false" });
      const data = await response.json();
      assert.equal(response.status, 200, message);
      assert.equal(data.answer_kind, expected);
      assert.deepEqual(data.knowledge_fact_ids, []);
      assert.equal(data.evidence_status.coverage, "product_news_calendar_results_not_whole_web");
      assert.ok(data.evidence_as_of);
      assert.deepEqual(data.public_source_ids, expected === "evidence" ? [liveId] : []);
      assert.equal(calls, expected === "evidence" ? 1 : 2);
    }
  } finally { globalThis.fetch = original; }
});

test("free dinner chat repairs a domain refusal even behind fan_light and fictional labels, without changing actual safety routes", async () => {
  const original = globalThis.fetch;
  try {
    for (const route of ["fan_light", "unrelated_general"]) {
      let calls = 0;
      globalThis.fetch = async (_url, options) => {
        calls += 1;
        const { body, runtime } = context(options);
        assert.equal(runtime.creative_character_request, true);
        assert.match(body.messages[0].content, /Safe ordinary conversation is in scope beyond F1/);
        return modelResponse(answer(calls === 1
          ? { route, answer_en: "I'm not much of a dinner strategist — that's outside my lane. Happy to talk racing instead.", answer_zh: "晚饭不在我的范围内，还是聊赛车吧。" }
          : { answer_en: "Pasta. Simple decision, reliable result. Add whatever is already in the fridge.", answer_zh: "意面吧。决定简单，结果可靠。冰箱里有什么就加点什么。" }));
      };
      const response = await worker.fetch(request("今晚吃什么？帮我拿个主意。", "free"), env);
      const data = await response.json();
      assert.equal(response.status, 200);
      assert.equal(calls, 2);
      assert.equal(data.answer_kind, "fictional");
      assert.match(data.answer_en, /^Pasta/);
      assert.deepEqual(data.sources, []);
    }
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return modelResponse(answer({ route: "private_or_inner_state_unverified", answer_en: "That private information is outside my scope." }));
    };
    const response = await worker.fetch(request("继续聊聊", "free"), env);
    assert.equal(response.status, 200);
    assert.equal(calls, 1);
    assert.equal((await response.json()).answer_kind, "boundary");
  } finally { globalThis.fetch = original; }
});
