const I18N = {
  zh: {
    htmlLang: "zh-CN",
    toggle: "EN",
    ariaToggle: "Switch to English",
    navLabel: "相关链接",
    rss: "RSS",
    github: "GitHub",
    kicker: "OSCAR PIASTRI · 最近 3 天",
    pageTitle: "Oscar Piastri 粉丝日报",
    deck: "最近三天值得关注的比赛、车队与围场动态。",
    updateLabel: "数据更新时间",
    socialUpdateLabel: "X / IG 数据",
    socialMeta: (generated, latest) => `采集 ${generated}\n最新内容 ${latest}`,
    loadingUpdatedAt: "正在读取...",
    refresh: "刷新",
    retry: "重新加载",
    windowDefault: "最近 3 天",
    loadingNews: "正在加载新闻",
    noNewsCount: "没有新信息",
    verifiedCount: (count) => `${count} 条已核验信息`,
    updatedSuffix: "北京时间",
    dateRange: (start, end) => `${start} 至 ${end}`,
    readErrorTitle: "暂时无法读取日报",
    readErrorDefault: "请稍后刷新页面。",
    readError: (message) => `数据读取失败：${message}`,
    tabsLabel: "日报版本",
    shortTab: "速读",
    shortTabSub: "1 分钟",
    dailyTab: "日报",
    dailyTabSub: "完整整理",
    fanTab: "粉丝源",
    fanTabSub: "X / IG",
    shortTitle: "速读",
    shortNote: "最多 5 条",
    topPick: "最值得看",
    officialUpdate: "官方动态",
    mediaMain: "媒体主线",
    anotherFocus: "另一关注",
    rumorReminder: "传闻提醒",
    rumorUnconfirmed: "目前没有官方确认。",
    todayFocus: "今日重点",
    reliableFirst: "可靠来源优先",
    reportStats: "本期统计",
    statTotal: "最近 3 天",
    statToday: "最近日新增",
    statOfficial: "官方",
    statMedia: "媒体",
    statSocial: "X / 粉丝源",
    statRumor: "传闻",
    topicMerge: "话题合并",
    topicCount: (count) => `${count} 个话题`,
    officialSection: "官方动态",
    officialSpotlightNote: "优先展示来自车手、车队与 F1 官方来源的更新",
    officialSpotlightLabel: "官方优先",
    mediaSection: "媒体报道",
    mediaCount: (count) => `${count} 条`,
    fanFeedTitle: "粉丝源",
    fanFeedNote: "X / IG 动态",
    fanFeedRights: "粉丝源内容引用自公开 X / IG 动态；如有侵权请联系删除。",
    fanFeedEmptyTitle: "暂无粉丝源动态",
    fanFeedEmptyBody: "当前没有可展示的 X / IG 发帖或转帖；未配置访问能力时不会展示账号库或伪造内容。",
    rumorRadar: "传闻雷达",
    rumorNote: "尚待官方确认",
    lookingBack: "往日回顾",
    historyLink: "查看历史来源",
    originalTitle: "原题",
    originalText: "英文原文",
    noRecentTitle: "最近 3 天没有新信息",
    noRecentBody: "不会用更早的内容填充日报。",
    officialBadge: "官方",
    rumorBadge: "传闻",
    fanBadge: "粉丝",
    categoryFallback: "其他动态",
    nextRace: "NEXT RACE",
    round: (round, code) => `ROUND ${round} · ${code}`,
    weekendStart: (time) => `周末开始 ${time}`,
    qualifying: (time) => `排位 ${time}`,
    raceStart: (time) => `正赛 ${time} 北京时间`,
    calendarUpdated: (time) => `赛历更新于 ${time} 北京时间`,
    countdownLabel: "距离正赛",
    liveLabel: "正赛进行中",
    countdownAria: "距离下一场正赛的倒计时",
    countdownUnits: ["天", "时", "分", "秒"],
    addRaceCalendar: "添加正赛",
    addWeekendCalendar: "添加比赛周末",
    calendarActionsLabel: "日历操作",
    calendarLink: "查看 F1 官方赛历",
    footerText: "GitHub Actions 每 6 小时更新。只展示原站发布日期可核验的最近 3 天信息。",
    stats: "统计",
    admin: "历史审核台",
    categoryLabels: {
      race: "比赛动态",
      team: "车队与赛车",
      interview: "采访与观点",
      contract: "合同与商业",
      fan: "车迷与场外",
      rumor: "围场传闻",
      other: "其他动态",
    },
    categorySummaries: {
      race: "围绕比赛表现、策略、处罚或周末进程的报道。",
      team: "围绕 McLaren 赛车表现、升级与车队运作的报道。",
      interview: "来自车手、车队或围场相关人物的公开表达。",
      contract: "围绕合同、合作或商业关系的报道。",
      fan: "与车迷活动、社区或场外互动有关的信息。",
      rumor: "尚未得到官方确认，阅读时应与事实报道分开。",
      other: "与 Oscar Piastri 直接相关、但不属于主要赛道类别的信息。",
    },
  },
  en: {
    htmlLang: "en",
    toggle: "中",
    ariaToggle: "切换到中文",
    navLabel: "Related links",
    rss: "RSS",
    github: "GitHub",
    kicker: "OSCAR PIASTRI · LATEST 3 DAYS",
    pageTitle: "Oscar Piastri Fan Daily",
    deck: "Race, team, and paddock updates worth tracking from the latest three days.",
    updateLabel: "Data updated",
    socialUpdateLabel: "X / IG data",
    socialMeta: (generated, latest) => `Generated ${generated}\nNewest item ${latest}`,
    loadingUpdatedAt: "Loading...",
    refresh: "Refresh",
    retry: "Reload",
    windowDefault: "Latest 3 days",
    loadingNews: "Loading news",
    noNewsCount: "No new items",
    verifiedCount: (count) => `${count} verified items`,
    updatedSuffix: "China Standard Time",
    dateRange: (start, end) => `${start} to ${end}`,
    readErrorTitle: "Unable to load the daily",
    readErrorDefault: "Please refresh later.",
    readError: (message) => `Data load failed: ${message}`,
    tabsLabel: "Report versions",
    shortTab: "Short",
    shortTabSub: "1 min",
    dailyTab: "Daily",
    dailyTabSub: "Full brief",
    fanTab: "Fan Sources",
    fanTabSub: "X / IG",
    shortTitle: "Short",
    shortNote: "Up to 5 items",
    topPick: "Top pick",
    officialUpdate: "Official",
    mediaMain: "Media line",
    anotherFocus: "Another focus",
    rumorReminder: "Rumor note",
    rumorUnconfirmed: "No official confirmation yet.",
    todayFocus: "Key Points",
    reliableFirst: "Reliable sources first",
    reportStats: "Report Stats",
    statTotal: "Latest 3 days",
    statToday: "Latest day",
    statOfficial: "Official",
    statMedia: "Media",
    statSocial: "X / Fan",
    statRumor: "Rumors",
    topicMerge: "Topic Merge",
    topicCount: (count) => `${count} topics`,
    officialSection: "Official Updates",
    officialSpotlightNote: "Prioritising driver, team, and Formula 1 official sources",
    officialSpotlightLabel: "Official first",
    mediaSection: "Media Coverage",
    mediaCount: (count) => `${count} items`,
    fanFeedTitle: "Fan Sources",
    fanFeedNote: "X / IG updates",
    fanFeedRights: "Fan-source items reference public X / IG posts. Remove on rights request.",
    fanFeedEmptyTitle: "No fan-source updates",
    fanFeedEmptyBody: "No X / IG posts or reposts are available right now. Without configured access, the page does not expose the account list or invent social items.",
    rumorRadar: "Rumor Radar",
    rumorNote: "Awaiting official confirmation",
    lookingBack: "Looking Back",
    historyLink: "View historical source",
    originalTitle: "Original title",
    originalText: "Original text",
    noRecentTitle: "No new information in the latest 3 days",
    noRecentBody: "Older items are not used as filler.",
    officialBadge: "Official",
    rumorBadge: "Rumor",
    fanBadge: "Fan",
    categoryFallback: "Other",
    nextRace: "NEXT RACE",
    round: (round, code) => `ROUND ${round} · ${code}`,
    weekendStart: (time) => `Weekend starts ${time}`,
    qualifying: (time) => `Qualifying ${time}`,
    raceStart: (time) => `Race ${time} CST`,
    calendarUpdated: (time) => `Calendar updated ${time} CST`,
    countdownLabel: "Until race",
    liveLabel: "Race live",
    countdownAria: "Countdown to the next race",
    countdownUnits: ["d", "h", "m", "s"],
    addRaceCalendar: "Add race",
    addWeekendCalendar: "Add weekend",
    calendarActionsLabel: "Calendar actions",
    calendarLink: "View official F1 calendar",
    footerText: "GitHub Actions updates every 6 hours. Only publisher-date-verified items from the latest 3 days are shown.",
    stats: "Stats",
    admin: "History console",
    categoryLabels: {
      race: "Race",
      team: "Team & Car",
      interview: "Interviews",
      contract: "Contract & Business",
      fan: "Fans & Off-track",
      rumor: "Rumors",
      other: "Other",
    },
    categorySummaries: {
      race: "Race, strategy, penalty, performance, or weekend-progress coverage.",
      team: "McLaren car performance, upgrades, or team-operations coverage.",
      interview: "Public comments from drivers, teams, or paddock figures.",
      contract: "Contract, sponsorship, partnership, or business coverage.",
      fan: "Fan activity, community, or off-track coverage.",
      rumor: "Unconfirmed information that should be separated from factual reporting.",
      other: "Oscar Piastri-related coverage outside the main categories.",
    },
  },
};

