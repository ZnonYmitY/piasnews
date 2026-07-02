#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = "/private/tmp/piasnews-immersive-workbench";
const DEFAULT_MAPPING = path.join(ROOT, "data", "immersive_translations.zh.json");

function parseArgs(argv) {
  const args = {
    out: process.env.PIASNEWS_IMMERSIVE_WORKBENCH_DIR || DEFAULT_OUT,
    mapping: process.env.PIASNEWS_IMMERSIVE_MAPPING || DEFAULT_MAPPING,
    port: Number(process.env.PIASNEWS_IMMERSIVE_PORT || 28521),
    waitMs: Number(process.env.PIASNEWS_IMMERSIVE_WAIT_MS || 120000),
    pollMs: Number(process.env.PIASNEWS_IMMERSIVE_POLL_MS || 5000),
    apply: process.env.PIASNEWS_IMMERSIVE_APPLY !== "0",
    publish: process.env.PIASNEWS_IMMERSIVE_PUBLISH === "1",
    open: process.env.PIASNEWS_IMMERSIVE_OPEN !== "0",
    close: process.env.PIASNEWS_IMMERSIVE_CLOSE !== "0",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => argv[++index];
    if (flag === "--out") args.out = next();
    else if (flag === "--mapping") args.mapping = next();
    else if (flag === "--port") args.port = Number(next());
    else if (flag === "--wait-ms") args.waitMs = Number(next());
    else if (flag === "--poll-ms") args.pollMs = Number(next());
    else if (flag === "--no-apply") args.apply = false;
    else if (flag === "--publish") args.publish = true;
    else if (flag === "--no-open") args.open = false;
    else if (flag === "--no-close") args.close = false;
    else if (flag === "--help") {
      console.log(`Usage: node scripts/run_immersive_workbench.mjs [options]

Build the Immersive Translate workbench, open it in local Chrome when missing
translations exist, poll the translated DOM through Chrome AppleScript, save new
mapping entries, and optionally apply/publish them.

Options:
  --out DIR        Workbench output directory.
  --mapping FILE   Translation mapping JSON.
  --port PORT      Local HTTP port. Default: 28521.
  --wait-ms MS     Max wait for translated DOM. Default: 120000.
  --poll-ms MS     Poll interval. Default: 5000.
  --no-apply       Do not apply mappings to data/items.json and data/social.json.
  --publish        Commit mapping, push, and trigger update-piasnews.yml.
  --no-open        Do not open Chrome; useful if the page is already open.
  --no-close       Keep matching Chrome workbench tabs open after capture.
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${flag}`);
    }
  }
  return args;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: { ...process.env, ...(options.env || {}) },
  });
  if (result.status !== 0) {
    const message = result.stderr || result.stdout || `${command} exited with ${result.status}`;
    throw new Error(message.trim());
  }
  return result.stdout || "";
}

function buildWorkbench(args) {
  const stdout = run("node", ["scripts/build_immersive_workbench.mjs"], {
    capture: true,
    env: { PIASNEWS_IMMERSIVE_WORKBENCH_DIR: args.out },
  });
  const payload = JSON.parse(stdout);
  console.log(JSON.stringify(payload, null, 2));
  return payload;
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  return "text/plain; charset=utf-8";
}

