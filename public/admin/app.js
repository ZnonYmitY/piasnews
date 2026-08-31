const STATUS_LABELS = {
  pending: "待审",
  approved: "已通过",
  rejected: "已拒绝",
};

const state = {
  candidates: [],
  filter: "pending",
  selectedId: null,
  queuedIds: new Set(),
  activeView: "review",
  analyticsDays: 7,
  analyticsEnd: null,
  analyticsRange: null,
  hotEvents: [],
  hotOverrides: [],
  selectedHotId: null,
  selectedHotVersion: null,
  manualHotEvent: false,
  editingHotItems: [],
  selectedHotItemId: null,
  translationFallback: null,
  session: null,
  sessionValidation: null,
};

const elements = {
  actionHint: document.querySelector("#actionHint"),
  adminKeyInput: document.querySelector("#adminKeyInput"),
  analyticsChart: document.querySelector("#analyticsChart"),
  analyticsContent: document.querySelector("#analyticsContent"),
  analyticsMessage: document.querySelector("#analyticsMessage"),
  analyticsNext: document.querySelector("#analyticsNext"),
  analyticsPeak: document.querySelector("#analyticsPeak"),
  analyticsPrevious: document.querySelector("#analyticsPrevious"),
  analyticsRange: document.querySelector("#analyticsRange"),
  analyticsUpdated: document.querySelector("#analyticsUpdated"),
  analyticsView: document.querySelector("#analyticsView"),
  activateHotOverrideButton: document.querySelector("#activateHotOverrideButton"),
  approveButton: document.querySelector("#approveButton"),
  candidateList: document.querySelector("#candidateList"),
  candidateScore: document.querySelector("#candidateScore"),
  connectionState: document.querySelector("#connectionState"),
  dateInput: document.querySelector("#dateInput"),
  decisionReasonInput: document.querySelector("#decisionReasonInput"),
  editorTitle: document.querySelector("#editorTitle"),
  emptyState: document.querySelector("#emptyState"),
  hotActionHint: document.querySelector("#hotActionHint"),
  hotAdminList: document.querySelector("#hotAdminList"),
  hotAdminMessage: document.querySelector("#hotAdminMessage"),
  hotAdminWorkspace: document.querySelector("#hotAdminWorkspace"),
  addHotContentButton: document.querySelector("#addHotContentButton"),
  deleteHotContentButton: document.querySelector("#deleteHotContentButton"),
  hotEditorEmpty: document.querySelector("#hotEditorEmpty"),
  hotEditorTitle: document.querySelector("#hotEditorTitle"),
  hotEventCount: document.querySelector("#hotEventCount"),
  hotEventForm: document.querySelector("#hotEventForm"),
  hotEventId: document.querySelector("#hotEventId"),
  hotEventMeta: document.querySelector("#hotEventMeta"),
  hotHeatInput: document.querySelector("#hotHeatInput"),
  hotHiddenInput: document.querySelector("#hotHiddenInput"),
  hotContentCount: document.querySelector("#hotContentCount"),
  hotContentEditorTitle: document.querySelector("#hotContentEditorTitle"),
  hotContentEmpty: document.querySelector("#hotContentEmpty"),
  hotContentFields: document.querySelector("#hotContentFields"),
  hotContentImageInput: document.querySelector("#hotContentImageInput"),
  hotContentList: document.querySelector("#hotContentList"),
  hotContentMediaPreview: document.querySelector("#hotContentMediaPreview"),
  hotContentMediaPreviewFrame: document.querySelector("#hotContentMediaPreviewFrame"),
  hotContentMediaPreviewStatus: document.querySelector("#hotContentMediaPreviewStatus"),
  hotContentPosterInput: document.querySelector("#hotContentPosterInput"),
  hotContentPublishedInput: document.querySelector("#hotContentPublishedInput"),
  hotContentSourceInput: document.querySelector("#hotContentSourceInput"),
  hotContentSummaryEnInput: document.querySelector("#hotContentSummaryEnInput"),
  hotContentSummaryZhInput: document.querySelector("#hotContentSummaryZhInput"),
  hotContentTitleEnInput: document.querySelector("#hotContentTitleEnInput"),
  hotContentTitleZhInput: document.querySelector("#hotContentTitleZhInput"),
  hotContentTypeInput: document.querySelector("#hotContentTypeInput"),
  hotContentUrlInput: document.querySelector("#hotContentUrlInput"),
  hotContentVideoInput: document.querySelector("#hotContentVideoInput"),
  hotOverrideStatus: document.querySelector("#hotOverrideStatus"),
  hotPinnedRankInput: document.querySelector("#hotPinnedRankInput"),
  hotReasonInput: document.querySelector("#hotReasonInput"),
  hotSourceLink: document.querySelector("#hotSourceLink"),
  hotView: document.querySelector("#hotView"),
  hotWordEnInput: document.querySelector("#hotWordEnInput"),
  hotWordZhInput: document.querySelector("#hotWordZhInput"),
  originalTitle: document.querySelector("#originalTitle"),
  newHotEventButton: document.querySelector("#newHotEventButton"),
  pendingCount: document.querySelector("#pendingCount"),
  queueUpdated: document.querySelector("#queueUpdated"),
  reasonZhInput: document.querySelector("#reasonZhInput"),
  refreshButton: document.querySelector("#refreshButton"),
  reviewView: document.querySelector("#reviewView"),
  rejectButton: document.querySelector("#rejectButton"),
  reviewForm: document.querySelector("#reviewForm"),
  roleBadge: document.querySelector("#roleBadge"),
  saveHotDraftButton: document.querySelector("#saveHotDraftButton"),
  saveSettingsButton: document.querySelector("#saveSettingsButton"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsDialog: document.querySelector("#settingsDialog"),
  sourceLink: document.querySelector("#sourceLink"),
  statusBadge: document.querySelector("#statusBadge"),
  summaryZhInput: document.querySelector("#summaryZhInput"),
  metricAverage: document.querySelector("#metricAverage"),
  metricActiveDays: document.querySelector("#metricActiveDays"),
  metricChange: document.querySelector("#metricChange"),
  metricDirect: document.querySelector("#metricDirect"),
  metricPeriod: document.querySelector("#metricPeriod"),
  metricPeriodLabel: document.querySelector("#metricPeriodLabel"),
  metricToday: document.querySelector("#metricToday"),
  titleZhInput: document.querySelector("#titleZhInput"),
  topPaths: document.querySelector("#topPaths"),
  topReferrers: document.querySelector("#topReferrers"),
  toast: document.querySelector("#toast"),
  translationFallbackItems: document.querySelector("#translationFallbackItems"),
  translationPendingCount: document.querySelector("#translationPendingCount"),
  translationStatusCard: document.querySelector("#translationStatusCard"),
  translationStatusDescription: document.querySelector("#translationStatusDescription"),
  translationStatusTitle: document.querySelector("#translationStatusTitle"),
  translationUpdated: document.querySelector("#translationUpdated"),
  translationView: document.querySelector("#translationView"),
  typeInput: document.querySelector("#typeInput"),
  openFallbackWorkbenchButton: document.querySelector("#openFallbackWorkbenchButton"),
  workerUrlInput: document.querySelector("#workerUrlInput"),
};

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 3200);
}

