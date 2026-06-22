const CATEGORY_LABELS = {
  race: "比赛动态",
  team: "车队与赛车",
  interview: "采访与观点",
  contract: "合同与商业",
  fan: "车迷与场外",
  rumor: "围场传闻",
  other: "其他动态",
};

const CATEGORY_SUMMARIES = {
  race: "围绕比赛表现、策略、处罚或周末进程的报道。",
  team: "围绕 McLaren 赛车表现、升级与车队运作的报道。",
  interview: "来自车手、车队或围场相关人物的公开表达。",
  contract: "围绕合同、合作或商业关系的报道。",
  fan: "与车迷活动、社区或场外互动有关的信息。",
  rumor: "尚未得到官方确认，阅读时应与事实报道分开。",
  other: "与 Oscar Piastri 直接相关、但不属于主要赛道类别的信息。",
};

const state = {
  items: [],
  daily: null,
  history: [],
  calendar: null,
  displayRace: null,
  countdownTimer: null,
  generatedAt: null,
  activeMode: "short",
  analyticsReported: false,
};

const elements = {
  updatedAt: document.querySelector("#updatedAt"),
  windowLabel: document.querySelector("#windowLabel"),
  itemCount: document.querySelector("#itemCount"),
  loadingState: document.querySelector("#loadingState"),
  errorState: document.querySelector("#errorState"),
  errorMessage: document.querySelector("#errorMessage"),
  refreshButton: document.querySelector("#refreshButton"),
  retryButton: document.querySelector("#retryButton"),
  raceBoard: document.querySelector("#raceBoard"),
  raceRound: document.querySelector("#raceRound"),
  raceName: document.querySelector("#raceName"),
  raceLocation: document.querySelector("#raceLocation"),
  raceWeekend: document.querySelector("#raceWeekend"),
  raceStartTime: document.querySelector("#raceStartTime"),
  raceCalendarMeta: document.querySelector("#raceCalendarMeta"),
  countdownLabel: document.querySelector("#countdownLabel"),
  countdownDays: document.querySelector("#countdownDays"),
  countdownHours: document.querySelector("#countdownHours"),
  countdownMinutes: document.querySelector("#countdownMinutes"),
  countdownSeconds: document.querySelector("#countdownSeconds"),
  officialCalendarLink: document.querySelector("#officialCalendarLink"),
  tabs: [...document.querySelectorAll("[role=tab]")],
  panels: {
    short: document.querySelector("#panel-short"),
    standard: document.querySelector("#panel-standard"),
    deep: document.querySelector("#panel-deep"),
  },
};

function escapeHtml(value) {
  const node = document.createElement("span");
  node.textContent = String(value ?? "");
  return node.innerHTML;
}

