#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const repo = path.resolve(new URL("..", import.meta.url).pathname);
const dataDir = path.join(repo, "data");
const defaultOutputDir = "/private/tmp/piasnews-immersive-workbench";
const outputDir = process.env.PIASNEWS_IMMERSIVE_WORKBENCH_DIR || defaultOutputDir;
const workbenchPath = path.join(outputDir, "translation-workbench.html");
const manifestPath = path.join(outputDir, "translation-targets.json");
const mappingPath = path.join(dataDir, "immersive_translations.zh.json");
const itemsPath = path.join(dataDir, "items.json");
const socialPath = path.join(dataDir, "social.json");

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

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

function targetKey(dataset, itemId, field, sourceText) {
  return `${dataset}:${itemId}:${field}:${sha256(sourceText)}`;
}

function hasTranslation(mapping, key) {
  return Boolean(mapping.translations?.[key]?.zh);
}

function pushTarget(targets, mapping, target) {
  if (!target.source_text || hasTranslation(mapping, target.key)) return;
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
  <script id="targets" type="application/json">${escapeHtml(payload)}</script>
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

        for (const element of row.querySelectorAll("*")) {
          const className = String(element.className || "");
          const isSource = element.classList && element.classList.contains("source-text");
          const isImmersive = /immersive|translate|translation/i.test(className);
          if (isImmersive && !isSource) push(element.innerText || element.textContent);
        }
        for (const line of String(row.innerText || "").split("\\n")) push(line);

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

async function main() {
  await fs.mkdir(outputDir, { recursive: true });
  const items = await readJson(itemsPath, { items: [] });
  const social = await readJson(socialPath, { items: [] });
  const mapping = await readJson(mappingPath, {
    schema_version: 1,
    generated_at: null,
    translations: {},
  });

  const itemTargets = collectItemTargets(items, mapping);
  const socialTargets = collectSocialTargets(social, mapping);
  const targets = [...itemTargets, ...socialTargets];
  await fs.writeFile(workbenchPath, renderWorkbench(targets), "utf8");
  await fs.writeFile(manifestPath, JSON.stringify({ targets }, null, 2) + "\n", "utf8");

  console.log(JSON.stringify({
    repo,
    items_count: Array.isArray(items.items) ? items.items.length : 0,
    social_count: Array.isArray(social.items) ? social.items.length : 0,
    targets_count: targets.length,
    item_targets_count: itemTargets.length,
    social_targets_count: socialTargets.length,
    workbench_path: workbenchPath,
    manifest_path: manifestPath,
    mapping_path: mappingPath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
