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
const DEFAULT_STATE = "/private/tmp/piasnews-immersive-state.json";
const DEFAULT_FAILURE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const DEFAULT_OPENCLI_SESSION = "piasnews-immersive";

function parseArgs(argv) {
  const args = {
    out: process.env.PIASNEWS_IMMERSIVE_WORKBENCH_DIR || DEFAULT_OUT,
    mapping: process.env.PIASNEWS_IMMERSIVE_MAPPING || DEFAULT_MAPPING,
    port: Number(process.env.PIASNEWS_IMMERSIVE_PORT || 28521),
    waitMs: Number(process.env.PIASNEWS_IMMERSIVE_WAIT_MS || 120000),
    pollMs: Number(process.env.PIASNEWS_IMMERSIVE_POLL_MS || 5000),
    state: process.env.PIASNEWS_IMMERSIVE_STATE || DEFAULT_STATE,
    failureCooldownMs: Number(process.env.PIASNEWS_IMMERSIVE_FAILURE_COOLDOWN_MS || DEFAULT_FAILURE_COOLDOWN_MS),
    ignoreCooldown: process.env.PIASNEWS_IMMERSIVE_IGNORE_COOLDOWN === "1",
    apply: process.env.PIASNEWS_IMMERSIVE_APPLY !== "0",
    publish: process.env.PIASNEWS_IMMERSIVE_PUBLISH === "1",
    open: process.env.PIASNEWS_IMMERSIVE_OPEN !== "0",
    close: process.env.PIASNEWS_IMMERSIVE_CLOSE !== "0",
    tabs: Number(process.env.PIASNEWS_IMMERSIVE_TABS || 1),
    browserDriver: process.env.PIASNEWS_IMMERSIVE_BROWSER_DRIVER || "apple-events",
    opencliCmd: process.env.PIASNEWS_OPENCLI_CMD || "opencli",
    opencliSession: process.env.PIASNEWS_IMMERSIVE_OPENCLI_SESSION || DEFAULT_OPENCLI_SESSION,
    openWaitMs: Number(process.env.PIASNEWS_IMMERSIVE_OPEN_WAIT_MS || 0),
    triggerShortcut: process.env.PIASNEWS_IMMERSIVE_TRIGGER_SHORTCUT || "",
    triggerWaitMs: Number(process.env.PIASNEWS_IMMERSIVE_TRIGGER_WAIT_MS || 15000),
    publicBaseUrl: process.env.PIASNEWS_IMMERSIVE_PUBLIC_BASE_URL || "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => argv[++index];
    if (flag === "--out") args.out = next();
    else if (flag === "--mapping") args.mapping = next();
    else if (flag === "--port") args.port = Number(next());
    else if (flag === "--wait-ms") args.waitMs = Number(next());
    else if (flag === "--poll-ms") args.pollMs = Number(next());
    else if (flag === "--state") args.state = next();
    else if (flag === "--failure-cooldown-ms") args.failureCooldownMs = Number(next());
    else if (flag === "--ignore-cooldown") args.ignoreCooldown = true;
    else if (flag === "--no-apply") args.apply = false;
    else if (flag === "--publish") args.publish = true;
    else if (flag === "--no-open") args.open = false;
    else if (flag === "--no-close") args.close = false;
    else if (flag === "--tabs") args.tabs = Number(next());
    else if (flag === "--browser-driver") args.browserDriver = next();
    else if (flag === "--opencli-cmd") args.opencliCmd = next();
    else if (flag === "--opencli-session") args.opencliSession = next();
    else if (flag === "--open-wait-ms") args.openWaitMs = Number(next());
    else if (flag === "--trigger-shortcut") args.triggerShortcut = next();
    else if (flag === "--trigger-wait-ms") args.triggerWaitMs = Number(next());
    else if (flag === "--public-base-url") args.publicBaseUrl = next();
    else if (flag === "--help") {
      console.log(`Usage: node scripts/run_immersive_workbench.mjs [options]

Build the Immersive Translate workbench, open Chrome when missing translations
exist, poll the translated DOM through Chrome AppleScript or OpenCLI, save new
mapping entries, and optionally apply/publish them.

Options:
  --out DIR        Workbench output directory.
  --mapping FILE   Translation mapping JSON.
  --port PORT      Local HTTP port. Default: 28521.
  --wait-ms MS     Max wait for translated DOM. Default: 120000.
  --poll-ms MS     Poll interval. Default: 5000.
  --state FILE      Failure cooldown state file.
  --failure-cooldown-ms MS
                  Skip Chrome opening for this long after Apple Events blocks DOM reads.
  --ignore-cooldown
                  Ignore the failure cooldown once.
  --no-apply       Do not apply mappings to data/items.json and data/social.json.
  --publish        Commit mapping, push, and trigger update-piasnews.yml.
  --no-open        Do not open Chrome; useful if the page is already open.
  --no-close       Keep matching Chrome workbench tabs open after capture.
  --tabs N         Split targets across N workbench tabs. Default: 1.
  --browser-driver apple-events|opencli
                  DOM extraction driver. Default: apple-events.
  --opencli-cmd CMD
                  OpenCLI binary for the opencli browser driver. Default: opencli.
  --opencli-session NAME
                  OpenCLI browser session prefix. Default: piasnews-immersive.
  --open-wait-ms MS
                  Wait after opening tabs before polling. Default: 5000 for opencli, 0 for apple-events.
  --trigger-shortcut KEY
                  Press a browser shortcut in each OpenCLI tab before polling, e.g. Alt+W.
  --trigger-wait-ms MS
                  Wait after shortcut trigger before polling. Default: 15000.
  --public-base-url URL
                  Open and poll pre-published HTTPS workbench pages from this base
                  URL instead of starting a local 127.0.0.1 server.
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${flag}`);
    }
  }
  return args;
}