function formatDateTime(value) {
  if (!value) return "未知";
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

function formatItemTime(value) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatRaceTime(value) {
  if (!value) return "时间待定";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function padded(value) {
  return String(Math.max(0, value)).padStart(2, "0");
}

function selectCountdownRace(calendar, now = Date.now()) {
  const races = Array.isArray(calendar?.races) ? calendar.races : [];
  const activeRace = races.find((race) => {
    const start = new Date(race.race_start).getTime();
    return start <= now && now < start + 3 * 60 * 60 * 1000;
  });
  if (activeRace) return activeRace;
  return races.find((race) => new Date(race.race_start).getTime() > now) || null;
}

function setRaceDetails(race) {
  state.displayRace = race;
  const qualifying = race.sessions?.qualifying;
  const scheduleParts = [];
  if (race.weekend_start) scheduleParts.push(`周末开始 ${formatRaceTime(race.weekend_start)}`);
  if (qualifying) scheduleParts.push(`排位 ${formatRaceTime(qualifying)}`);

  elements.raceRound.textContent = `ROUND ${race.round} · ${race.country_code}`;
  elements.raceName.textContent = race.name_zh || race.name;
  elements.raceLocation.textContent = [race.circuit, race.locality].filter(Boolean).join(" · ");
  elements.raceWeekend.textContent = scheduleParts.join(" · ");
  elements.raceStartTime.textContent = `正赛 ${formatRaceTime(race.race_start)} 北京时间`;
  elements.raceStartTime.dateTime = race.race_start;
  elements.raceCalendarMeta.textContent = `赛历更新于 ${formatDateTime(state.calendar.generated_at)} 北京时间`;
  elements.officialCalendarLink.href = state.calendar.source?.official_calendar_url || race.official_url;
}

function updateRaceCountdown() {
  const currentRace = selectCountdownRace(state.calendar);
  if (!currentRace) {
    elements.raceBoard.hidden = true;
    return;
  }
  if (currentRace.id !== state.displayRace?.id) setRaceDetails(currentRace);

  const now = Date.now();
  const start = new Date(currentRace.race_start).getTime();
  const remaining = Math.max(0, start - now);
  const live = start <= now && now < start + 3 * 60 * 60 * 1000;
  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  elements.raceBoard.classList.toggle("is-live", live);
  elements.countdownLabel.textContent = live ? "正赛进行中" : "距离正赛";
  elements.countdownDays.textContent = padded(days);
  elements.countdownHours.textContent = padded(hours);
  elements.countdownMinutes.textContent = padded(minutes);
  elements.countdownSeconds.textContent = padded(seconds);
}

function renderRaceCountdown(calendar) {
  window.clearInterval(state.countdownTimer);
  state.countdownTimer = null;
  state.calendar = calendar;
  state.displayRace = null;
  const race = selectCountdownRace(calendar);
  if (!race) {
    elements.raceBoard.hidden = true;
    return;
  }

  setRaceDetails(race);
  elements.raceBoard.hidden = false;
  updateRaceCountdown();
  state.countdownTimer = window.setInterval(updateRaceCountdown, 1000);
}

function categoryLabel(category) {
  return CATEGORY_LABELS[category] || CATEGORY_LABELS.other;
}

function sortedItems(items = state.items) {
  return [...items].sort((a, b) => {
    const officialDifference = Number(b.official) - Number(a.official);
    if (officialDifference) return officialDifference;
    const verifiedDifference = Number(b.verified) - Number(a.verified);
    if (verifiedDifference) return verifiedDifference;
    return new Date(b.published_at) - new Date(a.published_at);
  });
}

function safeLink(item) {
  return `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>`;
}

function sourceDescription(item) {
  if (item.official) return "官方来源，可作为事实依据。";
  if (item.category === "rumor" || !item.verified) return "传闻或推测，尚无官方确认。";
  return CATEGORY_SUMMARIES[item.category] || CATEGORY_SUMMARIES.other;
}

function itemBadge(item) {
  if (item.official) return '<span class="badge badge-official">官方</span>';
  if (item.category === "rumor" || !item.verified) return '<span class="badge badge-rumor">传闻</span>';
  return `<span class="badge">${escapeHtml(categoryLabel(item.category))}</span>`;
}

function renderNewsItem(item) {
  return `
    <article class="news-item">
      <div class="news-item-top">
        <div class="news-item-meta">
          <strong>${escapeHtml(item.source)}</strong>
          <time datetime="${escapeHtml(item.published_at)}">${escapeHtml(formatItemTime(item.published_at))}</time>
        </div>
        ${itemBadge(item)}
      </div>
      <h3>${safeLink(item)}</h3>
      <p>${escapeHtml(sourceDescription(item))}</p>
    </article>`;
}

function section(title, body, note = "") {
  return `
    <section class="report-section">
      <header class="section-heading">
        <h2>${escapeHtml(title)}</h2>
        ${note ? `<p>${escapeHtml(note)}</p>` : ""}
      </header>
      ${body}
    </section>`;
}

function exactAnniversary() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(state.generatedAt || Date.now()));
  const month = parts.find((part) => part.type === "month")?.value;
  const date = parts.find((part) => part.type === "day")?.value;
  return state.history.find((event) => {
    const [, eventMonth, eventDate] = event.date.split("-");
    return eventMonth === month && eventDate === date;
  });
}

function renderHistory() {
  const event = exactAnniversary();
  if (!event) return "";
  const title = event.title_zh || event.title;
  const summary = event.summary_zh || event.summary;
  return section(
    "往日回顾",
    `<article class="history-item">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(summary)}</p>
      <a href="${escapeHtml(event.url)}" target="_blank" rel="noreferrer">查看历史来源</a>
    </article>`,
    event.date,
  );
}

function renderShort() {
  if (!state.items.length) return renderEmpty();
  const ordered = sortedItems();
  const official = ordered.find((item) => item.official);
  const reliable = ordered.filter((item) => item.category !== "rumor").slice(0, 3);
  const rumor = ordered.find((item) => item.category === "rumor" || !item.verified);
  const bullets = [];
  const usedIds = new Set();

  if (reliable[0]) {
    bullets.push(`<li><strong>最值得看：</strong>${safeLink(reliable[0])}（${escapeHtml(reliable[0].source)}）</li>`);
    usedIds.add(reliable[0].id);
  }
  if (official && !usedIds.has(official.id)) {
    bullets.push(`<li><strong>官方动态：</strong>${safeLink(official)}</li>`);
    usedIds.add(official.id);
  }
  reliable.filter((item) => !usedIds.has(item.id)).slice(0, 2).forEach((item, index) => {
    bullets.push(`<li><strong>${index === 0 ? "媒体主线" : "另一关注"}：</strong>${safeLink(item)}（${escapeHtml(item.source)}）</li>`);
    usedIds.add(item.id);
  });
  if (rumor && !usedIds.has(rumor.id) && bullets.length < 5) {
    bullets.push(`<li><strong>传闻提醒：</strong>${safeLink(rumor)}，目前没有官方确认。</li>`);
  }

  return section("速读", `<ul class="quick-list">${bullets.slice(0, 5).join("")}</ul>`, "最多 5 条");
}

