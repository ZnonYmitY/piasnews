#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(repo, "data");
const defaultOutputDir = "/private/tmp/piasnews-immersive-workbench";
const outputDir = process.env.PIASNEWS_IMMERSIVE_WORKBENCH_DIR || defaultOutputDir;
const workbenchPath = path.join(outputDir, "translation-workbench.html");
const manifestPath = path.join(outputDir, "translation-targets.json");
const mappingPath = path.join(dataDir, "immersive_translations.zh.json");
const itemsPath = path.join(dataDir, "items.json");
const socialPath = path.join(dataDir, "social.json");
const IMMERSIVE_ENGINE = "immersive_translate_chrome";
const URL_ONLY_RE = /^https?:\/\/\S+$/i;
const targetMode = normalizeTargetMode(process.env.PIASNEWS_IMMERSIVE_TARGETS || "missing");

function normalizeTargetMode(value) {
  const mode = String(value || "missing").trim().toLowerCase();
  if (["missing", "non-immersive", "all"].includes(mode)) return mode;
  throw new Error(`Unknown PIASNEWS_IMMERSIVE_TARGETS mode: ${value}`);
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeScriptJson(value) {
  return String(value || "")
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw new Error(`Failed to parse JSON at ${file}: ${error.message}`);
  }
}

async function readOptionalJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw new Error(`Failed to parse JSON at ${file}: ${error.message}`);
    }
    return fallback;
  }
}

function targetKey(dataset, itemId, field, sourceText) {
  return `${dataset}:${itemId}:${field}:${sha256(sourceText)}`;
}

function existingTranslation(mapping, key) {
  const entry = mapping.translations?.[key];
  return entry?.zh ? entry : null;
}

function shouldCollectTarget(mapping, key) {
  const entry = existingTranslation(mapping, key);
  if (!entry) return true;
  if (targetMode === "all") return true;
  if (targetMode === "non-immersive") return entry.engine !== IMMERSIVE_ENGINE;
  return false;
}

function isUrlOnly(value) {
  return URL_ONLY_RE.test(clean(value));
}

function pushTarget(targets, mapping, target) {
  if (!target.source_text || isUrlOnly(target.source_text) || !shouldCollectTarget(mapping, target.key)) return;
  targets.push(target);
}

function collectItemTargets(itemsPayload, mapping) {
  const targets = [];
  for (const item of itemsPayload.items || []) {
    const itemId = clean(item.id || item.url);
    if (!itemId) continue;

    const title = clean(item.title);
    pushTarget(targets, mapping, {
      key: targetKey("items", itemId, "title", title),
      dataset: "items",
      item_id: itemId,
      field: "title",
      target_field: "title_zh",
      source_text: title,
      source_url: clean(item.url),
      source_name: clean(item.source),
    });

    const summary = clean(item.summary);
    pushTarget(targets, mapping, {
      key: targetKey("items", itemId, "summary", summary),
      dataset: "items",
      item_id: itemId,
      field: "summary",
      target_field: "summary_zh",
      source_text: summary,
      source_url: clean(item.url),
      source_name: clean(item.source),
    });
  }
  return targets;
}

function collectSocialTargets(socialPayload, mapping) {
  const targets = [];
  for (const item of socialPayload.items || []) {
    const itemId = clean(item.id || item.url);
    const summary = clean(item.summary || item.title);
    if (!itemId || !summary) continue;
    pushTarget(targets, mapping, {
      key: targetKey("social", itemId, "summary", summary),
      dataset: "social",
      item_id: itemId,
      field: "summary",
      target_field: "summary_zh",
      source_text: summary,
      source_url: clean(item.url),
      source_name: clean(item.source),
    });
  }
  return targets;
}

