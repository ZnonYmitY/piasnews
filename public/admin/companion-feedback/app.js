"use strict";

const DEFAULT_WORKER_URL = "https://piasnews-review.znonymity-piasnews.workers.dev";
const CATEGORY_LABELS = {
  off_persona: "不像皮亚斯特里", unnatural: "表达生硬 / 不自然", fact_error: "事实错误",
  irrelevant: "答非所问", over_refusal: "过度拒答", boundary_miss: "边界失守",
  invented_private: "编造隐私 / 内心活动", rumor_handling: "谣言处理不当", translation: "中英翻译问题",
  too_long: "过长 / 啰嗦", context_loss: "丢失上下文", technical: "响应 / 显示异常", other: "其他",
};
const STATUS_LABELS = { new: "待查看", triaged: "已归因", resolved: "已修复", dismissed: "不采纳" };
const $ = (id) => document.getElementById(id);
const state = { items: [], selectedId: null, nextCursor: null, session: null, generation: 0, connectionEpoch: 0, loading: false, saving: false, exporting: false, drafts: new Map() };
let volatileKey = "";
let volatileEndpoint = "";
class StaleOperation extends Error {}

function storageGet(storage, key) { try { return storage.getItem(key) || ""; } catch { return ""; } }
function currentKey() { return volatileKey || storageGet(sessionStorage, "piasnewsAdminKey"); }
function currentEndpoint() { return volatileEndpoint || storageGet(localStorage, "piasnewsWorkerUrl") || DEFAULT_WORKER_URL; }
function connectionIdentity() { return { epoch: state.connectionEpoch, key: currentKey(), endpoint: currentEndpoint() }; }
function validatedEndpoint(value) {
  const url = new URL(String(value).trim());
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) || url.username || url.password || url.search || url.hash) throw new Error("请填写不含查询参数或账号信息的 HTTPS Worker 地址；本机测试可使用 localhost。");
  return url.href.replace(/\/$/, "");
}
function setStatus(id, message, isError = false) { $(id).textContent = message; $(id).classList.toggle("is-error", isError); }
function dateLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间未提供" : new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}
function text(value, fallback = "未提供") { return typeof value === "string" && value.trim() ? value : fallback; }
function node(tag, className, value) { const result = document.createElement(tag); if (className) result.className = className; if (value !== undefined) result.textContent = value; return result; }
function badge(value, className = "") { return node("span", `badge ${className}`, value); }
function selectedItem() { return state.items.find((item) => item.feedback_id === state.selectedId); }
function activeFilters() {
  const params = new URLSearchParams();
  for (const [key, id] of [["rating", "ratingFilter"], ["status", "statusFilter"], ["category", "categoryFilter"]]) if ($(id).value) params.set(key, $(id).value);
  return params;
}
function controls() {
  const unavailable = !state.session || state.loading || state.saving;
  $("refreshButton").disabled = unavailable;
  $("loadMoreButton").disabled = unavailable;
  $("exportButton").disabled = unavailable || state.exporting;
  $("saveReviewButton").disabled = unavailable || !selectedItem();
  for (const id of ["ratingFilter", "statusFilter", "categoryFilter", "reviewStatus", "reviewNote"]) $(id).disabled = state.saving;
}
function clearPrivateView() {
  state.items = []; state.selectedId = null; state.nextCursor = null;
  state.drafts.clear();
  $("feedbackList").replaceChildren(); $("detailContent").hidden = true; $("detailEmpty").hidden = false;
  // Remove private strings as well as hiding them after sign-out or lost authorization.
  for (const id of ["promptText", "answerEn", "answerZh", "commentText", "expectedText", "detailMeta", "contextList", "runtimeMetadata"]) $(id).replaceChildren();
  $("reviewNote").value = "";
  $("listEmpty").hidden = false; $("listEmpty").textContent = "使用已有管理员密钥连接。对话内容不会公开在静态页面中。";
  $("loadMoreButton").hidden = true;
  setStatus("resultCount", "连接后查看反馈"); controls();
}
function authLost() {
  state.session = null; state.generation += 1; state.connectionEpoch += 1; clearPrivateView();
  setStatus("connectionState", "登录失效或管理员权限不足", true);
}
async function api(path, options = {}, identity = connectionIdentity()) {
  if (identity.epoch !== state.connectionEpoch) throw new StaleOperation();
  const endpoint = validatedEndpoint(identity.endpoint);
  const key = identity.key;
  if (!key) throw new Error("请先连接管理员账号。");
  let response;
  try {
    response = await fetch(`${endpoint}${path}`, { ...options, cache: "no-store", credentials: "omit", redirect: "error", signal: AbortSignal.timeout(20000), headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${key}` } });
  } catch { if (identity.epoch !== state.connectionEpoch) throw new StaleOperation(); throw new Error("管理接口暂时无法连接，请检查网络后重试。"); }
  if (identity.epoch !== state.connectionEpoch) throw new StaleOperation();
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) { authLost(); throw new Error("密钥无效或权限不足，需要已有 admin 角色。"); }
    if (response.status === 429) throw new Error("请求较多，请稍后再试。");
    if (response.status === 404) throw new Error("未找到反馈接口，请确认后端已部署。");
    throw new Error(`请求未成功（HTTP ${response.status}），请重试。`);
  }
  let payload;
  try { payload = await response.json(); } catch { throw new Error("接口返回格式不正确，请稍后重试。"); }
  if (identity.epoch !== state.connectionEpoch) throw new StaleOperation();
  return payload;
}
function renderList() {
  const list = $("feedbackList"); list.replaceChildren();
  for (const item of state.items) {
    const card = node("button", "feedback-card"); card.type = "button";
    card.setAttribute("aria-pressed", String(item.feedback_id === state.selectedId));
    const top = node("div", "card-top");
    top.append(badge(item.rating === "positive" ? "不错" : "有问题", item.rating), node("span", "card-time", dateLabel(item.created_at)));
    card.append(top, node("p", "card-prompt", text(item.snapshot?.prompt, "未提供提问")));
    card.append(node("div", "card-categories", `${STATUS_LABELS[item.status] || "未知状态"} · ${(item.categories || []).map((id) => CATEGORY_LABELS[id] || "未知类型").join(" / ") || "未选择问题类型"}`));
    card.addEventListener("click", () => {
      if (state.saving) return;
      state.selectedId = item.feedback_id; renderList(); renderDetail();
      if (window.matchMedia("(max-width: 620px)").matches) $("detailPanel").scrollIntoView({ block: "start", behavior: "instant" });
    });
    list.append(card);
  }
  $("listEmpty").hidden = Boolean(state.items.length);
  $("loadMoreButton").hidden = !state.nextCursor;
}
function renderDetail() {
  const item = selectedItem(); $("detailContent").hidden = !item; $("detailEmpty").hidden = Boolean(item);
  if (!item) { controls(); return; }
  const snapshot = item.snapshot || {};
  $("detailBadges").replaceChildren(badge(item.rating === "positive" ? "不错" : "有问题", item.rating), badge(STATUS_LABELS[item.status] || "未知状态"), badge("CLIENT-REPORTED · 待核验"));
  $("detailTitle").textContent = "对话反馈";
  $("detailMeta").textContent = `${dateLabel(item.created_at)}（北京时间） · ${item.feedback_id}`;
  $("categoryBadges").replaceChildren(...(item.categories || []).map((id) => badge(CATEGORY_LABELS[id] || "未知类型")));
  $("promptText").textContent = text(snapshot.prompt, "未提供提问");
  $("answerEn").textContent = text(snapshot.answer_en, ""); $("answerEn").hidden = !snapshot.answer_en;
  $("answerZh").textContent = text(snapshot.answer_zh, snapshot.answer_en ? "" : "未提供回复"); $("answerZh").hidden = !snapshot.answer_zh && Boolean(snapshot.answer_en);
  $("commentText").textContent = text(item.comment, "用户未补充说明。"); $("expectedText").textContent = text(item.expected_reply, "用户未填写期望回答。");
  const contextList = $("contextList"); contextList.replaceChildren(); $("contextDetails").open = false;
  if (item.include_context && Array.isArray(snapshot.history) && snapshot.history.length) {
    for (const message of snapshot.history) { const block = node("div", "context-message"); block.append(node("strong", "", message.role === "user" ? "用户" : "Companion"), node("p", "", text(message.content, "（空）"))); contextList.append(block); }
  } else contextList.append(node("p", "muted", item.include_context ? "本条没有此前上下文。" : "用户未同意附带此前上下文。"));
  const metadata = $("runtimeMetadata"); metadata.replaceChildren();
  const rows = [
    ["消息 ID", item.message_id], ["引擎 / 模型", [snapshot.engine, snapshot.model].filter(Boolean).join(" / ")], ["路由", snapshot.route], ["风格卡", snapshot.style_card_id],
    ["人格包版本", snapshot.package_version], ["来源哈希", snapshot.source_hash], ["应用版本", snapshot.app_version], ["仅事实模式", snapshot.facts_only ? "是" : "否"],
    ["响应耗时", Number.isFinite(snapshot.latency_ms) ? `${snapshot.latency_ms} ms` : "未提供"],
    ["事实条目", (snapshot.knowledge_fact_ids || []).join(", ")], ["谣言条目", (snapshot.rumor_item_ids || []).join(", ")],
    ["判断规则", (snapshot.judgment_rule_ids || []).join(", ")], ["风格证据", (snapshot.evidence_ids || []).join(", ")],
    ["最近处理", item.reviewed_at ? `${dateLabel(item.reviewed_at)} · ${text(item.reviewed_by)}` : "尚未处理"],
  ];
  for (const [label, value] of rows) metadata.append(node("dt", "", label), node("dd", "", text(value)));
  const draft = state.drafts.get(item.feedback_id);
  $("reviewStatus").value = draft?.status || (STATUS_LABELS[item.status] ? item.status : "new"); $("reviewNote").value = draft?.review_note ?? item.review_note ?? "";
  setStatus("reviewState", draft ? "有未保存的本地修改（切换记录会暂存，退出后清除）" : item.reviewed_at ? `上次保存：${dateLabel(item.reviewed_at)}` : "尚未添加处理记录"); controls();
}
async function loadList({ append = false } = {}) {
  if (!state.session || state.saving || (append && !state.nextCursor)) return;
  const generation = ++state.generation; state.loading = true; controls(); setStatus("loadingState", "正在读取…");
  const params = activeFilters(); params.set("limit", "25"); if (append) params.set("cursor", state.nextCursor);
  try {
    const payload = await api(`/companion/feedback?${params}`);
    if (generation !== state.generation) return;
    if (!Array.isArray(payload.items)) throw new Error("反馈列表格式不正确，请稍后重试。");
    state.items = append ? [...state.items, ...payload.items.filter((item) => !state.items.some((old) => old.feedback_id === item.feedback_id))] : payload.items;
    state.nextCursor = payload.next_cursor || null;
    if (!state.items.some((item) => item.feedback_id === state.selectedId)) state.selectedId = null;
    $("listEmpty").textContent = "当前筛选没有反馈。试试切换条件，或等待用户主动提交。";
    setStatus("resultCount", `共 ${Number(payload.total) || 0} 条 · 已加载 ${state.items.length} 条 · 最多保留 ${Math.min(Number(payload.retention_days) || 90, 90)} 天`);
    setStatus("loadingState", "已更新"); renderList(); renderDetail();
  } catch (error) { if (!(error instanceof StaleOperation) && (generation === state.generation || !state.session)) setStatus("loadingState", error.message, true); }
  finally { if (generation === state.generation || !state.session) { state.loading = false; controls(); } }
}
async function connect() {
  state.session = null; state.generation += 1; state.connectionEpoch += 1; clearPrivateView();
  const generation = state.generation;
  const identity = connectionIdentity();
  if (!currentKey()) { setStatus("connectionState", "未登录 · 需要管理员权限"); return; }
  setStatus("connectionState", "正在验证管理员权限…");
  try {
    const session = await api("/session", {}, identity);
    if (generation !== state.generation) return;
    if (session.role !== "admin" || session.permissions?.administer === false) throw new Error("当前账号没有 admin 权限，不能读取对话反馈。");
    state.session = session; setStatus("connectionState", `${text(session.user, "管理员")} · admin`); controls();
    await loadList();
    if (identity.epoch !== state.connectionEpoch) throw new StaleOperation();
  } catch (error) { if (!(error instanceof StaleOperation) && (generation === state.generation || !state.session)) { state.session = null; clearPrivateView(); setStatus("connectionState", error.message, true); } throw error; }
}
function openSettings() {
  $("workerUrlInput").value = currentEndpoint(); $("adminKeyInput").value = "";
  $("adminKeyInput").required = !currentKey();
  $("adminKeyInput").placeholder = currentKey() ? "已保存；留空使用当前会话密钥" : "输入已有管理员密钥";
  setStatus("settingsState", "确认接口地址后再连接。不要使用模型 API key。"); $("settingsDialog").showModal();
}
$("settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const endpoint = validatedEndpoint($("workerUrlInput").value);
    const inputKey = $("adminKeyInput").value.trim(); const key = inputKey || currentKey();
    if (endpoint !== validatedEndpoint(currentEndpoint()) && !inputKey) throw new Error("切换接口地址时，请重新输入管理员密钥，确认授权目标。");
    if (!key) throw new Error("请输入已有管理员密钥。");
    volatileEndpoint = endpoint; volatileKey = key;
    try { localStorage.setItem("piasnewsWorkerUrl", endpoint); sessionStorage.setItem("piasnewsAdminKey", key); } catch { /* Private mode: keep the connection only in memory. */ }
    $("adminKeyInput").value = ""; setStatus("settingsState", "正在连接…");
    await connect(); $("settingsDialog").close();
  } catch (error) { if (!(error instanceof StaleOperation)) setStatus("settingsState", error.message, true); }
});
$("disconnectButton").addEventListener("click", () => {
  volatileKey = ""; try { sessionStorage.removeItem("piasnewsAdminKey"); } catch { /* No session storage available. */ }
  state.session = null; state.generation += 1; state.connectionEpoch += 1; state.loading = false; clearPrivateView();
  $("adminKeyInput").value = ""; $("settingsDialog").close(); setStatus("connectionState", "已退出 · 密钥已清除"); setStatus("loadingState", "");
});
$("reviewForm").addEventListener("submit", async (event) => {
  event.preventDefault(); const item = selectedItem(); if (!item || state.saving || !state.session) return;
  state.saving = true; controls(); const status = $("reviewStatus").value; const reviewNote = $("reviewNote").value; const session = state.session; const identity = connectionIdentity();
  setStatus("reviewState", "正在保存并回读…");
  try {
    await api("/companion/feedback/review", { method: "POST", body: JSON.stringify({ feedback_id: item.feedback_id, status, review_note: reviewNote }) }, identity);
    const readback = await api(`/companion/feedback?${new URLSearchParams({ feedback_id: item.feedback_id, limit: "1" })}`, {}, identity);
    if (state.session !== session) return;
    const saved = readback.items?.find((row) => row.feedback_id === item.feedback_id);
    if (!saved || saved.status !== status || saved.review_note !== reviewNote.trim()) throw new Error("保存请求已发出，但回读未确认；请刷新检查，不要重复提交。");
    state.items = state.items.map((row) => row.feedback_id === saved.feedback_id ? saved : row);
    state.drafts.delete(saved.feedback_id);
    renderList(); renderDetail(); setStatus("reviewState", "已保存并回读确认。仅更新本条处理记录。");
    if ($("statusFilter").value && $("statusFilter").value !== status) setStatus("loadingState", "该记录已不符合当前状态筛选，刷新后移出列表。");
  } catch (error) { if (!(error instanceof StaleOperation)) setStatus("reviewState", error.message, true); }
  finally { state.saving = false; controls(); }
});
$("exportButton").addEventListener("click", async () => {
  if (!state.session || state.exporting || state.saving) return;
  state.exporting = true; controls(); const session = state.session; const identity = connectionIdentity(); setStatus("loadingState", "正在导出当前筛选（最多 500 条）…");
  try {
    const params = activeFilters(); params.set("limit", "500");
    const payload = await api(`/companion/feedback/export?${params}`, {}, identity);
    if (state.session !== session) return;
    if (!Array.isArray(payload.items)) throw new Error("导出数据格式不正确。");
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const downloadUrl = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = downloadUrl; link.download = `piasnews-companion-feedback-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    setStatus("loadingState", `已导出 ${payload.items.length} 条${payload.next_cursor ? "（达到单次上限）" : ""}。文件含用户对话，请仅在内部安全保存。`);
  } catch (error) { if (!(error instanceof StaleOperation)) setStatus("loadingState", error.message, true); }
  finally { state.exporting = false; controls(); }
});
$("filterForm").addEventListener("submit", (event) => { event.preventDefault(); loadList(); });
for (const id of ["reviewStatus", "reviewNote"]) $(id).addEventListener("input", () => {
  if (!state.selectedId) return;
  state.drafts.set(state.selectedId, { status: $("reviewStatus").value, review_note: $("reviewNote").value });
  setStatus("reviewState", "有未保存的本地修改（切换记录会暂存，退出后清除）");
});
$("loadMoreButton").addEventListener("click", () => loadList({ append: true }));
$("settingsButton").addEventListener("click", openSettings);
$("closeSettingsButton").addEventListener("click", () => $("settingsDialog").close());
for (const [value, label] of Object.entries(CATEGORY_LABELS)) { const option = node("option", "", label); option.value = value; $("categoryFilter").append(option); }
controls();
connect().catch(() => { /* Error is already rendered; never log credentials or conversation payloads. */ });