function workerUrl() {
  return (localStorage.getItem("piasnewsWorkerUrl") || "").replace(/\/$/, "");
}

function adminKey() {
  return sessionStorage.getItem("piasnewsAdminKey") || "";
}

async function loadRuntimeWorkerUrl() {
  if (workerUrl()) return;
  try {
    const response = await fetch("../data/runtime-config.json", { cache: "no-store" });
    if (!response.ok) return;
    const config = await response.json();
    const runtimeUrl = String(config?.analytics_url || "").trim().replace(/\/$/, "");
    if (runtimeUrl.startsWith("https://")) localStorage.setItem("piasnewsWorkerUrl", runtimeUrl);
  } catch {
    // Local previews may not include runtime config; connection settings remain available.
  }
}

function updateConnectionState() {
  const endpointConfigured = Boolean(workerUrl());
  const keyConfigured = Boolean(adminKey());
  if (!endpointConfigured) {
    elements.connectionState.textContent = "未配置管理接口";
  } else if (!keyConfigured) {
    elements.connectionState.textContent = "管理接口已配置 · 未登录";
  } else {
    elements.connectionState.textContent = "正在验证管理权限…";
  }
  elements.connectionState.style.color = "var(--muted)";
}

function can(permission) {
  return Boolean(state.session?.permissions?.[permission]);
}

function renderAuthenticatedSession(session) {
  elements.roleBadge.textContent = `${session.user} · ${session.role}`;
  elements.connectionState.textContent = "管理接口已连接";
  elements.connectionState.style.color = "var(--success)";
}