function normalizeArgs(args) {
  args.tabs = Number.isFinite(args.tabs) && args.tabs > 0 ? Math.floor(args.tabs) : 1;
  if (!["apple-events", "opencli"].includes(args.browserDriver)) {
    throw new Error(`Unknown browser driver: ${args.browserDriver}`);
  }
  if (!Number.isFinite(args.openWaitMs) || args.openWaitMs < 0) args.openWaitMs = 0;
  if (args.browserDriver === "opencli" && args.openWaitMs === 0) args.openWaitMs = 5000;
  if (!Number.isFinite(args.triggerWaitMs) || args.triggerWaitMs < 0) args.triggerWaitMs = 0;
  args.publicBaseUrl = String(args.publicBaseUrl || "").replace(/\/+$/, "");
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
    env: {
      PIASNEWS_IMMERSIVE_WORKBENCH_DIR: args.out,
      PIASNEWS_IMMERSIVE_TABS: String(args.tabs),
    },
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
  try {
    return execFileSync("osascript", ["-e", script], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const stderr = String(error.stderr || error.message || "");
    if (stderr.includes("-1723") || stderr.includes("不允许访问")) {
      throw new Error(
        "Chrome blocked JavaScript from Apple Events. In Chrome, enable View > Developer > Allow JavaScript from Apple Events, then rerun the Piasnews Immersive job."
      );
    }
    throw error;
  }
}

function openChrome(url) {
  spawnSync("open", ["-a", "Google Chrome", url], {
    cwd: ROOT,
    stdio: "ignore",
  });
}

function extractionExpression() {
  return `(() => {
    const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    const hasCjk = (value) => /[\\u3400-\\u9fff]/.test(value);
    const targetsElement = document.getElementById("targets");
    const targets = targetsElement ? JSON.parse(targetsElement.textContent || "[]") : [];
    const rows = Array.from(document.querySelectorAll(".translation-row"));
    return rows.map((row, index) => {
      const target = targets[index] || {};
      const source = clean(target.source_text);
      const ignored = new Set([
        clean(target.key),
        clean(target.dataset),
        clean(target.target_field),
        clean(target.source_name),
        clean(source),
        clean(row.dataset.translationKey),
      ].filter(Boolean));
      const texts = [];
      const push = (value) => {
        const text = clean(value);
        if (!text || ignored.has(text) || text === source) return;
        if (source && text.startsWith(source)) {
          const withoutSource = clean(text.slice(source.length));
          if (withoutSource && !ignored.has(withoutSource)) texts.push(withoutSource);
          return;
        }
        texts.push(text);
      };

      const sourceElement = row.querySelector(".source-text") || row;
      for (const element of sourceElement.querySelectorAll("*")) {
        const className = String(element.className || "");
        const isSource = element.classList && element.classList.contains("source-text");
        const isImmersive = /immersive|translate|translation/i.test(className);
        if (isImmersive && !isSource) push(element.innerText || element.textContent);
      }
      const sourceBlockText = String(sourceElement.innerText || "") + "\\n" + String(sourceElement.textContent || "");
      for (const line of String(sourceBlockText).split("\\n")) push(line);

      const zh = texts
        .filter(hasCjk)
        .sort((a, b) => b.length - a.length)[0] || "";
      return { ...target, zh };
    });
  })()`;
}

function extractFromChrome(urlPrefix) {
  const js = `JSON.stringify(${extractionExpression()})`;
  const escapedPrefix = urlPrefix.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const encodedJs = Buffer.from(js, "utf8").toString("base64");
  const script = `
tell application "Google Chrome"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t starts with "${escapedPrefix}") then
        return execute javascript "eval(atob('${encodedJs}'))" in t
      end if
    end repeat
  end repeat
end tell
return "[]"
`;
  const output = osascript(script);
  return JSON.parse(output || "[]");
}

function opencliSessionName(args, pageIndex) {
  return pageIndex === 0 ? args.opencliSession : `${args.opencliSession}-${pageIndex + 1}`;
}

function runOpenCli(args, commandArgs, options = {}) {
  const result = spawnSync(args.opencliCmd, commandArgs, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const message = [result.stderr, result.stdout].filter(Boolean).join("\n").trim();
    throw new Error(message || `${args.opencliCmd} exited with ${result.status}`);
  }
  if (!options.json) return result.stdout || "";
  const text = result.stdout.trim();
  if (!text) return null;
  const parsed = JSON.parse(text);
  return typeof parsed === "string" ? JSON.parse(parsed || "[]") : parsed;
}

function openOpenCli(url, args, pageIndex) {
  const output = runOpenCli(args, ["browser", opencliSessionName(args, pageIndex), "tab", "new", url], { json: true });
  return output?.page || output?.targetId || "";
}

function extractFromOpenCli(args, page) {
  const commandArgs = ["browser", opencliSessionName(args, page.index), "eval"];
  if (page.opencliTab) commandArgs.push("--tab", page.opencliTab);
  commandArgs.push(extractionExpression());
  const output = runOpenCli(args, commandArgs, { json: true });
  return Array.isArray(output) ? output : [];
}

function closeOpenCliSessions(pages, args) {
  for (const page of pages) {
    try {
      const session = opencliSessionName(args, page.index);
      if (page.opencliTab) runOpenCli(args, ["browser", session, "tab", "close", page.opencliTab]);
      else runOpenCli(args, ["browser", session, "close"]);
    } catch (error) {
      console.error(`OpenCLI session close failed: ${error.message}`);
    }
  }
}

function triggerOpenCliShortcut(page, args) {
  if (!args.triggerShortcut || !page.opencliTab) return;
  const session = opencliSessionName(args, page.index);
  runOpenCli(args, ["browser", session, "tab", "select", page.opencliTab]);
  runOpenCli(args, ["browser", session, "keys", "--tab", page.opencliTab, args.triggerShortcut]);
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

async function removeFile(file) {
  try {
    await fs.rm(file);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function appleEventsBlocked(error) {
  return String(error?.message || error || "").includes("Chrome blocked JavaScript from Apple Events");
}

async function writeFailureState(args, reason, build) {
  await writeJson(args.state, {
    reason,
    at: new Date().toISOString(),
    targets_count: build.targets_count,
    item_targets_count: build.item_targets_count,
    social_targets_count: build.social_targets_count,
  });
}

async function shouldSkipForFailureCooldown(args) {
  if (args.ignoreCooldown || args.failureCooldownMs <= 0) return false;
  const state = await readJson(args.state, null);
  if (state?.reason !== "chrome_apple_events_blocked" || !state.at) return false;
  const failedAt = Date.parse(state.at);
  if (!Number.isFinite(failedAt)) return false;
  const elapsed = Date.now() - failedAt;
  if (elapsed >= args.failureCooldownMs) return false;
  const remainingMinutes = Math.ceil((args.failureCooldownMs - elapsed) / 60000);
  console.log(
    `Skipped Chrome collection: Apple Events DOM access was blocked at ${state.at}; cooldown has ${remainingMinutes} minute(s) remaining. ` +
      "Enable Chrome > View > Developer > Allow JavaScript from Apple Events, or rerun with --ignore-cooldown."
  );
  return true;
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

function workbenchPages(build, args) {
  const pages = Array.isArray(build.workbench_pages) && build.workbench_pages.length
    ? build.workbench_pages
    : [{ url_path: "/translation-workbench.html", targets_count: build.targets_count }];
  return pages.map((page, index) => ({
    ...page,
    index,
    url: args.publicBaseUrl
      ? `${args.publicBaseUrl}${page.url_path || "/translation-workbench.html"}`
      : `http://127.0.0.1:${args.port}${page.url_path || "/translation-workbench.html"}`,
  }));
}

function openWorkbenchPages(pages, args) {
  for (const page of pages) {
    if (args.browserDriver === "opencli") page.opencliTab = openOpenCli(page.url, args, page.index);
    else openChrome(page.url);
  }
}

function extractPageTranslations(page, args) {
  if (args.browserDriver === "opencli") return extractFromOpenCli(args, page);
  return extractFromChrome(page.url);
}

async function pollTranslations(pages, total, args) {
  const started = Date.now();
  let latest = [];
  let blockedByAppleEvents = false;
  while (Date.now() - started <= args.waitMs) {
    try {
      latest = pages.flatMap((page) => extractPageTranslations(page, args));
      const translated = latest.filter((row) => row.zh).length;
      console.log(`Immersive workbench translated ${translated}/${total}`);
      if (translated >= total) return { rows: latest, blockedByAppleEvents };
    } catch (error) {
      if (appleEventsBlocked(error)) blockedByAppleEvents = true;
      console.error(`Chrome DOM extraction failed: ${error.message}`);
    }
    await sleep(args.pollMs);
  }
  return { rows: latest, blockedByAppleEvents };
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
  const args = normalizeArgs(parseArgs(process.argv.slice(2)));
  const build = buildWorkbench(args);
  if (build.targets_count === 0) {
    console.log("No missing Immersive Translate targets; skipped Chrome collection.");
    await removeFile(args.state);
    return 0;
  }
  if (await shouldSkipForFailureCooldown(args)) return 0;

  const server = args.publicBaseUrl ? null : await startServer(args.out, args.port);
  const pages = workbenchPages(build, args);
  try {
    if (args.open) openWorkbenchPages(pages, args);
    if (args.openWaitMs > 0) await sleep(args.openWaitMs);
    if (args.browserDriver === "opencli" && args.triggerShortcut) {
      for (const page of pages) triggerOpenCliShortcut(page, args);
      if (args.triggerWaitMs > 0) await sleep(args.triggerWaitMs);
    }
    const { rows, blockedByAppleEvents } = await pollTranslations(pages, build.targets_count, args);
    const translated = rows.filter((row) => row.zh).length;
    const added = await mergeTranslations(args.mapping, rows);
    console.log(`Captured ${translated}/${build.targets_count}; added ${added} new mappings.`);
    if (blockedByAppleEvents && translated === 0 && added === 0) {
      await writeFailureState(args, "chrome_apple_events_blocked", build);
      console.log("Recorded Apple Events cooldown; future scheduled runs will skip Chrome until the cooldown expires.");
      return 0;
    }
    if (added === 0) {
      if (translated === build.targets_count) await removeFile(args.state);
      return translated === build.targets_count ? 0 : 2;
    }
    await removeFile(args.state);
    if (args.apply) applyMappings(args);
    if (args.publish) publishMappings();
    return translated === build.targets_count ? 0 : 2;
  } finally {
    if (args.close) {
      if (args.browserDriver === "opencli") {
        closeOpenCliSessions(pages, args);
      } else {
        for (const page of pages) {
          try {
            closeChromeTabs(page.url);
          } catch (error) {
            console.error(`Chrome tab close failed: ${error.message}`);
          }
        }
      }
    }
    if (server) await new Promise((resolve) => server.close(resolve));
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