const state = {
  items: [],
  daily: null,
  history: [],
  social: null,
  calendar: null,
  displayRace: null,
  countdownTimer: null,
  generatedAt: null,
  activeMode: "short",
  language: localStorage.getItem("piasnewsLanguage") || "zh",
  analyticsReported: false,
};

const DIRECT_PIASTRI_RE = /\b(piastri|oscar|op81)\b/i;
const SESSION_KEYWORDS = {
  race: /\b(race|grand prix|gp|win|podium|points|strategy|pit|lap)\b/i,
  qualifying: /\b(qualifying|quali|q1|q2|q3|pole|grid)\b/i,
  practice_3: /\b(fp3|practice 3|final practice|third practice)\b/i,
  practice_2: /\b(fp2|practice 2|second practice|friday practice)\b/i,
  practice_1: /\b(fp1|practice 1|first practice|friday practice)\b/i,
};

const elements = {
  languageToggle: document.querySelector("#languageToggle"),
  brand: document.querySelector(".brand"),
  headerNav: document.querySelector(".header-links"),
  navLinks: [...document.querySelectorAll(".header-links a")],
  kicker: document.querySelector(".kicker"),
  pageTitle: document.querySelector("#pageTitle"),
  reportDeck: document.querySelector(".report-deck"),
  updateLabel: document.querySelector(".update-label"),
  updatedAt: document.querySelector("#updatedAt"),
  socialUpdatedAt: document.querySelector("#socialUpdatedAt"),
  socialUpdateLabel: document.querySelector(".social-update-label"),
  windowLabel: document.querySelector("#windowLabel"),
  itemCount: document.querySelector("#itemCount"),
  loadingState: document.querySelector("#loadingState"),
  errorState: document.querySelector("#errorState"),
  errorTitle: document.querySelector("#errorState h2"),
  errorMessage: document.querySelector("#errorMessage"),
  refreshButton: document.querySelector("#refreshButton"),
  retryButton: document.querySelector("#retryButton"),
  raceBoard: document.querySelector("#raceBoard"),
  raceKicker: document.querySelector(".race-kicker"),
  raceRound: document.querySelector("#raceRound"),
  raceName: document.querySelector("#raceName"),
  raceLocation: document.querySelector("#raceLocation"),
  raceWeekend: document.querySelector("#raceWeekend"),
  raceStartTime: document.querySelector("#raceStartTime"),
  raceCalendarMeta: document.querySelector("#raceCalendarMeta"),
  countdownLabel: document.querySelector("#countdownLabel"),
  countdownGrid: document.querySelector(".countdown-grid"),
  countdownDays: document.querySelector("#countdownDays"),
  countdownHours: document.querySelector("#countdownHours"),
  countdownMinutes: document.querySelector("#countdownMinutes"),
  countdownSeconds: document.querySelector("#countdownSeconds"),
  calendarActions: document.querySelector(".calendar-actions"),
  addRaceCalendarLink: document.querySelector("#addRaceCalendarLink"),
  addWeekendCalendarLink: document.querySelector("#addWeekendCalendarLink"),
  officialCalendarLink: document.querySelector("#officialCalendarLink"),
  reportShell: document.querySelector(".report-shell"),
  footerText: document.querySelector(".site-footer p"),
  footerLinks: [...document.querySelectorAll(".footer-links a")],
  tabs: [...document.querySelectorAll("[role=tab]")],
  panels: {
    short: document.querySelector("#panel-short"),
    daily: document.querySelector("#panel-daily"),
    fan: document.querySelector("#panel-fan"),
  },
};