function renderStandard() {
  if (!state.items.length) return renderEmpty();
  const ordered = sortedItems();
  const officialItems = ordered.filter((item) => item.official);
  const mediaItems = ordered.filter((item) => !item.official && item.category !== "rumor" && item.verified);
  const rumorItems = ordered.filter((item) => item.category === "rumor" || !item.verified);
  const focusItems = ordered.filter((item) => item.category !== "rumor").slice(0, 3);
  let html = section(
    "今日重点",
    `<ol class="focus-list">${focusItems.map((item) => `<li>${safeLink(item)} <span>· ${escapeHtml(item.source)}</span></li>`).join("")}</ol>`,
    "可靠来源优先",
  );

  if (officialItems.length) {
    html += section("官方动态", `<div class="news-list">${officialItems.map(renderNewsItem).join("")}</div>`);
  }
  if (mediaItems.length) {
    html += section("媒体报道", `<div class="news-list">${mediaItems.map(renderNewsItem).join("")}</div>`, `${mediaItems.length} 条`);
  }
  if (rumorItems.length) {
    html += section("传闻雷达", `<div class="news-list">${rumorItems.map(renderNewsItem).join("")}</div>`, "尚待官方确认");
  }
  html += renderHistory();
  return html;
}

function groupByCategory() {
  return sortedItems().reduce((groups, item) => {
    const key = item.category || "other";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});
}

function renderTopicCard(category, items) {
  return `
    <article class="topic-card">
      <header class="topic-card-header">
        <h3>${escapeHtml(categoryLabel(category))}</h3>
        <p>${items.length} 条报道</p>
      </header>
      <p class="topic-summary">${escapeHtml(CATEGORY_SUMMARIES[category] || CATEGORY_SUMMARIES.other)}</p>
      <ul class="topic-links">
        ${items.map((item) => `<li>${safeLink(item)} · ${escapeHtml(item.source)}</li>`).join("")}
      </ul>
    </article>`;
}

function watchPoints() {
  const categories = new Set(state.items.map((item) => item.category));
  const points = [];
  if (categories.has("race")) points.push("关注后续赛程、处罚或车队策略是否出现官方更新。");
  if (categories.has("team")) points.push("关注 McLaren 是否就赛车升级和近期表现发布进一步说明。");
  if (categories.has("rumor")) points.push("关注转会或市场价值相关说法是否得到车手、车队或权威媒体确认。");
  if (categories.has("fan")) points.push("关注车迷活动的官方报名、时间和地点信息。");
  if (!points.length) points.push("关注 Oscar Piastri 与 McLaren 官方渠道是否发布新动态。");
  return points.slice(0, 3);
}

function renderDeep() {
  if (!state.items.length) return renderEmpty();
  const groups = groupByCategory();
  const officialCount = state.items.filter((item) => item.official).length;
  const reliableCount = state.items.filter((item) => !item.official && item.verified && item.category !== "rumor").length;
  const rumorCount = state.items.filter((item) => item.category === "rumor" || !item.verified).length;
  const dateCount = new Set(state.items.map((item) => item.daily_key)).size;
  const topicCards = Object.entries(groups)
    .sort(([, a], [, b]) => b.length - a.length)
    .map(([category, items]) => renderTopicCard(category, items))
    .join("");
  const credibility = `
    <div class="credibility-list">
      <div class="credibility-row"><strong>官方来源</strong><span>${officialCount} 条，可作为事实依据</span></div>
      <div class="credibility-row"><strong>已核验媒体</strong><span>${reliableCount} 条，原站日期已验证</span></div>
      <div class="credibility-row"><strong>传闻与推测</strong><span>${rumorCount} 条，单独标记</span></div>
    </div>`;
  const metrics = [
    [state.items.length, "最近 3 天条目"],
    [officialCount, "官方动态"],
    [rumorCount, "传闻条目"],
    [dateCount, "覆盖日期"],
  ];

  let html = section("话题合并", `<div class="topic-grid">${topicCards}</div>`, `${Object.keys(groups).length} 个话题`);
  if (officialCount) {
    html += section("官方动态", `<div class="news-list">${state.items.filter((item) => item.official).map(renderNewsItem).join("")}</div>`);
  }
  html += section("来源可信度", credibility);
  html += section("明日关注", `<ul class="watch-list">${watchPoints().map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>`);
  html += renderHistory();
  html += section("数据面板", `<div class="data-grid">${metrics.map(([value, label]) => `<div class="metric"><strong>${value}</strong><span>${escapeHtml(label)}</span></div>`).join("")}</div>`, "仅深读版展示");
  return html;
}

