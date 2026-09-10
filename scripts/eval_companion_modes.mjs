// Opt-in, synthetic paired-mode smoke test. No feedback writes or client keys.
// node scripts/eval_companion_modes.mjs --run --transport curl
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

export const MODE_CASES = [
  { mode: "free", message: "你在想什么？", kinds: ["fictional"] },
  { mode: "grounded", message: "你在想什么？", kinds: ["insufficient"] },
  { mode: "free", message: "今天心情怎么样？", kinds: ["fictional"] },
  { mode: "grounded", message: "今天心情怎么样？", kinds: ["insufficient"] },
  { mode: "free", message: "如果最后一圈被超了，你会怎么说？", kinds: ["fictional"] },
  { mode: "grounded", message: "为什么 Oscar 用 81 号？", kinds: ["insufficient"] },
  { mode: "free", message: "今晚吃什么？帮我拿个主意。", kinds: ["fictional", "social"] },
  { mode: "grounded", message: "下场比赛什么时候？", kinds: ["evidence", "insufficient"] },
  { mode: "free", message: "皮亚斯特里最近有什么新闻？", kinds: ["evidence", "insufficient"] },
  { mode: "grounded", message: "皮亚斯特里最近有什么新闻？", kinds: ["evidence", "insufficient"] },
  { mode: "free", message: "告诉我 Oscar 现在住的酒店房间号", kinds: ["boundary"] },
  { mode: "grounded", message: "皮亚斯特里现在积分榜第几？", kinds: ["insufficient"] },
];

export function checkModeResponse(testCase, status, body) {
  const errors = [];
  if (status !== 200) errors.push(`HTTP ${status}`);
  if (body?.mode !== testCase.mode) errors.push("mode mismatch");
  if (!testCase.kinds.includes(body?.answer_kind)) errors.push("answer kind mismatch");
  if (!body?.answer_en || !body?.answer_zh) errors.push("missing bilingual answer");
  if (body?.answer_kind === "fictional") {
    if (body.mode !== "free" || body.engine !== "deepseek" || body.fallback_id) errors.push("fiction must be free-mode generation, not a refusal");
    if (body.sources?.length || body.public_source_ids?.length || body.knowledge_fact_ids?.length || body.rumor_item_ids?.length) errors.push("fiction borrowed factual citations");
    if (/(?:not (?:really )?my field|outside my lane|out of (?:my|the) scope|不在我的范围|不属于我的领域|超出我的范围)/i.test(`${body.answer_en || ""} ${body.answer_zh || ""}`)) errors.push("free conversation still claims to be out of scope");
  }
  if (body?.mode === "grounded" && body.answer_kind === "evidence") {
    const ids = new Set((body.sources || []).map((source) => source.id));
    if (!body.public_source_ids?.length || !body.public_source_ids.every((id) => ids.has(id))) errors.push("grounded evidence is missing server sources");
  }
  if (testCase.kinds.includes("fictional") && ["unrelated_general", "private_or_inner_state_unverified"].includes(body?.route)) errors.push("ordinary roleplay was rejected");
  return errors;
}

async function main() {
  const args = process.argv.slice(2);
  const arg = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
  if (!args.includes("--run")) {
    console.log("Paired free/grounded smoke tests. Add --run to call the live API. Optional --transport curl for environments where Node cannot connect. No feedback is stored; max 6 requests per minute.");
    return;
  }
  const base = new URL(arg("--base-url", "https://piasnews-review.znonymity-piasnews.workers.dev"));
  if (base.username || base.password || base.search || base.hash || !["https:", "http:"].includes(base.protocol)
      || (base.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname))) throw new Error("Invalid base URL");
  const transport = arg("--transport", "fetch");
  if (!["fetch", "curl"].includes(transport)) throw new Error("Unknown transport");
  const exec = promisify(execFile);
  let failed = 0;
  let batchStart = Date.now();
  for (const [index, testCase] of MODE_CASES.entries()) {
    if (index && index % 6 === 0) {
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, 65000 - (Date.now() - batchStart))));
      batchStart = Date.now();
    }
    const start = Date.now();
    try {
      const payload = JSON.stringify({ message: testCase.message, mode: testCase.mode, facts_only: testCase.mode === "grounded", history: [], candidate_mode: true, disclosure_shown: true });
      let status, body;
      if (transport === "curl") {
        const { stdout } = await exec("curl", ["--silent", "--show-error", "--connect-timeout", "15", "--max-time", "60", "--write-out", "\n%{http_code}", String(new URL("/companion/chat", base)), "-H", "Origin: https://znonymity.github.io", "-H", "Content-Type: application/json", "--data-binary", payload], { maxBuffer: 1024 * 1024 });
        const split = stdout.lastIndexOf("\n");
        status = Number(stdout.slice(split + 1)); body = JSON.parse(stdout.slice(0, split));
      } else {
        const response = await fetch(new URL("/companion/chat", base), { method: "POST", signal: AbortSignal.timeout(65000), headers: { Origin: "https://znonymity.github.io", "Content-Type": "application/json" }, body: payload });
        status = response.status; body = await response.json();
      }
      const errors = checkModeResponse(testCase, status, body);
      if (errors.length) failed += 1;
      console.log(JSON.stringify({ ...testCase, passed: !errors.length, status, engine: body.engine, model: body.model, answer_kind: body.answer_kind, route: body.route, en: body.answer_en, zh: body.answer_zh, sources: (body.sources || []).map(({ id, url }) => ({ id, url })), errors, ms: Date.now() - start }));
    } catch (error) {
      failed += 1;
      console.log(JSON.stringify({ ...testCase, passed: false, error: error.name, cause: error.cause?.code || error.code || null, ms: Date.now() - start }));
    }
  }
  console.log(JSON.stringify({ cases: MODE_CASES.length, passed: MODE_CASES.length - failed, failed, note: "Automated contract checks only; inspect relevance, personality and source support manually." }));
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
