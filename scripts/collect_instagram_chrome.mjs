#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_OUTPUT = "/tmp/piasnews-instagram-social.json";
const DEFAULT_HANDLE = "oscarpiastri";

function parseArgs(argv) {
  const args = {
    handle: DEFAULT_HANDLE,
    output: process.env.PIASNEWS_INSTAGRAM_IMPORT || DEFAULT_OUTPUT,
    limit: Number(process.env.PIASNEWS_INSTAGRAM_LIMIT || 6),
    days: Number(process.env.PIASNEWS_DAYS || 3),
    waitMs: Number(process.env.PIASNEWS_INSTAGRAM_WAIT_MS || 5000),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const next = () => argv[++index];
    if (flag === "--handle") args.handle = next().replace(/^@/, "");
    else if (flag === "--output") args.output = next();
    else if (flag === "--limit") args.limit = Number(next());
    else if (flag === "--days") args.days = Number(next());
    else if (flag === "--wait-ms") args.waitMs = Number(next());
    else if (flag === "--help") {
      console.log(`Usage: node scripts/collect_instagram_chrome.mjs [options]

Collect recent public Instagram posts from a logged-in local Chrome session.
This reads only public profile/post DOM and writes Piasnews social import JSON.

Options:
  --handle USER     Instagram handle. Default: oscarpiastri.
  --output FILE     Import JSON output path.
  --limit N         Max profile links to inspect. Default: 6.
  --days N          Recency window. Default: 3.
  --wait-ms MS      Wait after opening each page. Default: 5000.
`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${flag}`);
    }
  }
  return args;
}

function osascript(script) {
  try {
    return execFileSync("osascript", ["-e", script], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    const stderr = String(error.stderr || error.message || "");
    if (stderr.includes("-1723") || stderr.includes("不允许访问")) {
      throw new Error(
        "Chrome blocked JavaScript from Apple Events. In Chrome, enable View > Developer > Allow JavaScript from Apple Events, then rerun the Piasnews social job."
      );
    }
    throw error;
  }
}

function chromeUrlPrefix(url) {
  return url.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function executeChromeJson(urlPrefix, pageFunction) {
  const js = `JSON.stringify((${pageFunction})())`;
  const encodedJs = Buffer.from(js, "utf8").toString("base64");
  const script = `
tell application "Google Chrome"
  repeat with w in windows
    repeat with t in tabs of w
      if (URL of t starts with "${chromeUrlPrefix(urlPrefix)}") then
        return execute javascript "eval(atob('${encodedJs}'))" in t
      end if
    end repeat
  end repeat
end tell
return "{}"
`;
  const output = osascript(script);
  return JSON.parse(output || "{}");
}

function openChrome(url) {
  spawnSync("open", ["-a", "Google Chrome", url], { stdio: "ignore" });
}

function closeChromeTabs(urls) {
  const checks = urls.map((url) => `URL of currentTab starts with "${chromeUrlPrefix(url)}"`).join(" or ");
  if (!checks) return;
  const script = `
tell application "Google Chrome"
  repeat with w in windows
    set tabCount to count tabs of w
    repeat with i from tabCount to 1 by -1
      set currentTab to tab i of w
      if (${checks}) then
        close currentTab
      end if
    end repeat
  end repeat
end tell
`;
  osascript(script);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseCaption(description) {
  const text = String(description || "");
  const match = text.match(/[：:]\s*["“]([^"”]+)["”]\.?\s*$/);
  if (match) return match[1].trim();
  return text.replace(/^[^:：]+[:：]\s*/, "").replace(/^["“]|["”]\.?$/g, "").trim();
}

function parseMetrics(description) {
  const text = String(description || "");
  const likes = text.match(/([\d,.]+)\s*K?\s*likes/i);
  const comments = text.match(/([\d,.]+)\s*K?\s*comments/i);
  return {
    likes_text: likes?.[0] || "",
    comments_text: comments?.[0] || "",
  };
}

async function collectProfileLinks(handle, waitMs, limit) {
  const profileUrl = `https://www.instagram.com/${handle}/`;
  openChrome(profileUrl);
  await sleep(waitMs);
  const profile = executeChromeJson(profileUrl, `() => {
    const links = Array.from(document.querySelectorAll('a[href]'))
      .map((a) => a.href)
      .filter((href) => href.includes('/${handle}/p/') || href.includes('/${handle}/reel/'));
    return { links: Array.from(new Set(links)).slice(0, ${limit}) };
  }`);
  return profile.links || [];
}

async function collectPost(handle, url, waitMs) {
  openChrome(url);
  await sleep(waitMs);
  const detail = executeChromeJson(url, `() => {
    const meta = (selector) => document.querySelector(selector)?.getAttribute('content') || '';
    const times = Array.from(document.querySelectorAll('time[datetime]'))
      .map((time) => time.getAttribute('datetime'))
      .filter(Boolean)
      .sort();
    return {
      url: location.href,
      description: meta('meta[property="og:description"]') || meta('meta[name="description"]'),
      title: meta('meta[property="og:title"]') || document.title,
      published_at: times[0] || '',
    };
  }`);
  if (!detail.published_at || !detail.description) return null;
  const kind = url.includes(`/${handle}/reel/`) ? "reel" : "post";
  return {
    platform: "instagram",
    handle,
    id: url.replace(/\/$/, "").split("/").pop(),
    url: detail.url || url,
    text: parseCaption(detail.description) || detail.title,
    created_at: detail.published_at,
    kind,
    metrics: parseMetrics(detail.description),
    language: "en",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const openedUrls = [`https://www.instagram.com/${args.handle}/`];
  const cutoff = Date.now() - args.days * 24 * 60 * 60 * 1000;
  const statuses = [];
  const items = [];
  try {
    const links = await collectProfileLinks(args.handle, args.waitMs, args.limit);
    openedUrls.push(...links);
    for (const url of links) {
      const item = await collectPost(args.handle, url, args.waitMs);
      if (!item) continue;
      const timestamp = Date.parse(item.created_at);
      if (Number.isFinite(timestamp) && timestamp >= cutoff) items.push(item);
    }
    statuses.push({
      platform: "instagram",
      handle: args.handle,
      ok: true,
      links: links.length,
      items: items.length,
    });
  } catch (error) {
    statuses.push({
      platform: "instagram",
      handle: args.handle,
      ok: false,
      error: String(error?.message || error),
    });
  } finally {
    try {
      closeChromeTabs(openedUrls);
    } catch {
      // Leaving a tab open is safer than failing a collection run after data was read.
    }
  }

  const payload = {
    source: "chrome-instagram",
    window_days: args.days,
    items,
    source_status: statuses,
  };
  await fs.mkdir(path.dirname(args.output), { recursive: true });
  await fs.writeFile(args.output, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log(`Wrote ${items.length} Instagram items to ${args.output}`);
  return items.length > 0 ? 0 : 2;
}

main().then((code) => {
  process.exitCode = code;
}).catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