async function loadSession({ force = false } = {}) {
  if (!workerUrl()) {
    state.session = null;
    elements.roleBadge.textContent = "本地只读";
    return null;
  }
  if (!adminKey()) {
    state.session = null;
    elements.roleBadge.textContent = "未登录";
    return null;
  }
  if (!force && state.session) {
    renderAuthenticatedSession(state.session);
    return state.session;
  }
  if (state.sessionValidation) return state.sessionValidation;

  const previousSession = state.session;
  state.sessionValidation = (async () => {
    try {
      const response = await fetch(`${workerUrl()}/session`, {
        headers: { Authorization: `Bearer ${adminKey()}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(payload.error || `权限接口返回 ${response.status}`);
        error.status = response.status;
        throw error;
      }
      state.session = payload;
      renderAuthenticatedSession(payload);
      return payload;
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        state.session = null;
        elements.roleBadge.textContent = "认证失败";
        elements.connectionState.textContent = "管理员密钥无效或权限不足";
        elements.connectionState.style.color = "var(--danger)";
      } else if (previousSession) {
        state.session = previousSession;
        renderAuthenticatedSession(previousSession);
      } else {
        elements.roleBadge.textContent = "连接异常";
        elements.connectionState.textContent = "管理接口暂时无法连接";
        elements.connectionState.style.color = "var(--danger)";
      }
      showToast(error.message);
      return state.session;
    } finally {
      state.sessionValidation = null;
    }
  })();
  return state.sessionValidation;
}

function formatAnalyticsTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function renderRankTable(rows, key, emptyText) {
  if (!rows.length) return `<p class="analytics-empty">${escapeHtml(emptyText)}</p>`;
  return `
    <table class="rank-table">
      <thead><tr><th>名称</th><th>PV</th></tr></thead>
      <tbody>${rows.map((row) => `
        <tr><td>${escapeHtml(row[key])}</td><td>${Number(row.views).toLocaleString("zh-CN")}</td></tr>
      `).join("")}</tbody>
    </table>`;
}

function shiftAnalyticsDay(value, amount) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return date.toISOString().slice(0, 10);
}

function formatAnalyticsDay(value, withYear = false) {
  const [year, month, day] = value.split("-");
  return withYear ? `${year}/${month}/${day}` : `${month}/${day}`;
}

function niceChartMaximum(value) {
  if (value <= 4) return 4;
  if (value < 20) return Math.ceil(value / 4) * 4;
  return Math.ceil(value / 10) * 10;
}

function renderLineChart(daily) {
  const width = 1000;
  const height = 280;
  const margin = { top: 22, right: 18, bottom: 42, left: 50 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const maximum = niceChartMaximum(Math.max(1, ...daily.map((entry) => Number(entry.views))));
  const x = (index) => margin.left + (daily.length === 1 ? plotWidth / 2 : (index / (daily.length - 1)) * plotWidth);
  const y = (views) => margin.top + plotHeight - (Number(views) / maximum) * plotHeight;
  const points = daily.map((entry, index) => `${x(index).toFixed(1)},${y(entry.views).toFixed(1)}`).join(" ");
  const labelStep = daily.length <= 7 ? 1 : daily.length <= 30 ? 5 : 15;
  const yTicks = Array.from({ length: 5 }, (_, index) => Math.round((maximum / 4) * index));
  const xLabels = daily.map((entry, index) => {
    if (index % labelStep !== 0 && index !== daily.length - 1) return "";
    return `<text class="chart-axis-label" x="${x(index)}" y="${height - 12}" text-anchor="middle">${formatAnalyticsDay(entry.day)}</text>`;
  }).join("");
  const grid = yTicks.map((tick) => {
    const tickY = y(tick);
    return `<g><line class="chart-grid-line" x1="${margin.left}" y1="${tickY}" x2="${width - margin.right}" y2="${tickY}"></line><text class="chart-axis-label" x="${margin.left - 10}" y="${tickY + 4}" text-anchor="end">${tick}</text></g>`;
  }).join("");
  const pointsMarkup = daily.map((entry, index) => `
    <circle class="chart-point" cx="${x(index)}" cy="${y(entry.views)}" r="${daily.length <= 30 ? 4 : 2.5}">
      <title>${entry.day}：${entry.views} PV</title>
    </circle>`).join("");

  return `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true" focusable="false">
    ${grid}
    <polyline class="chart-line" points="${points}"></polyline>
    ${pointsMarkup}
    ${xLabels}
  </svg>`;
}

function renderAnalytics(payload) {
  const metrics = payload.metrics;
  state.analyticsRange = payload.range;
  elements.metricToday.textContent = Number(metrics.today).toLocaleString("zh-CN");
  elements.metricPeriod.textContent = Number(metrics.period).toLocaleString("zh-CN");
  elements.metricPeriodLabel.textContent = `${payload.days} 天 PV`;
  elements.metricAverage.textContent = Number(metrics.average_per_day).toLocaleString("zh-CN");
  elements.metricActiveDays.textContent = `${metrics.active_days} / ${payload.days}`;
  elements.metricDirect.textContent = `${metrics.direct_percent}%`;
  elements.metricChange.textContent = metrics.change_percent == null
    ? payload.comparison?.available ? "无可比基数" : "超出保留期"
    : `${metrics.change_percent > 0 ? "+" : ""}${metrics.change_percent}%`;
  elements.metricChange.className = metrics.change_percent > 0
    ? "metric-up"
    : metrics.change_percent < 0
      ? "metric-down"
      : "";

  elements.analyticsChart.innerHTML = renderLineChart(payload.daily);
  elements.analyticsChart.setAttribute(
    "aria-label",
    `${payload.range.start} 至 ${payload.range.end}，共 ${metrics.period} PV，峰值 ${metrics.peak_day} ${metrics.peak_views} PV`,
  );
  elements.analyticsPeak.textContent = `峰值 ${formatAnalyticsDay(metrics.peak_day, true)} · ${metrics.peak_views} PV`;
  elements.analyticsRange.textContent = `${formatAnalyticsDay(payload.range.start, true)} — ${formatAnalyticsDay(payload.range.end, true)}`;
  elements.analyticsPrevious.disabled = payload.range.start <= payload.retention.start;
  elements.analyticsNext.disabled = payload.range.end >= payload.retention.end;

  elements.topPaths.innerHTML = renderRankTable(payload.top_paths || [], "path", "当前周期没有页面访问。");
  elements.topReferrers.innerHTML = renderRankTable(
    payload.top_referrers || [],
    "referrer_host",
    "当前周期没有可识别的外部来源。",
  );
  elements.analyticsUpdated.textContent = `统计更新于 ${formatAnalyticsTime(payload.generated_at)} 北京时间`;
  elements.analyticsMessage.hidden = true;
  elements.analyticsContent.hidden = false;
}

async function loadAnalytics() {
  elements.refreshButton.disabled = true;
  elements.analyticsContent.hidden = true;
  elements.analyticsMessage.hidden = false;
  if (!workerUrl() || !adminKey()) {
    elements.analyticsMessage.textContent = "请先在连接设置中配置 Worker URL 和管理员密钥。";
    elements.analyticsUpdated.textContent = "等待读取统计数据";
    elements.refreshButton.disabled = false;
    return;
  }

  elements.analyticsMessage.textContent = "正在读取访问统计...";
  try {
    const query = new URLSearchParams({ days: String(state.analyticsDays) });
    if (state.analyticsEnd) query.set("end", state.analyticsEnd);
    const response = await fetch(`${workerUrl()}/analytics/summary?${query}`, {
      headers: { Authorization: `Bearer ${adminKey()}` },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `统计接口返回 ${response.status}`);
    renderAnalytics(payload);
  } catch (error) {
    elements.analyticsMessage.textContent = `无法读取访问统计：${error.message}`;
    elements.analyticsUpdated.textContent = "统计读取失败";
  } finally {
    elements.refreshButton.disabled = false;
  }
}

function setView(view) {
  if (!["review", "hot", "translation", "analytics"].includes(view)) return;
  state.activeView = view;
  elements.reviewView.hidden = view !== "review";
  elements.hotView.hidden = view !== "hot";
  elements.translationView.hidden = view !== "translation";
  elements.analyticsView.hidden = view !== "analytics";
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === view);
    button.setAttribute("aria-current", button.dataset.view === view ? "page" : "false");
  });
  if (view === "analytics") loadAnalytics();
  if (view === "hot") loadHotWorkbench();
  if (view === "translation") loadTranslationFallback();
}

function renderTranslationFallback(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const pending = Number(payload?.pending_count || items.length || 0);
  const ignored = Number(payload?.ignored_non_text_count || 0);
  const requiresAction = payload?.status === "action_required" && pending > 0;
  state.translationFallback = payload;
  elements.translationPendingCount.textContent = `${pending} 条`;
  elements.translationStatusCard.classList.toggle("needs-action", requiresAction);
  elements.translationStatusCard.classList.toggle("is-healthy", !requiresAction);
  elements.translationStatusTitle.textContent = requiresAction
    ? `发现 ${pending} 条内容需要人工兜底`
    : "大模型翻译正常，无需人工兜底";
  elements.translationStatusDescription.textContent = requiresAction
    ? "可由 publisher 或 admin 人工打开 Workbench；系统不会定时弹出页面。"
    : `${ignored ? `已忽略 ${ignored} 条纯链接或纯表情内容。` : "当前没有缺失的大模型译文。"} 定时启动保持关闭。`;
  elements.translationUpdated.textContent = payload?.generated_at
    ? `状态更新于 ${formatAnalyticsTime(payload.generated_at)} 北京时间`
    : "兜底状态缺少更新时间";
  elements.openFallbackWorkbenchButton.disabled = !requiresAction || !can("publish");
  elements.openFallbackWorkbenchButton.title = !requiresAction
    ? "当前没有需要兜底的内容"
    : can("publish")
      ? "打开只包含真实缺口的 Workbench"
      : "需要 publisher 或 admin 权限";
  elements.translationFallbackItems.innerHTML = items.length
    ? items.map((item) => `
        <article class="translation-fallback-item">
          <div>
            <span>${escapeHtml(item.dataset === "social" ? "粉丝内容" : "新闻内容")}</span>
            <strong>${escapeHtml(item.source_name || "未知来源")}</strong>
          </div>
          <p>${escapeHtml(item.source_text)}</p>
          ${item.source_url ? `<a href="${escapeHtml(item.source_url)}" target="_blank" rel="noreferrer">查看原内容</a>` : ""}
        </article>`).join("")
    : '<p class="analytics-empty">当前没有需要人工兜底的内容。</p>';
}

async function loadTranslationFallback() {
  elements.refreshButton.disabled = true;
  try {
    const payload = await fetchLocalJson([
      "../data/translation-fallback.json",
      "../../data/translation-fallback.json",
    ]);
    renderTranslationFallback(payload);
  } catch (error) {
    state.translationFallback = null;
    elements.translationStatusCard.classList.remove("is-healthy", "needs-action");
    elements.translationStatusTitle.textContent = "无法读取翻译兜底状态";
    elements.translationStatusDescription.textContent = error.message;
    elements.translationUpdated.textContent = "状态读取失败";
    elements.openFallbackWorkbenchButton.disabled = true;
  } finally {
    elements.refreshButton.disabled = false;
  }
}

function openFallbackWorkbench() {
  const payload = state.translationFallback;
  if (!payload || payload.status !== "action_required" || !payload.pending_count) {
    showToast("当前没有需要人工兜底的内容。");
    return;
  }
  if (!can("publish")) {
    showToast("需要 publisher 或 admin 权限才能人工启动兜底。");
    return;
  }
  const path = payload.workbench_path || "../immersive/translation-workbench.html";
  window.open(new URL(path, window.location.href), "_blank", "noopener");
  showToast("已打开兜底 Workbench；请人工确认后再启动沉浸式翻译。");
}

async function fetchLocalJson(paths) {
  let lastError;
  for (const path of paths) {
    try {
      const response = await fetch(new URL(path, window.location.href), { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Unable to load local JSON data.");
}

function hotOverride(eventId) {
  return state.hotOverrides.find((row) => row.event_id === eventId && row.status === "draft")
    || state.hotOverrides.find((row) => row.event_id === eventId && row.status === "active")
    || null;
}

function activeHotOverride(eventId) {
  return state.hotOverrides.find((row) => row.event_id === eventId && row.status === "active") || null;
}

function hotEvent(eventId) {
  return state.hotEvents.find((row) => row.event_id === eventId) || null;
}

function allHotEvents() {
  const rows = [...state.hotEvents];
  const overrideEventIds = [...new Set(state.hotOverrides.map((row) => row.event_id).filter(Boolean))];
  for (const eventId of overrideEventIds) {
    if (rows.some((row) => row.event_id === eventId)) continue;
    const override = hotOverride(eventId);
    const activeOverride = activeHotOverride(eventId);
    if (!override) continue;
    rows.push({
      event_id: eventId,
      hot_word_zh: override.hot_word_zh,
      hot_word_en: override.hot_word_en,
      heat: override.heat || 0,
      rank: activeOverride?.pinned_rank || override.pinned_rank || null,
      source_labels: override.source_labels || [],
      items: override.content_items || [],
      manual_event: Boolean(override.manual_event),
      hidden: Boolean(activeOverride?.hidden),
    });
  }
  return rows;
}

function editableHotItem(item = {}) {
  return {
    item_id: item.item_id || `manual-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    dataset: item.dataset || "manual",
    source_type: item.source_type || "fan",
    source: item.source || "",
    title: item.title || "",
    title_zh: item.title_zh || "",
    summary: item.summary || "",
    summary_zh: item.summary_zh || "",
    url: item.url || "",
    published_at: item.published_at || null,
    image_url: item.image_url || null,
    video_url: item.video_url || null,
    video_poster_url: item.video_poster_url || null,
    manual: Boolean(item.manual || item.dataset === "manual"),
  };
}

function selectedHotContent() {
  return state.editingHotItems.find((item) => item.item_id === state.selectedHotItemId) || null;
}

function localDateTimeValue(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function isoDateTimeValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function safePreviewUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch (_error) {
    return "";
  }
}

function renderHotContentMediaPreview() {
  const imageValue = elements.hotContentImageInput.value.trim();
  const videoValue = elements.hotContentVideoInput.value.trim();
  const posterValue = elements.hotContentPosterInput.value.trim();
  const imageUrl = safePreviewUrl(imageValue);
  const videoUrl = safePreviewUrl(videoValue);
  const posterUrl = safePreviewUrl(posterValue) || imageUrl;
  const hasInvalidUrl = [imageValue, videoValue, posterValue].some((value) => value && !safePreviewUrl(value));

  elements.hotContentMediaPreview.hidden = !(imageValue || videoValue || posterValue);
  if (elements.hotContentMediaPreview.hidden) {
    elements.hotContentMediaPreviewFrame.innerHTML = "";
    elements.hotContentMediaPreviewStatus.textContent = "";
    return;
  }
  if (hasInvalidUrl) {
    elements.hotContentMediaPreviewFrame.innerHTML = '<span class="hot-media-preview-placeholder">无可用预览</span>';
    elements.hotContentMediaPreviewStatus.textContent = "仅支持 HTTPS 图片、视频与封面链接。";
    return;
  }
  if (videoUrl) {
    elements.hotContentMediaPreviewFrame.innerHTML = `${posterUrl ? `<img src="${escapeHtml(posterUrl)}" alt="">` : '<span class="hot-media-preview-placeholder">▶</span>'}<span class="hot-media-preview-play">▶</span>`;
    elements.hotContentMediaPreviewStatus.textContent = posterUrl ? "视频封面预览；前台点击内容卡后打开原平台。" : "未填写视频封面；前台将显示轻量播放占位。";
    return;
  }
  if (imageUrl) {
    elements.hotContentMediaPreviewFrame.innerHTML = `<img src="${escapeHtml(imageUrl)}" alt="">`;
    elements.hotContentMediaPreviewStatus.textContent = "图片直接引用原始 HTTPS 地址，不下载到本站。";
    return;
  }
  elements.hotContentMediaPreviewFrame.innerHTML = '<span class="hot-media-preview-placeholder">无可用预览</span>';
  elements.hotContentMediaPreviewStatus.textContent = "填写图片 URL，或为视频补充封面 URL。";
}

function syncSourceLabelsFromContent() {
  const labels = new Set(state.editingHotItems.map((item) => ({ official: "官", media: "媒", fan: "粉" })[item.source_type]));
  document.querySelectorAll('[name="hotSourceLabel"]').forEach((input) => {
    input.checked = labels.has(input.value);
  });
}

function renderHotContentList() {
  elements.hotContentCount.textContent = `${state.editingHotItems.length} 条`;
  elements.hotContentList.innerHTML = state.editingHotItems.map((item, index) => `
    <button class="hot-content-item${item.item_id === state.selectedHotItemId ? " is-selected" : ""}" type="button" data-hot-content-id="${escapeHtml(item.item_id)}">
      <span>${index + 1}</span>
      <span><strong>${escapeHtml(item.title_zh || item.title || "未命名内容")}</strong><small>${escapeHtml(item.source || "未填写来源")}</small></span>
      <em>${escapeHtml(({ official: "官", media: "媒", fan: "粉" })[item.source_type] || "—")}</em>
    </button>`).join("") || '<p class="hot-content-list-empty">还没有内容，可新增一条。</p>';
  elements.hotContentList.querySelectorAll("[data-hot-content-id]").forEach((button) => {
    button.addEventListener("click", () => selectHotContent(button.dataset.hotContentId));
  });
}

function selectHotContent(itemId) {
  state.selectedHotItemId = itemId;
  const item = selectedHotContent();
  elements.hotContentEmpty.hidden = Boolean(item);
  elements.hotContentFields.hidden = !item;
  if (!item) {
    renderHotContentList();
    return;
  }
  elements.hotContentEditorTitle.textContent = item.title_zh || item.title || "新内容";
  elements.hotContentTypeInput.value = item.source_type;
  elements.hotContentSourceInput.value = item.source;
  elements.hotContentTitleZhInput.value = item.title_zh;
  elements.hotContentTitleEnInput.value = item.title;
  elements.hotContentSummaryZhInput.value = item.summary_zh;
  elements.hotContentSummaryEnInput.value = item.summary;
  elements.hotContentUrlInput.value = item.url;
  elements.hotContentPublishedInput.value = localDateTimeValue(item.published_at);
  elements.hotContentImageInput.value = item.image_url || "";
  elements.hotContentVideoInput.value = item.video_url || "";
  elements.hotContentPosterInput.value = item.video_poster_url || "";
  renderHotContentMediaPreview();
  renderHotContentList();
}

function syncSelectedHotContent() {
  const item = selectedHotContent();
  if (!item) return;
  Object.assign(item, {
    source_type: elements.hotContentTypeInput.value,
    source: elements.hotContentSourceInput.value.trim(),
    title_zh: elements.hotContentTitleZhInput.value.trim(),
    title: elements.hotContentTitleEnInput.value.trim(),
    summary_zh: elements.hotContentSummaryZhInput.value.trim(),
    summary: elements.hotContentSummaryEnInput.value.trim(),
    url: elements.hotContentUrlInput.value.trim(),
    published_at: isoDateTimeValue(elements.hotContentPublishedInput.value),
    image_url: elements.hotContentImageInput.value.trim() || null,
    video_url: elements.hotContentVideoInput.value.trim() || null,
    video_poster_url: elements.hotContentPosterInput.value.trim() || null,
  });
  elements.hotContentEditorTitle.textContent = item.title_zh || item.title || "新内容";
}

function addHotContent() {
  if (!can("edit")) return;
  syncSelectedHotContent();
  const item = editableHotItem({ manual: true });
  state.editingHotItems.push(item);
  state.selectedHotItemId = item.item_id;
  syncSourceLabelsFromContent();
  selectHotContent(item.item_id);
  elements.hotContentSourceInput.focus();
}

function deleteHotContent() {
  if (!can("edit") || !state.selectedHotItemId) return;
  const index = state.editingHotItems.findIndex((item) => item.item_id === state.selectedHotItemId);
  if (index < 0) return;
  state.editingHotItems.splice(index, 1);
  state.selectedHotItemId = state.editingHotItems[index]?.item_id || state.editingHotItems[index - 1]?.item_id || null;
  syncSourceLabelsFromContent();
  selectHotContent(state.selectedHotItemId);
}

function renderHotAdminList() {
  const rows = allHotEvents();
  elements.hotEventCount.textContent = `${rows.length} 条`;
  elements.hotAdminList.innerHTML = rows.map((event) => {
    const selected = event.event_id === state.selectedHotId ? " is-selected" : "";
    const override = hotOverride(event.event_id);
    const activeOverride = activeHotOverride(event.event_id);
    const hidden = Boolean(activeOverride?.hidden || event.hidden);
    const shownRank = override?.pinned_rank || event.rank || "—";
    return `
      <button class="hot-admin-item${selected}" type="button" data-hot-event-id="${escapeHtml(event.event_id)}">
        <span class="hot-admin-rank">${shownRank}</span>
        <span class="hot-admin-item-main">
          <strong>${escapeHtml(override?.hot_word_zh || event.hot_word_zh)}</strong>
          <small>${escapeHtml(`${hidden ? "前台隐藏 · " : ""}${override?.status === "draft" ? "有未发布草稿 · " : ""}${override?.pinned_rank ? `人工第 ${override.pinned_rank} 位 · ` : ""}${(override?.source_labels || event.source_labels || []).join(" · ") || "无来源标签"}${event.review_needed && !override ? " · 待补媒体" : ""}`)}</small>
        </span>
        <span class="hot-admin-heat">${override?.heat ?? event.heat ?? 0}</span>
      </button>`;
  }).join("") || '<p class="queue-empty">当前没有热点事件。</p>';
  elements.hotAdminList.querySelectorAll("[data-hot-event-id]").forEach((button) => {
    button.addEventListener("click", () => selectHotEvent(button.dataset.hotEventId));
  });
}

function setHotFormAccess() {
  const editable = can("edit");
  elements.newHotEventButton.disabled = !editable;
  elements.saveHotDraftButton.disabled = !editable;
  elements.activateHotOverrideButton.disabled = !can("publish");
  elements.addHotContentButton.disabled = !editable;
  elements.deleteHotContentButton.disabled = !editable || !state.selectedHotItemId;
  elements.hotEventForm.querySelectorAll("input, textarea").forEach((input) => {
    input.disabled = !editable;
  });
  elements.hotEventForm.querySelectorAll("select").forEach((input) => {
    input.disabled = !editable;
  });
  elements.hotActionHint.textContent = !state.session
    ? "当前为本地只读预览。连接管理接口后按角色开放编辑能力。"
    : can("publish")
      ? "可保存草稿或启用覆盖；启用后会自动触发正式站更新，通常需要 2–3 分钟。"
      : can("edit")
        ? "当前角色可保存草稿；启用覆盖需要 publisher 或 admin。"
        : "当前角色只有查看权限。";
}

function selectHotEvent(eventId) {
  state.selectedHotId = eventId;
  const event = hotEvent(eventId) || allHotEvents().find((row) => row.event_id === eventId);
  if (!event) return;
  const override = hotOverride(eventId);
  state.selectedHotVersion = override?.updated_at || null;
  state.manualHotEvent = Boolean(event.manual_event || override?.manual_event);
  elements.hotEditorEmpty.hidden = true;
  elements.hotEventForm.hidden = false;
  elements.hotEventId.textContent = eventId;
  elements.hotEditorTitle.textContent = override?.hot_word_zh || event.hot_word_zh;
  elements.hotWordZhInput.value = override?.hot_word_zh || event.hot_word_zh || "";
  elements.hotWordEnInput.value = override?.hot_word_en || event.hot_word_en || "";
  elements.hotHeatInput.value = override?.heat ?? "";
  elements.hotHeatInput.placeholder = `算法热度 ${event.heat ?? 0}`;
  elements.hotPinnedRankInput.value = override?.pinned_rank ?? "";
  elements.hotHiddenInput.checked = Boolean(override?.hidden);
  elements.hotReasonInput.value = override?.reason || "";
  state.editingHotItems = (override?.content_items || event.items || []).map(editableHotItem);
  state.selectedHotItemId = state.editingHotItems[0]?.item_id || null;
  const labels = override?.source_labels || event.source_labels || [];
  document.querySelectorAll('[name="hotSourceLabel"]').forEach((input) => {
    input.checked = labels.includes(input.value);
  });
  elements.hotOverrideStatus.textContent = override
    ? (override.status === "active" ? "已启用覆盖" : "覆盖草稿")
    : event.review_needed ? "待补媒体" : "算法结果";
  const editorMeta = override?.updated_by
    ? ` · 最近由 ${override.updated_by} 于 ${formatAnalyticsTime(override.updated_at)} 修改`
    : "";
  elements.hotEventMeta.textContent = `算法热度 ${event.heat ?? 0} · ${state.editingHotItems.length} 条关联信息${event.review_needed ? " · 原始短文案缺少媒体证据，未进入前台" : ""}${editorMeta}`;
  const anchor = event.items?.find((item) => item.item_id === event.anchor_item_id) || event.items?.[0];
  elements.hotSourceLink.hidden = !anchor?.url;
  if (anchor?.url) elements.hotSourceLink.href = anchor.url;
  selectHotContent(state.selectedHotItemId);
  setHotFormAccess();
  renderHotAdminList();
}

function newManualHotEvent() {
  if (!can("edit")) return;
  const eventId = `evt-manual-${Date.now().toString(36)}`;
  state.hotOverrides.push({
    event_id: eventId,
    status: "draft",
    manual_event: true,
    hot_word_zh: "",
    hot_word_en: "",
    heat: 0,
    source_labels: [],
  });
  selectHotEvent(eventId);
  elements.hotWordZhInput.focus();
}

async function loadHotWorkbench() {
  elements.refreshButton.disabled = true;
  elements.hotAdminMessage.hidden = false;
  elements.hotAdminWorkspace.hidden = true;
  elements.hotAdminMessage.textContent = "正在读取热榜和权限配置...";
  try {
    const [hotPayload] = await Promise.all([
      fetchLocalJson(["../data/hot-events.json", "../../data/hot-events.json"]),
      loadSession(),
    ]);
    let overridesPayload = { changes: [] };
    if (state.session && workerUrl()) {
      const response = await fetch(`${workerUrl()}/hot-events/config`, {
        headers: { Authorization: `Bearer ${adminKey()}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `配置接口返回 ${response.status}`);
      overridesPayload = payload.overrides || overridesPayload;
    } else {
      try {
        overridesPayload = await fetchLocalJson(["../data/hot-event-overrides.json", "../../data/hot-event-overrides.json"]);
      } catch (_error) {
        overridesPayload = { changes: [] };
      }
    }
    state.hotEvents = [...(hotPayload.events || []), ...(hotPayload.review_needed_events || [])];
    state.hotOverrides = overridesPayload.changes || [];
    state.selectedHotId = state.selectedHotId || allHotEvents()[0]?.event_id || null;
    elements.hotAdminMessage.hidden = true;
    elements.hotAdminWorkspace.hidden = false;
    renderHotAdminList();
    if (state.selectedHotId) selectHotEvent(state.selectedHotId);
    else setHotFormAccess();
  } catch (error) {
    elements.hotAdminMessage.textContent = `无法读取热榜工作台：${error.message}`;
  } finally {
    elements.refreshButton.disabled = false;
  }
}

function collectHotChange() {
  syncSelectedHotContent();
  for (const item of state.editingHotItems) {
    if (!item.source || !item.url || !(item.title || item.title_zh)) {
      throw new Error("每条内容都需要来源、标题和内容原链接。");
    }
  }
  return {
    manual_event: state.manualHotEvent,
    hot_word_zh: elements.hotWordZhInput.value.trim(),
    hot_word_en: elements.hotWordEnInput.value.trim() || null,
    source_labels: [...document.querySelectorAll('[name="hotSourceLabel"]:checked')].map((input) => input.value),
    heat: elements.hotHeatInput.value === "" ? null : Number(elements.hotHeatInput.value),
    pinned_rank: elements.hotPinnedRankInput.value === "" ? null : Number(elements.hotPinnedRankInput.value),
    hidden: elements.hotHiddenInput.checked,
    content_items: state.editingHotItems.map((item) => ({ ...item })),
    reason: elements.hotReasonInput.value.trim(),
  };
}

async function submitHotChange(status) {
  if (!state.selectedHotId || !elements.hotEventForm.reportValidity()) return;
  if (!workerUrl() || !adminKey()) {
    openSettings();
    showToast("请先配置管理接口。");
    return;
  }
  if (status === "active" && !can("publish")) {
    showToast("当前角色没有启用覆盖的权限。");
    return;
  }
  if (!can("edit")) {
    showToast("当前角色没有编辑权限。");
    return;
  }
  elements.saveHotDraftButton.disabled = true;
  elements.activateHotOverrideButton.disabled = true;
  try {
    const change = collectHotChange();
    const response = await fetch(`${workerUrl()}/hot-events/change`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        event_id: state.selectedHotId,
        status,
        expected_updated_at: state.selectedHotVersion,
        change,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (response.status === 409) {
      await loadHotWorkbench();
      throw new Error("这条热点已被其他管理员修改，已刷新为最新版，请核对后重新提交。");
    }
    if (!response.ok) throw new Error(payload.error || `配置接口返回 ${response.status}`);
    showToast(status === "active" ? "已提交启用覆盖，正在自动发布线上。" : "已提交热榜草稿，不发布线上。");
  } catch (error) {
    showToast(error.message);
  } finally {
    setHotFormAccess();
  }
}

async function fetchCandidatePayload() {
  const urls = [
    new URL("../data/history-candidates.json", window.location.href),
    new URL("../../data/history-candidates.json", window.location.href),
  ];
  let lastError;
  for (const url of urls) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Unable to load candidate data.");
}

function selectedCandidate() {
  return state.candidates.find((candidate) => candidate.id === state.selectedId) || null;
}

function filteredCandidates() {
  if (state.filter === "all") return state.candidates;
  return state.candidates.filter((candidate) => candidate.candidate.status === state.filter);
}

function displayTitle(candidate) {
  return candidate.title_zh || candidate.title;
}

function renderQueue() {
  const candidates = filteredCandidates();
  const pending = state.candidates.filter((candidate) => candidate.candidate.status === "pending").length;
  elements.pendingCount.textContent = `${pending} 待审`;

  if (!candidates.length) {
    elements.candidateList.innerHTML = '<p class="queue-empty">当前筛选下没有事件。</p>';
    return;
  }

  elements.candidateList.innerHTML = candidates
    .map((candidate) => {
      const meta = candidate.candidate;
      const selected = candidate.id === state.selectedId ? " is-selected" : "";
      return `
        <button class="candidate-item${selected}" type="button" data-candidate-id="${escapeHtml(candidate.id)}">
          <div class="candidate-item-top">
            <span class="status-badge ${meta.status}">${STATUS_LABELS[meta.status]}</span>
            <span class="candidate-source">候选分 ${meta.score}</span>
          </div>
          <h3>${escapeHtml(displayTitle(candidate))}</h3>
          <div class="candidate-item-bottom">
            <span>${escapeHtml(candidate.source)}</span>
            <time datetime="${candidate.date}">${candidate.date}</time>
          </div>
        </button>`;
    })
    .join("");

  elements.candidateList.querySelectorAll("[data-candidate-id]").forEach((button) => {
    button.addEventListener("click", () => selectCandidate(button.dataset.candidateId));
  });
}

function escapeHtml(value) {
  const node = document.createElement("span");
  node.textContent = String(value ?? "");
  return node.innerHTML;
}

function selectCandidate(candidateId) {
  state.selectedId = candidateId;
  const candidate = selectedCandidate();
  if (!candidate) return;

  elements.emptyState.hidden = true;
  elements.reviewForm.hidden = false;
  elements.editorTitle.textContent = displayTitle(candidate);
  elements.originalTitle.textContent = `原始标题：${candidate.title}`;
  elements.titleZhInput.value = candidate.title_zh || "";
  elements.dateInput.value = candidate.date;
  elements.typeInput.value = candidate.type;
  elements.summaryZhInput.value = candidate.summary_zh || "";
  elements.sourceLink.href = candidate.url;
  elements.sourceLink.textContent = `查看来源：${candidate.source}`;
  elements.reasonZhInput.value = candidate.selection.inclusion_reason_zh || "";
  elements.decisionReasonInput.value = candidate.candidate.decision_reason || "";

  const status = candidate.candidate.status;
  elements.statusBadge.textContent = STATUS_LABELS[status];
  elements.statusBadge.className = `status-badge ${status}`;
  elements.candidateScore.textContent = `规则分 ${candidate.candidate.score}`;

  const isPending = status === "pending" && !state.queuedIds.has(candidate.id);
  elements.approveButton.disabled = !isPending;
  elements.rejectButton.disabled = !isPending;
  elements.actionHint.textContent = state.queuedIds.has(candidate.id)
    ? "审核工作流已提交，正在等待 GitHub Pages 更新。"
    : isPending
      ? "批准后将由 GitHub Actions 校验并写入正式历史库。"
      : `该事件已${STATUS_LABELS[status]}。`;
  renderQueue();
}

async function loadCandidates({ preserveSelection = true } = {}) {
  elements.refreshButton.disabled = true;
  elements.queueUpdated.textContent = "正在读取...";
  try {
    const payload = await fetchCandidatePayload();
    state.candidates = payload.candidates || [];
    elements.queueUpdated.textContent = `数据更新于 ${new Date(payload.generated_at).toLocaleString("zh-CN")}`;
    if (!preserveSelection || !selectedCandidate()) {
      state.selectedId = filteredCandidates()[0]?.id || null;
    }
    renderQueue();
    if (state.selectedId) selectCandidate(state.selectedId);
  } catch (error) {
    elements.queueUpdated.textContent = "读取失败";
    elements.candidateList.innerHTML = `<p class="queue-error">无法读取候选数据：${escapeHtml(error.message)}</p>`;
  } finally {
    elements.refreshButton.disabled = false;
  }
}

function collectReview({ approval }) {
  const review = {
    decision_reason: elements.decisionReasonInput.value.trim() || null,
  };
  if (!approval) return review;

  return {
    ...review,
    title_zh: elements.titleZhInput.value.trim(),
    date: elements.dateInput.value,
    summary_zh: elements.summaryZhInput.value.trim(),
    type: elements.typeInput.value,
    inclusion_reason_zh: elements.reasonZhInput.value.trim(),
  };
}

async function submitDecision(decision) {
  const candidate = selectedCandidate();
  if (!candidate) return;
  if (!workerUrl() || !adminKey()) {
    openSettings();
    showToast("请先配置审核接口。");
    return;
  }

  let review;
  try {
    review = collectReview({ approval: decision === "approve" });
  } catch (error) {
    showToast(error.message);
    return;
  }

  elements.approveButton.disabled = true;
  elements.rejectButton.disabled = true;
  elements.actionHint.textContent = "正在提交审核工作流...";

  try {
    const response = await fetch(`${workerUrl()}/review`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${adminKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ candidate_id: candidate.id, decision, review }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `审核接口返回 ${response.status}`);
    state.queuedIds.add(candidate.id);
    selectCandidate(candidate.id);
    showToast(decision === "approve" ? "已提交批准，等待入库。" : "已提交拒绝。 ");
  } catch (error) {
    elements.approveButton.disabled = false;
    elements.rejectButton.disabled = false;
    elements.actionHint.textContent = "提交失败，请检查连接设置后重试。";
    showToast(error.message);
  }
}

function openSettings() {
  elements.workerUrlInput.value = workerUrl();
  elements.adminKeyInput.value = adminKey();
  elements.settingsDialog.showModal();
}

async function saveSettings() {
  if (!elements.workerUrlInput.reportValidity() || !elements.adminKeyInput.reportValidity()) return;
  localStorage.setItem("piasnewsWorkerUrl", elements.workerUrlInput.value.trim().replace(/\/$/, ""));
  sessionStorage.setItem("piasnewsAdminKey", elements.adminKeyInput.value);
  state.session = null;
  elements.settingsDialog.close();
  updateConnectionState();
  showToast("审核接口设置已保存。");
  await loadSession({ force: true });
  if (state.activeView === "analytics") loadAnalytics();
  if (state.activeView === "hot") loadHotWorkbench();
  if (state.activeView === "translation") loadTranslationFallback();
}

document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
    state.selectedId = filteredCandidates()[0]?.id || null;
    renderQueue();
    if (state.selectedId) {
      selectCandidate(state.selectedId);
    } else {
      elements.reviewForm.hidden = true;
      elements.emptyState.hidden = false;
    }
  });
});

elements.reviewForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitDecision("approve");
});
elements.rejectButton.addEventListener("click", () => {
  if (window.confirm("确认拒绝这条历史候选吗？")) submitDecision("reject");
});
elements.refreshButton.addEventListener("click", () => {
  if (state.activeView === "analytics") loadAnalytics();
  else if (state.activeView === "hot") loadHotWorkbench();
  else if (state.activeView === "translation") loadTranslationFallback();
  else loadCandidates();
});
elements.settingsButton.addEventListener("click", openSettings);
elements.saveSettingsButton.addEventListener("click", saveSettings);
elements.openFallbackWorkbenchButton.addEventListener("click", openFallbackWorkbench);
elements.newHotEventButton.addEventListener("click", newManualHotEvent);
elements.addHotContentButton.addEventListener("click", addHotContent);
elements.deleteHotContentButton.addEventListener("click", deleteHotContent);
elements.hotContentFields.addEventListener("input", () => {
  syncSelectedHotContent();
  renderHotContentMediaPreview();
  renderHotContentList();
});
elements.hotContentMediaPreview.addEventListener("error", (event) => {
  if (!(event.target instanceof HTMLImageElement)) return;
  event.target.remove();
  elements.hotContentMediaPreviewFrame.classList.add("is-unavailable");
  elements.hotContentMediaPreviewStatus.textContent = "远端图片暂时无法加载；保存后前台会自动降级为文字或播放占位。";
}, true);
elements.saveHotDraftButton.addEventListener("click", () => submitHotChange("draft"));
elements.hotEventForm.addEventListener("submit", (event) => {
  event.preventDefault();
  submitHotChange("active");
});

document.querySelectorAll("[data-view]").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

document.querySelectorAll("[data-analytics-days]").forEach((button) => {
  button.addEventListener("click", () => {
    state.analyticsDays = Number(button.dataset.analyticsDays);
    state.analyticsEnd = null;
    document.querySelectorAll("[data-analytics-days]").forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });
    loadAnalytics();
  });
});

elements.analyticsPrevious.addEventListener("click", () => {
  if (!state.analyticsRange) return;
  state.analyticsEnd = shiftAnalyticsDay(state.analyticsRange.start, -1);
  loadAnalytics();
});

elements.analyticsNext.addEventListener("click", () => {
  if (!state.analyticsRange) return;
  state.analyticsEnd = shiftAnalyticsDay(state.analyticsRange.end, state.analyticsDays);
  loadAnalytics();
});

async function initializeWorkbench() {
  await loadRuntimeWorkerUrl();
  updateConnectionState();
  await loadSession();
  loadCandidates({ preserveSelection: false });
}

initializeWorkbench();