function renderWorkbench(targets) {
  const rows = targets.map((target, index) => `
    <article class="translation-row"
      data-index="${index}"
      data-translation-key="${escapeHtml(target.key)}"
      data-dataset="${escapeHtml(target.dataset)}"
      data-item-id="${escapeHtml(target.item_id)}"
      data-field="${escapeHtml(target.field)}"
      data-target-field="${escapeHtml(target.target_field)}">
      <div class="meta">
        <span>${escapeHtml(target.dataset)} / ${escapeHtml(target.target_field)}</span>
        <span>${escapeHtml(target.source_name || "")}</span>
      </div>
      <p class="source-text">${escapeHtml(target.source_text)}</p>
    </article>`).join("\n");
  const payload = JSON.stringify(targets);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Piasnews Immersive Translation Workbench</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 48px; line-height: 1.55; color: #191919; }
    h1 { margin-bottom: 4px; }
    .summary { color: #555; margin-bottom: 32px; white-space: pre-line; }
    .translation-row { border-bottom: 1px solid #ddd; padding: 28px 0; max-width: 980px; }
    .translation-row::before { content: attr(data-translation-key); display: block; color: #777; font-size: 12px; margin-bottom: 8px; }
    .meta { display: flex; gap: 16px; color: #666; font-size: 13px; margin-bottom: 8px; }
    .source-text { font-size: 20px; }
    #targets { display: none; }
  </style>
</head>
<body>
  <h1>Piasnews Immersive Translation Workbench</h1>
  <p class="summary">${targets.length} source texts
Translate this page with Immersive Translate, then extract translated rows from the DOM.</p>
  <script id="targets" type="application/json">${escapeScriptJson(payload)}</script>
  <script>
    window.__piasnewsExtractImmersiveTranslations = function () {
      const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim();
      const hasCjk = (value) => /[\\u3400-\\u9fff]/.test(value);
      const targets = JSON.parse(document.getElementById("targets").textContent || "[]");
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
    };
  </script>
  ${rows || "<p>No missing translation targets.</p>"}
</body>
</html>`;
}

function chunkTargets(targets, tabCount) {
  if (tabCount <= 1 || targets.length <= 1) return [targets];
  const chunkSize = Math.ceil(targets.length / tabCount);
  const chunks = [];
  for (let index = 0; index < targets.length; index += chunkSize) {
    chunks.push(targets.slice(index, index + chunkSize));
  }
  return chunks;
}

async function main() {
  const tabCount = parsePositiveInteger(process.env.PIASNEWS_IMMERSIVE_TABS, 1);
  await fs.mkdir(outputDir, { recursive: true });
  const items = await readJson(itemsPath, { items: [] });
  const social = await readJson(socialPath, { items: [] });
  const mapping = await readOptionalJson(mappingPath, {
    schema_version: 1,
    generated_at: null,
    translations: {},
  });

  const itemTargets = collectItemTargets(items, mapping);
  const socialTargets = collectSocialTargets(social, mapping);
  const targets = [...itemTargets, ...socialTargets];
  await fs.writeFile(workbenchPath, renderWorkbench(targets), "utf8");
  await fs.writeFile(manifestPath, JSON.stringify({ targets }, null, 2) + "\n", "utf8");
  const chunks = chunkTargets(targets, tabCount);
  const workbenchPages = [];
  if (chunks.length <= 1) {
    workbenchPages.push({
      path: workbenchPath,
      url_path: "/translation-workbench.html",
      targets_count: targets.length,
    });
  } else {
    for (let index = 0; index < chunks.length; index += 1) {
      const filename = `translation-workbench-${index + 1}.html`;
      const pagePath = path.join(outputDir, filename);
      await fs.writeFile(pagePath, renderWorkbench(chunks[index]), "utf8");
      workbenchPages.push({
        path: pagePath,
        url_path: `/${filename}`,
        targets_count: chunks[index].length,
      });
    }
  }

  console.log(JSON.stringify({
    repo,
    items_count: Array.isArray(items.items) ? items.items.length : 0,
    social_count: Array.isArray(social.items) ? social.items.length : 0,
    targets_count: targets.length,
    item_targets_count: itemTargets.length,
    social_targets_count: socialTargets.length,
    tabs_count: workbenchPages.length,
    target_mode: targetMode,
    workbench_pages: workbenchPages,
    workbench_path: workbenchPath,
    manifest_path: manifestPath,
    mapping_path: mappingPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