function t() {
  return I18N[state.language] || I18N.zh;
}

function escapeHtml(value) {
  const node = document.createElement("span");
  node.textContent = String(value ?? "");
  return node.innerHTML;
}

function formatDateTime(value) {
  if (!value) return state.language === "zh" ? "未知" : "Unknown";
  return new Intl.DateTimeFormat(state.language === "zh" ? "zh-CN" : "en-US", {
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
  return new Intl.DateTimeFormat(state.language === "zh" ? "zh-CN" : "en-US", {
    timeZone: "Asia/Shanghai",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function formatRaceTime(value) {
  if (!value) return state.language === "zh" ? "时间待定" : "TBC";
  return new Intl.DateTimeFormat(state.language === "zh" ? "zh-CN" : "en-US", {
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

function categoryLabel(category) {
  return t().categoryLabels[category] || t().categoryLabels.other;
}

function categorySummary(category) {
  return t().categorySummaries[category] || t().categorySummaries.other;
}

function localizedTitle(item) {
  if (state.language === "zh") return item.title_zh || item.title;
  return item.title;
}

function localizedSummary(item) {
  if (state.language === "zh") return item.summary_zh || categorySummary(item.category);
  return item.summary || categorySummary(item.category);
}

function localizedAttribution(item) {
  if (state.language === "zh") return item.attribution_zh || "";
  return item.attribution || "";
}

function localizedCopyrightNotice(item) {
  if (state.language === "zh") return item.copyright_notice_zh || "";
  return item.copyright_notice || "";
}

function isSocialItem(item) {
  return item.source_type === "x" || item.source_type === "instagram";
}

function safeLink(item) {
  return `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(localizedTitle(item))}</a>`;
}

function socialOriginalText(item) {
  const text = item.summary || item.title || "";
  return text.replace(/^X (post|repost) from @[^:]+:\s*/i, "").trim();
}

function itemBadge(item) {
  if (item.official) return `<span class="badge badge-official">${escapeHtml(t().officialBadge)}</span>`;
  if (isSocialItem(item) || item.category === "fan") return `<span class="badge badge-fan">${escapeHtml(t().fanBadge)}</span>`;
  if (item.category === "rumor" || !item.verified) return `<span class="badge badge-rumor">${escapeHtml(t().rumorBadge)}</span>`;
  return `<span class="badge">${escapeHtml(categoryLabel(item.category))}</span>`;
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
  if (race.weekend_start) scheduleParts.push(t().weekendStart(formatRaceTime(race.weekend_start)));
  if (qualifying) scheduleParts.push(t().qualifying(formatRaceTime(qualifying)));

  elements.raceKicker.textContent = t().nextRace;
  elements.raceRound.textContent = t().round(race.round, race.country_code);
  elements.raceName.textContent = state.language === "zh" ? race.name_zh || race.name : race.name;
  elements.raceLocation.textContent = [race.circuit, race.locality].filter(Boolean).join(" · ");
  elements.raceWeekend.textContent = scheduleParts.join(" · ");
  elements.raceStartTime.textContent = t().raceStart(formatRaceTime(race.race_start));
  elements.raceStartTime.dateTime = race.race_start;
  elements.raceCalendarMeta.textContent = t().calendarUpdated(formatDateTime(state.calendar.generated_at));
  elements.calendarActions.setAttribute("aria-label", t().calendarActionsLabel);
  elements.addRaceCalendarLink.href = "data/next-race.ics";
  elements.addRaceCalendarLink.setAttribute("download", `${race.id || "next-f1-race"}.ics`);
  elements.addRaceCalendarLink.textContent = t().addRaceCalendar;
  elements.addWeekendCalendarLink.href = "data/next-weekend.ics";
  elements.addWeekendCalendarLink.setAttribute("download", `${race.id || "next-f1-weekend"}-weekend.ics`);
  elements.addWeekendCalendarLink.textContent = t().addWeekendCalendar;
  elements.officialCalendarLink.href = state.calendar.source?.official_calendar_url || race.official_url;
  elements.officialCalendarLink.textContent = t().calendarLink;
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
  elements.countdownLabel.textContent = live ? t().liveLabel : t().countdownLabel;
  [elements.countdownDays, elements.countdownHours, elements.countdownMinutes, elements.countdownSeconds].forEach((node, index) => {
    node.textContent = padded([days, hours, minutes, seconds][index]);
  });
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

function itemText(item) {
  return [
    item.title,
    item.title_zh,
    item.summary,
    item.summary_zh,
    item.source,
    ...(Array.isArray(item.tags) ? item.tags : []),
  ].filter(Boolean).join(" ");
}

function currentSessionKey(now = Date.now()) {
  const race = state.displayRace || selectCountdownRace(state.calendar, now);
  const sessions = race?.sessions || {};
  const ordered = ["practice_1", "practice_2", "practice_3", "qualifying", "race"]
    .map((key) => ({ key, time: sessions[key] || (key === "race" ? race?.race_start : null) }))
    .filter((session) => session.time)
    .map((session) => ({ ...session, timestamp: new Date(session.time).getTime() }))
    .filter((session) => Number.isFinite(session.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp);
  let latest = null;
  ordered.forEach((session) => {
    if (session.timestamp <= now + 30 * 60 * 1000) latest = session;
  });
  return latest?.key || null;
}

function sessionIndex(key) {
  return ["practice_1", "practice_2", "practice_3", "qualifying", "race"].indexOf(key);
}

function itemSessionKey(item) {
  const text = itemText(item);
  for (const key of ["race", "qualifying", "practice_3", "practice_2", "practice_1"]) {
    if (SESSION_KEYWORDS[key].test(text)) return key;
  }
  return null;
}

function itemPriorityScore(item, now = Date.now()) {
  const publishedAt = new Date(item.published_at).getTime();
  const ageHours = Number.isFinite(publishedAt) ? Math.max(0, (now - publishedAt) / 3600000) : 72;
  let score = Math.max(0, 36 - ageHours) * 3;
  if (isDirectPiastriItem(item)) score += 45;
  if (item.official) score += 24;
  else if (item.verified) score += 12;
  if (item.category === "race") score += 28;
  if (item.category === "team") score += 12;
  if (item.category === "interview") score += 10;
  if (item.category === "rumor" || !item.verified) score -= 45;

  const activeSession = currentSessionKey(now);
  const itemSession = itemSessionKey(item);
  if (activeSession && itemSession) {
    const delta = sessionIndex(activeSession) - sessionIndex(itemSession);
    if (delta === 0) score += 38;
    else if (delta === 1) score += 12;
    else if (delta > 1) score -= delta * 18;
  }
  return score;
}

function sortedItems(items = state.items, options = {}) {
  if (options.priority) {
    return [...items].sort((a, b) => {
      const priorityDifference = itemPriorityScore(b) - itemPriorityScore(a);
      if (priorityDifference) return priorityDifference;
      return new Date(b.published_at) - new Date(a.published_at);
    });
  }
  return [...items].sort((a, b) => {
    const officialDifference = Number(b.official) - Number(a.official);
    if (officialDifference) return officialDifference;
    const verifiedDifference = Number(b.verified) - Number(a.verified);
    if (verifiedDifference) return verifiedDifference;
    return new Date(b.published_at) - new Date(a.published_at);
  });
}

function renderNewsItem(item, options = {}) {
  const originalTitle = state.language === "zh" && !isSocialItem(item) && item.title_zh && item.title_zh !== item.title
    ? `<p class="original-title"><strong>${escapeHtml(t().originalTitle)}：</strong>${escapeHtml(item.title)}</p>`
    : "";
  const originalSocial = state.language === "zh" && isSocialItem(item) && socialOriginalText(item)
    ? `<p class="original-title social-original"><strong>${escapeHtml(t().originalText)}：</strong>${escapeHtml(socialOriginalText(item))}</p>`
    : "";
  const attribution = localizedAttribution(item);
  const copyrightNotice = options.showRights === false ? "" : localizedCopyrightNotice(item);
  const summary = localizedSummary(item);
  const showSummary = !(state.language === "zh" && isSocialItem(item));
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
      ${originalTitle}
      ${originalSocial}
      ${showSummary && summary ? `<p>${escapeHtml(summary)}</p>` : ""}
      ${attribution ? `<p class="item-attribution">${escapeHtml(attribution)}</p>` : ""}
      ${copyrightNotice ? `<p class="item-rights">${escapeHtml(copyrightNotice)}</p>` : ""}
    </article>`;
}

function socialItems() {
  const items = Array.isArray(state.social?.items) ? state.social.items : [];
  return sortedItems(items).filter(isSocialItem);
}

function dailySocialItems() {
  return socialItems().filter((item) => item.source_group !== "fan_watch");
}

function fanSourceItems() {
  return socialItems().filter((item) => item.source_group === "fan_watch" || !item.source_group);
}

function latestSocialPublishedAt() {
  const timestamps = socialItems()
    .map((item) => new Date(item.published_at).getTime())
    .filter((value) => Number.isFinite(value));
  if (!timestamps.length) return null;
  return new Date(Math.max(...timestamps)).toISOString();
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
  const title = state.language === "zh" ? event.title_zh || event.title : event.title;
  const summary = state.language === "zh" ? event.summary_zh || event.summary : event.summary;
  return section(
    t().lookingBack,
    `<article class="history-item">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(summary)}</p>
      <a href="${escapeHtml(event.url)}" target="_blank" rel="noreferrer">${escapeHtml(t().historyLink)}</a>
    </article>`,
    event.date,
  );
}

function renderShort() {
  if (!state.items.length) return renderEmpty();
  const ordered = sortedItems(state.items, { priority: true });
  const official = ordered.find((item) => item.official);
  const reliable = ordered.filter((item) => item.category !== "rumor").slice(0, 3);
  const rumor = ordered.find((item) => item.category === "rumor" || !item.verified);
  const bullets = [];
  const usedIds = new Set();

  if (reliable[0]) {
    bullets.push(`<li><strong>${escapeHtml(t().topPick)}：</strong>${safeLink(reliable[0])}（${escapeHtml(reliable[0].source)}）</li>`);
    usedIds.add(reliable[0].id);
  }
  if (official && !usedIds.has(official.id)) {
    bullets.push(`<li><strong>${escapeHtml(t().officialUpdate)}：</strong>${safeLink(official)}</li>`);
    usedIds.add(official.id);
  }
  reliable.filter((item) => !usedIds.has(item.id)).slice(0, 2).forEach((item, index) => {
    const label = index === 0 ? t().mediaMain : t().anotherFocus;
    bullets.push(`<li><strong>${escapeHtml(label)}：</strong>${safeLink(item)}（${escapeHtml(item.source)}）</li>`);
    usedIds.add(item.id);
  });
  if (rumor && !usedIds.has(rumor.id) && bullets.length < 5) {
    bullets.push(`<li><strong>${escapeHtml(t().rumorReminder)}：</strong>${safeLink(rumor)}，${escapeHtml(t().rumorUnconfirmed)}</li>`);
  }

  return section(t().shortTitle, `<ul class="quick-list">${bullets.slice(0, 5).join("")}</ul>`, t().shortNote);
}

function dailyItems() {
  return sortedItems([...state.items, ...dailySocialItems()]);
}

function isDirectPiastriItem(item) {
  return DIRECT_PIASTRI_RE.test(itemText(item));
}

function groupByCategory(items = sortedItems()) {
  return items.reduce((groups, item) => {
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
        <p>${escapeHtml(t().mediaCount(items.length))}</p>
      </header>
      <p class="topic-summary">${escapeHtml(categorySummary(category))}</p>
      <ul class="topic-links">
        ${items.map((item) => `<li>${safeLink(item)} · ${escapeHtml(item.source)}</li>`).join("")}
      </ul>
    </article>`;
}

function renderOfficialSpotlight(items) {
  const [lead, ...rest] = items;
  if (!lead) return "";
  const leadSummary = localizedSummary(lead);
  const secondary = rest.slice(0, 3).map((item) => `
    <li>
      <span>${escapeHtml(item.source)}</span>
      ${safeLink(item)}
      <time datetime="${escapeHtml(item.published_at)}">${escapeHtml(formatItemTime(item.published_at))}</time>
    </li>`).join("");

  return `
    <div class="official-spotlight">
      <article class="official-lead">
        <div class="official-lead-meta">
          <span>${escapeHtml(t().officialSpotlightLabel)}</span>
          <time datetime="${escapeHtml(lead.published_at)}">${escapeHtml(formatItemTime(lead.published_at))}</time>
        </div>
        <h3>${safeLink(lead)}</h3>
        ${leadSummary ? `<p>${escapeHtml(leadSummary)}</p>` : ""}
        <div class="official-source">${escapeHtml(lead.source)}</div>
      </article>
      ${secondary ? `<ul class="official-secondary">${secondary}</ul>` : ""}
    </div>`;
}

function renderDaily() {
  const ordered = dailyItems();
  if (!ordered.length) return renderEmpty();
  const officialItems = ordered.filter((item) => item.official);
  const mediaItems = ordered.filter((item) => !item.official && item.category !== "rumor" && item.verified);
  const rumorItems = ordered.filter((item) => item.category === "rumor" || !item.verified);
  const focusItems = sortedItems(ordered, { priority: true })
    .filter((item) => item.category !== "rumor" && isDirectPiastriItem(item))
    .slice(0, 3);
  const groups = groupByCategory(ordered);
  const topicCards = Object.entries(groups)
    .sort(([, a], [, b]) => b.length - a.length)
    .map(([category, items]) => renderTopicCard(category, items))
    .join("");

  let html = focusItems.length
    ? section(
      t().todayFocus,
      `<ol class="focus-list">${focusItems.map((item) => `<li>${safeLink(item)} <span>· ${escapeHtml(item.source)}</span></li>`).join("")}</ol>`,
      t().reliableFirst,
    )
    : "";
  if (officialItems.length) {
    html += section(t().officialSection, renderOfficialSpotlight(officialItems), t().officialSpotlightNote);
  }
  html += section(t().topicMerge, `<div class="topic-grid">${topicCards}</div>`, t().topicCount(Object.keys(groups).length));
  if (mediaItems.length) {
    html += section(t().mediaSection, `<div class="news-list">${mediaItems.map(renderNewsItem).join("")}</div>`, t().mediaCount(mediaItems.length));
  }
  if (rumorItems.length) {
    html += section(t().rumorRadar, `<div class="news-list">${rumorItems.map(renderNewsItem).join("")}</div>`, t().rumorNote);
  }
  html += renderHistory();
  html += renderStats();
  return html;
}

function renderStats() {
  const latestDay = Array.isArray(state.daily?.days) ? state.daily.days[0] : null;
  const totalItems = state.daily?.total_items ?? state.items.length;
  const todayItems = latestDay?.total_new_items ?? 0;
  const officialItems = latestDay?.official_new_items ?? state.items.filter((item) => item.official).length;
  const mediaItems = latestDay?.media_new_items ?? state.items.filter((item) => !item.official).length;
  const socialItemsCount = Array.isArray(state.social?.items) ? state.social.items.length : 0;
  const rumorItems = latestDay?.rumor_new_items ?? state.items.filter((item) => item.category === "rumor" || !item.verified).length;
  const metrics = [
    [t().statTotal, totalItems],
    [t().statToday, todayItems],
    [t().statOfficial, officialItems],
    [t().statMedia, mediaItems],
    [t().statSocial, socialItemsCount],
    [t().statRumor, rumorItems],
  ];
  return section(
    t().reportStats,
    `<div class="data-grid">${metrics.map(([label, value]) => `
      <div class="metric">
        <strong>${escapeHtml(value)}</strong>
        <span>${escapeHtml(label)}</span>
      </div>`).join("")}</div>`,
  );
}

function renderFanFeed() {
  const social = fanSourceItems();
  if (social.length) {
    return section(
      t().fanFeedTitle,
      `<p class="feed-rights-notice">${escapeHtml(t().fanFeedRights)}</p>
      <div class="news-list">${social.map((item) => renderNewsItem(item, { showRights: false })).join("")}</div>`,
      t().mediaCount(social.length),
    );
  }
  return section(
    t().fanFeedTitle,
    `<div class="empty-copy">
      <h2>${escapeHtml(t().fanFeedEmptyTitle)}</h2>
      <p>${escapeHtml(t().fanFeedEmptyBody)}</p>
    </div>`,
    t().fanFeedNote,
  );
}

function renderEmpty() {
  return `<div class="empty-copy"><h2>${escapeHtml(t().noRecentTitle)}</h2><p>${escapeHtml(t().noRecentBody)}</p></div>`;
}

function render() {
  elements.panels.short.innerHTML = renderShort();
  elements.panels.daily.innerHTML = renderDaily();
  elements.panels.fan.innerHTML = renderFanFeed();
}

function setMode(mode, updateHash = true) {
  const normalizedMode = mode === "standard" || mode === "deep" ? "daily" : mode;
  if (!elements.panels[normalizedMode]) return;
  state.activeMode = normalizedMode;
  elements.tabs.forEach((tab) => {
    const active = tab.dataset.mode === normalizedMode;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  Object.entries(elements.panels).forEach(([key, panel]) => {
    panel.hidden = key !== normalizedMode;
  });
  if (updateHash) window.history.replaceState(null, "", `#${normalizedMode}`);
}

function updateMeta(generatedAt) {
  elements.updatedAt.textContent = `${formatDateTime(generatedAt)} ${t().updatedSuffix}`;
  elements.updatedAt.dateTime = generatedAt;
  const socialGeneratedAt = state.social?.generated_at;
  const latestSocialAt = latestSocialPublishedAt();
  elements.socialUpdatedAt.textContent = t().socialMeta(
    `${formatDateTime(socialGeneratedAt)} ${t().updatedSuffix}`,
    `${formatDateTime(latestSocialAt)} ${t().updatedSuffix}`,
  );
  elements.socialUpdatedAt.dateTime = socialGeneratedAt || "";
  elements.itemCount.textContent = state.items.length ? t().verifiedCount(state.items.length) : t().noNewsCount;
  if (state.items.length) {
    const dates = state.items.map((item) => item.daily_key).sort();
    elements.windowLabel.textContent = t().dateRange(dates[0], dates[dates.length - 1]);
  } else {
    elements.windowLabel.textContent = t().windowDefault;
  }
}

function applyStaticLanguage() {
  document.documentElement.lang = t().htmlLang;
  document.title = `Piasnews | ${t().pageTitle}`;
  elements.languageToggle.textContent = t().toggle;
  elements.languageToggle.setAttribute("aria-label", t().ariaToggle);
  elements.brand.setAttribute("aria-label", state.language === "zh" ? "Piasnews 首页" : "Piasnews home");
  elements.headerNav.setAttribute("aria-label", t().navLabel);
  elements.navLinks[0].textContent = t().rss;
  elements.navLinks[1].textContent = t().github;
  elements.kicker.textContent = t().kicker;
  elements.pageTitle.textContent = t().pageTitle;
  elements.reportDeck.textContent = t().deck;
  elements.updateLabel.textContent = t().updateLabel;
  elements.socialUpdateLabel.textContent = t().socialUpdateLabel;
  elements.refreshButton.textContent = t().refresh;
  elements.retryButton.textContent = t().retry;
  elements.errorTitle.textContent = t().readErrorTitle;
  if (!elements.errorMessage.textContent || elements.errorMessage.textContent === I18N.zh.readErrorDefault || elements.errorMessage.textContent === I18N.en.readErrorDefault) {
    elements.errorMessage.textContent = t().readErrorDefault;
  }
  elements.reportShell.setAttribute("aria-label", t().pageTitle);
  document.querySelector(".tabs").setAttribute("aria-label", t().tabsLabel);
  document.querySelector("#tab-short span").textContent = t().shortTab;
  document.querySelector("#tab-short small").textContent = t().shortTabSub;
  document.querySelector("#tab-daily span").textContent = t().dailyTab;
  document.querySelector("#tab-daily small").textContent = t().dailyTabSub;
  document.querySelector("#tab-fan span").textContent = t().fanTab;
  document.querySelector("#tab-fan small").textContent = t().fanTabSub;
  elements.countdownGrid.setAttribute("aria-label", t().countdownAria);
  [elements.countdownDays, elements.countdownHours, elements.countdownMinutes, elements.countdownSeconds].forEach((node, index) => {
    node.nextElementSibling.textContent = t().countdownUnits[index];
  });
  elements.footerText.textContent = t().footerText;
  elements.footerLinks[0].textContent = "JSON";
  elements.footerLinks[1].textContent = t().stats;
  elements.footerLinks[2].textContent = t().admin;

  if (!state.generatedAt) {
    elements.updatedAt.textContent = t().loadingUpdatedAt;
    elements.socialUpdatedAt.textContent = t().loadingUpdatedAt;
    elements.windowLabel.textContent = t().windowDefault;
    elements.itemCount.textContent = t().loadingNews;
  } else {
    updateMeta(state.generatedAt);
  }
  if (state.calendar) renderRaceCountdown(state.calendar);
  render();
  setMode(state.activeMode, false);
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
    const [itemsPayload, dailyPayload, historyPayload, calendarPayload, socialPayload] = await Promise.all([
      fetchJson("data/items.json"),
      fetchJson("data/daily.json"),
      fetchOptionalJson("data/history.json"),
      fetchOptionalJson("data/calendar.json"),
      fetchOptionalJson("data/social.json"),
    ]);
    state.items = Array.isArray(itemsPayload.items) ? itemsPayload.items : [];
    state.daily = dailyPayload;
    state.history = Array.isArray(historyPayload?.events) ? historyPayload.events : [];
    state.social = socialPayload;
    state.generatedAt = itemsPayload.generated_at || dailyPayload.generated_at;
    updateMeta(state.generatedAt);
    renderRaceCountdown(calendarPayload);
    render();
    elements.loadingState.hidden = true;
    setMode(state.activeMode, false);
  } catch (error) {
    elements.loadingState.hidden = true;
    elements.errorState.hidden = false;
    elements.errorMessage.textContent = t().readError(error.message);
  } finally {
    elements.refreshButton.disabled = false;
  }
}

elements.tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => setMode(tab.dataset.mode));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex = (index + direction + elements.tabs.length) % elements.tabs.length;
    elements.tabs[nextIndex].focus();
    setMode(elements.tabs[nextIndex].dataset.mode);
  });
});

elements.languageToggle.addEventListener("click", () => {
  state.language = state.language === "zh" ? "en" : "zh";
  localStorage.setItem("piasnewsLanguage", state.language);
  applyStaticLanguage();
});

elements.refreshButton.addEventListener("click", loadData);
elements.retryButton.addEventListener("click", loadData);

const initialMode = window.location.hash.slice(1);
if (elements.panels[initialMode]) state.activeMode = initialMode;
if (initialMode === "standard" || initialMode === "deep") state.activeMode = "daily";
applyStaticLanguage();
reportPageView();
loadData();