function startServer(root, port) {
  const server = http.createServer(async (request, response) => {
    try {
      const rawPath = new URL(request.url || "/", `http://127.0.0.1:${port}`).pathname;
      const relative = rawPath === "/" ? "translation-workbench.html" : decodeURIComponent(rawPath.slice(1));
      const filePath = path.resolve(root, relative);
      if (!filePath.startsWith(path.resolve(root) + path.sep)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      const body = await fs.readFile(filePath);
      response.writeHead(200, { "Content-Type": contentType(filePath) });
      response.end(body);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

function osascript(script) {
  return execFileSync("osascript", ["-e", script], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function openChrome(url) {
  spawnSync("open", ["-a", "Google Chrome", url], {
    cwd: ROOT,
    stdio: "ignore",
  });
}

function extractFromChrome(urlPrefix) {
  const js = `(() => {
    if (typeof window.__piasnewsExtractImmersiveTranslations !== "function") return "[]";
    return JSON.stringify(window.__piasnewsExtractImmersiveTranslations());
  })();`;
  const escapedPrefix = urlPrefix.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const escapedJs = js.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const script = `
tell application "Google Chrome"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t starts with "${escapedPrefix}") then
        return execute javascript "${escapedJs}" in t
      end if
    end repeat
  end repeat
end tell
return "[]"
`;
  const output = osascript(script);
  return JSON.parse(output || "[]");
}

function closeChromeTabs(urlPrefix) {
  const escapedPrefix = urlPrefix.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const script = `
tell application "Google Chrome"
  repeat with w in windows
    set tabCount to count tabs of w
    repeat with i from tabCount to 1 by -1
      set currentTab to tab i of w
      if (URL of currentTab starts with "${escapedPrefix}") then
        close currentTab
      end if
    end repeat
  end repeat
end tell
`;
  osascript(script);
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, payload) {
  await fs.writeFile(file, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

async function mergeTranslations(mappingPath, rows) {
  const mapping = await readJson(mappingPath, {
    schema_version: 1,
    generated_at: null,
    translations: {},
  });
  mapping.schema_version = mapping.schema_version || 1;
  mapping.translations = mapping.translations || {};
  let added = 0;
  const capturedAt = new Date().toISOString();
  for (const row of rows) {
    if (!row?.key || !row?.zh || mapping.translations[row.key]?.zh) continue;
    mapping.translations[row.key] = {
      dataset: row.dataset,
      item_id: row.item_id,
      field: row.field,
      target_field: row.target_field,
      source_text: row.source_text,
      zh: row.zh,
      engine: "immersive_translate_chrome",
      captured_at: capturedAt,
    };
    added += 1;
  }
  if (added > 0) {
    mapping.generated_at = capturedAt;
    await writeJson(mappingPath, mapping);
  }
  return added;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollTranslations(urlPrefix, total, waitMs, pollMs) {
  const started = Date.now();
  let latest = [];
  while (Date.now() - started <= waitMs) {
    try {
      latest = extractFromChrome(urlPrefix);
      const translated = latest.filter((row) => row.zh).length;
      console.log(`Immersive workbench translated ${translated}/${total}`);
      if (translated >= total) return latest;
    } catch (error) {
      console.error(`Chrome DOM extraction failed: ${error.message}`);
    }
    await sleep(pollMs);
  }
  return latest;
}

function applyMappings(args) {
  run("python3", [
    "scripts/apply_immersive_translations.py",
    "--mapping",
    args.mapping,
    "--items",
    "data/items.json",
    "--social",
    "data/social.json",
  ]);
}

function publishMappings() {
  run("git", ["-c", "rebase.autoStash=true", "pull", "--rebase"]);
  const diff = spawnSync("git", ["diff", "--quiet", "--", "data/immersive_translations.zh.json"], {
    cwd: ROOT,
    stdio: "ignore",
  });
  if (diff.status === 0) {
    console.log("No mapping changes to publish.");
    return;
  }
  run("git", ["add", "data/immersive_translations.zh.json"]);
  run("git", ["commit", "--only", "data/immersive_translations.zh.json", "-m", "Update Immersive Translate mappings"]);
  run("git", ["push"]);
  run("gh", ["workflow", "run", "update-piasnews.yml", "--ref", "main"]);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const build = buildWorkbench(args);
  if (build.targets_count === 0) {
    console.log("No missing Immersive Translate targets; skipped Chrome collection.");
    return 0;
  }

  const server = await startServer(args.out, args.port);
  const url = `http://127.0.0.1:${args.port}/translation-workbench.html`;
  try {
    if (args.open) openChrome(url);
    const rows = await pollTranslations(url, build.targets_count, args.waitMs, args.pollMs);
    const translated = rows.filter((row) => row.zh).length;
    const added = await mergeTranslations(args.mapping, rows);
    console.log(`Captured ${translated}/${build.targets_count}; added ${added} new mappings.`);
    if (added === 0) return translated === build.targets_count ? 0 : 2;
    if (args.apply) applyMappings(args);
    if (args.publish) publishMappings();
    return translated === build.targets_count ? 0 : 2;
  } finally {
    if (args.close) {
      try {
        closeChromeTabs(url);
      } catch (error) {
        console.error(`Chrome tab close failed: ${error.message}`);
      }
    }
    await new Promise((resolve) => server.close(resolve));
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