function renderEmpty() {
  return `<div class="empty-copy"><h2>最近 3 天没有新信息</h2><p>不会用更早的内容填充日报。</p></div>`;
}

function render() {
  elements.panels.short.innerHTML = renderShort();
  elements.panels.standard.innerHTML = renderStandard();
  elements.panels.deep.innerHTML = renderDeep();
}

function setMode(mode, updateHash = true) {
  if (!elements.panels[mode]) return;
  state.activeMode = mode;
  elements.tabs.forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  Object.entries(elements.panels).forEach(([key, panel]) => {
    panel.hidden = key !== mode;
  });
  if (updateHash) history.replaceState(null, "", `#${mode}`);
}

function updateMeta(generatedAt) {
  elements.updatedAt.textContent = `${formatDateTime(generatedAt)} 北京时间`;
  elements.updatedAt.dateTime = generatedAt;
  elements.itemCount.textContent = state.items.length ? `${state.items.length} 条已核验信息` : "没有新信息";
  if (state.items.length) {
    const dates = state.items.map((item) => item.daily_key).sort();
    elements.windowLabel.textContent = `${dates[0]} 至 ${dates[dates.length - 1]}`;
  } else {
    elements.windowLabel.textContent = "最近 3 天";
  }
}

async function fetchJson(path, required = true) {
  const url = new URL(path, window.location.href);
  url.searchParams.set("v", Date.now());
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    if (!required) return null;
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function fetchOptionalJson(path) {
  try {
    return await fetchJson(path, false);
  } catch (_error) {
    return null;
  }
}

async function reportPageView() {
  if (state.analyticsReported) return;
  state.analyticsReported = true;
  const config = await fetchOptionalJson("data/runtime-config.json");
  const analyticsUrl = String(config?.analytics_url || "").replace(/\/$/, "");
  if (!analyticsUrl) return;

  let referrerHost = null;
  if (document.referrer) {
    try {
      referrerHost = new URL(document.referrer).hostname || null;
    } catch (_error) {
      referrerHost = null;
    }
  }

  try {
    await fetch(`${analyticsUrl}/analytics/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: window.location.pathname, referrer_host: referrerHost }),
      keepalive: true,
    });
  } catch (_error) {
    // Analytics must never affect the fan daily.
  }
}

async function loadData() {
  elements.refreshButton.disabled = true;
  elements.loadingState.hidden = false;
  elements.errorState.hidden = true;
  Object.values(elements.panels).forEach((panel) => {
    panel.hidden = true;
  });

  try {
    const [itemsPayload, dailyPayload, historyPayload, calendarPayload] = await Promise.all([
      fetchJson("data/items.json"),
      fetchJson("data/daily.json"),
      fetchOptionalJson("data/history.json"),
      fetchOptionalJson("data/calendar.json"),
    ]);
    state.items = Array.isArray(itemsPayload.items) ? itemsPayload.items : [];
    state.daily = dailyPayload;
    state.history = Array.isArray(historyPayload?.events) ? historyPayload.events : [];
    state.generatedAt = itemsPayload.generated_at || dailyPayload.generated_at;
    updateMeta(state.generatedAt);
    renderRaceCountdown(calendarPayload);
    render();
    elements.loadingState.hidden = true;
    setMode(state.activeMode, false);
  } catch (error) {
    elements.loadingState.hidden = true;
    elements.errorState.hidden = false;
    elements.errorMessage.textContent = `数据读取失败：${error.message}`;
  } finally {
    elements.refreshButton.disabled = false;
  }
}

elements.tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => setMode(tab.dataset.mode));
  tab.addEventListener("keydown", (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (index + direction + elements.tabs.length) % elements.tabs.length;
    elements.tabs[nextIndex].focus();
    setMode(elements.tabs[nextIndex].dataset.mode);
  });
});

elements.refreshButton.addEventListener("click", loadData);
elements.retryButton.addEventListener("click", loadData);

const initialMode = window.location.hash.slice(1);
if (elements.panels[initialMode]) state.activeMode = initialMode;
reportPageView();
loadData();
