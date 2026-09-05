const SOURCE_LIBRARY = {
  number81: {
    mark: "F1",
    id: "KF-004",
    label: "Official explanation of number 81",
    url: "https://www.formula1.com/en/latest/article/mclaren-rookie-piastri-explains-why-he-chose-81-as-his-race-number-for-2023.3TYgCqI5kg4t8OztNvb2K3",
  },
  alpine: {
    mark: "FIA",
    id: "RM-001",
    label: "Contract Recognition Board decision",
    url: "https://www.fia.com/news/decision-contract-recognition-board-02092022",
  },
  redBull: {
    mark: "MCL",
    id: "RM-003",
    label: "McLaren multi-year extension",
    url: "https://www.mclaren.com/racing/formula-1/2025/mclaren-formula-1-team-announce-multi-year-contract-extension-with-oscar-piastri/",
  },
  teamOrders: {
    mark: "F1",
    id: "RM-014",
    label: "Public team-order sequence",
    url: "https://www.formula1.com/en/latest/article/piastri-concedes-there-were-valid-reasons-for-mclaren-team-orders-in-monza.fCgwRC1rwwqj0ZxjYrBJP",
  },
  hungary: {
    mark: "F1",
    id: "RM-015",
    label: "Official 2024 Hungarian GP result",
    url: "https://www.formula1.com/en/latest/article/piastri-wins-hungarian-grand-prix-as-norris-belatedly-hands-back-lead-in.70F4mNzYrbmvNYaj8KXm18",
  },
  xCorrection: {
    mark: "X",
    id: "EV-034",
    label: "Direct, bounded public correction",
    url: "https://x.com/OscarPiastri/status/1554527452231262210",
  },
  xWin: {
    mark: "X",
    id: "EV-039",
    label: "Compressed first-win reaction",
    url: "https://x.com/OscarPiastri/status/1815060903663935931",
  },
  xWinLong: {
    mark: "X",
    id: "EV-040",
    label: "Bounded first-win acknowledgement",
    url: "https://x.com/OscarPiastri/status/1815091307963904440",
  },
  xSetback: {
    mark: "X",
    id: "EV-045",
    label: "Compact mixed-season reflection",
    url: "https://x.com/OscarPiastri/status/1998121758025470085",
  },
  xBanter: {
    mark: "X",
    id: "EV-046",
    label: "Context-bound literal reply",
    url: "https://x.com/OscarPiastri/status/1819104317447586283",
  },
};

const DEFAULT_TRACE = {
  route: "fan_light",
  domain: "F1 / fan context",
  fact: "No current fact required",
  style: "SC-05 · light fan banter",
  styleNote: "One understated twist at most. No copied catchphrase.",
  meters: [84, 34, 72],
  sources: [SOURCE_LIBRARY.xBanter],
};

const els = {
  messages: document.querySelector("#messages"),
  form: document.querySelector("#composerForm"),
  input: document.querySelector("#messageInput"),
  typing: document.querySelector("#typingIndicator"),
  promptList: document.querySelector("#promptList"),
  reset: document.querySelector("#resetButton"),
  panel: document.querySelector("#insightPanel"),
  panelButton: document.querySelector("#panelButton"),
  closePanel: document.querySelector("#closePanelButton"),
  factsOnly: document.querySelector("#factsOnlyToggle"),
  evidenceToggle: document.querySelector("#evidenceToggle"),
  evidenceList: document.querySelector("#evidenceList"),
  routeBadge: document.querySelector("#routeBadge"),
  domainTrace: document.querySelector("#domainTrace"),
  factTrace: document.querySelector("#factTrace"),
  styleTrace: document.querySelector("#styleTrace"),
  styleNote: document.querySelector("#styleNote"),
  clearContext: document.querySelector("#clearContextButton"),
  composerContext: document.querySelector("#composerContext"),
  raceName: document.querySelector("#raceName"),
  raceCode: document.querySelector("#raceCode"),
  raceRound: document.querySelector("#raceRound"),
  sessionLabel: document.querySelector("#sessionLabel"),
  sessionTime: document.querySelector("#sessionTime"),
};

let currentTrace = DEFAULT_TRACE;
let contextEnabled = true;
let messageCounter = 0;

function containsChinese(value) {
  return /[\u3400-\u9fff]/.test(value);
}

function normalise(value) {
  return value.trim().toLocaleLowerCase();
}

function makeResponse(prompt) {
  const input = normalise(prompt);
  const zh = containsChinese(prompt);
  const factsOnly = els.factsOnly.checked;

  if (/^(你好|您好|嗨|哈喽|在吗|hello|hi|hey)[!！.。\s]*$/i.test(input)) {
    return {
      en: "Hey. What are we talking about — Oscar, McLaren, or the next race?",
      zh: "嗨。想聊 Oscar、McLaren，还是下一场比赛？",
      singleLanguage: true,
      trace: {
        route: "fan_light",
        domain: "Simple social greeting",
        fact: "No factual claim required",
        style: "SC-05 · minimal greeting",
        styleNote: "Answer naturally, then offer only in-scope conversation choices.",
        meters: [98, 0, 92],
        sources: [],
      },
    };
  }

  if (/(一个字一个字|本人.*写|亲自.*写|authorship|wrote every|social.*team)/i.test(input) && /(x|推文|帖子|发言|caption)/i.test(input)) {
    return {
      en: "Individual authorship is unverified. @OscarPiastri is a first-party public account, so its output can support style analysis, but the public record does not identify who drafted, edited, or published each post.",
      zh: "无法逐条确认作者。@OscarPiastri 属于第一方公开账号，其输出可以支持风格分析，但公开资料没有说明每条内容由谁撰写、编辑或发布。",
      trace: {
        route: "rumor_check",
        domain: "Public-account authorship claim",
        fact: "RM-012 · item authorship unverified",
        style: "Facts only · no persona performance",
        styleNote: "Account output is evidence. Item-level authorship is not assumed.",
        meters: [78, 0, 96],
        sources: [SOURCE_LIBRARY.xCorrection, SOURCE_LIBRARY.xBanter],
      },
    };
  }

  if (/(81|车号|号码|race number)/i.test(input)) {
    return {
      en: "It came from karting. I started with 11 because those were the stickers I had; when 11 was taken at the Victorian state titles, the first digit became an 8. Fairly practical, really.",
      zh: "它来自卡丁车时期。我最初用了 11，因为手边只有数字 1 的贴纸；后来参加维多利亚州锦标赛时 11 已被占用，于是第一位改成了 8。其实很实际。",
      factsEn: "Piastri has said the number came from karting: he first used 11 because those were the stickers available, then changed the first digit to 8 when 11 was taken at the Victorian state titles.",
      factsZh: "Piastri 公开解释过，81 来自卡丁车时期：他先因手边只有数字 1 的贴纸用了 11，后来州锦标赛上 11 已被占用，于是把第一位改成 8。",
      trace: {
        route: "public_fact",
        domain: "Verified public biography",
        fact: "KF-004 · stable fact",
        style: factsOnly ? "Facts only" : "SC-05 · one dry close",
        styleNote: "No symbolic meaning is invented for the number.",
        meters: [69, factsOnly ? 0 : 16, 94],
        sources: [SOURCE_LIBRARY.number81],
      },
    };
  }

  if (/(alpine|阿尔派|背弃|contract recognition|crb)/i.test(input)) {
    return {
      en: "The claim is false as stated. The FIA Contract Recognition Board found that the only agreement it recognised for 2023 and 2024 was Piastri's McLaren contract; being Alpine's reserve driver in 2022 was not the same as holding a valid 2023 Alpine race contract.",
      zh: "这句话不准确。FIA 合同认可委员会裁定，唯一被认可的 2023–2024 合同是 Piastri 的 McLaren 合同；他在 2022 年担任 Alpine 预备车手，并不等于持有有效的 2023 Alpine 正赛车手合同。",
      trace: {
        route: "rumor_check",
        domain: "Contract-history claim",
        fact: "RM-001 · false as stated",
        style: "Facts only · no persona performance",
        styleNote: "Preserve the reserve-driver fact while correcting the contract claim.",
        meters: [63, 0, 98],
        sources: [SOURCE_LIBRARY.alpine, SOURCE_LIBRARY.xCorrection],
      },
    };
  }

  if (/(red bull|红牛|转会|离队|leave mclaren|signed for)/i.test(input)) {
    return {
      en: "There is no official confirmation of that move. The current public record includes a multi-year McLaren extension, so this is unsupported as of this demo's 4 September 2026 knowledge snapshot, not proof that a future move is impossible.",
      zh: "目前没有官方确认这一转会。现有公开记录包括他与 McLaren 的多年续约，因此截至本演示采用的 2026 年 9 月 4 日知识快照，这个说法没有可靠支持；这不代表未来转会永远不可能。",
      trace: {
        route: "rumor_check",
        domain: "Live driver-market claim",
        fact: "RM-003 · currently unsupported",
        style: "Facts only · dated verdict",
        styleNote: "Absence of an announcement is not permanent proof of falsity.",
        meters: [66, 0, 88],
        sources: [SOURCE_LIBRARY.redBull],
      },
    };
  }

  if (/(从来不会质疑|永远服从|车队指令|team order|always obey|never question)/i.test(input)) {
    return {
      en: "That is false as stated. Public radio records Piastri questioning specific instructions and their fairness while sometimes still carrying out the immediate decision. Compliance is not the same as agreement.",
      zh: "这句话不准确。公开无线电记录过 Piastri 质疑具体指令及其公平性，同时有时仍执行当下决定。执行不等于认同。",
      trace: {
        route: "rumor_check",
        domain: "Absolute team-order claim",
        fact: "RM-014 · false as stated",
        style: "Facts only · preserve event sequence",
        styleNote: "Do not replace one absolute trait with its opposite.",
        meters: [76, 0, 97],
        sources: [SOURCE_LIBRARY.teamOrders],
      },
    };
  }

  if (/(匈牙利|hungar|首胜不算|gifted win|not a real win)/i.test(input)) {
    return {
      en: "That mixes a result fact with a value judgment. Piastri is the official winner of the 2024 Hungarian Grand Prix; the late team-order sequence is open to analysis, but it does not erase the classified win.",
      zh: "这把赛果事实和价值判断混在了一起。Piastri 是 2024 年匈牙利大奖赛的官方冠军；末段车队指令可以讨论，但不会取消正式胜者身份。",
      trace: {
        route: "rumor_check",
        domain: "Result fact versus opinion",
        fact: "RM-015 · misleading",
        style: "Facts only · no persona performance",
        styleNote: "Debate the event without rewriting the classified result.",
        meters: [71, 0, 98],
        sources: [SOURCE_LIBRARY.hungary],
      },
    };
  }

  if (/(没有情绪|从不庆祝|emotionless|never celebrate|never excited)/i.test(input)) {
    return {
      en: "That is an overstatement. The public style is often restrained, but first-win posts also show direct excitement and thanks. Compressed expression is not the absence of emotion, and public text cannot measure private emotion anyway.",
      zh: "这是过度概括。他的公开表达经常很克制，但首胜内容中也有直接的兴奋和感谢。表达简短不等于没有情绪，公开文字也无法测量私人情绪。",
      trace: {
        route: "rumor_check",
        domain: "Public-expression stereotype",
        fact: "RM-013 · misleading",
        style: "Facts only · no inner-state claim",
        styleNote: "Describe observable expression, not private emotional intensity.",
        meters: [74, 0, 92],
        sources: [SOURCE_LIBRARY.xWin, SOURCE_LIBRARY.xWinLong],
      },
    };
  }

  if (/(女友|分手|恋爱|私下关系|内心|抑郁|焦虑|girlfriend|breakup|private relationship|diagnose)/i.test(input)) {
    return {
      en: "That's not something this experience can verify or catalogue. Public photos, likes, and fan inference are not reliable evidence of a private relationship or inner state.",
      zh: "这不是这个体验可以核验或整理的内容。公开照片、点赞和粉丝推测都不是判断私人关系或内心状态的可靠证据。",
      trace: {
        route: "private_or_inner_state_unverified",
        domain: "Private or unverified personal claim",
        fact: "Privacy boundary · do not investigate",
        style: "SC-06 · direct stop",
        styleNote: "Do not list names, theories, or inferred feelings.",
        meters: [91, 0, 99],
        sources: [],
      },
    };
  }

  if (/(python|代码|编程|数学|高数|菜谱|吃什么|股票|投资|博彩|bet|medical|诊断|律师|legal)/i.test(input)) {
    const professional = /(股票|投资|博彩|bet|medical|诊断|律师|legal)/i.test(input);
    return {
      en: professional ? "You should get that from someone qualified." : "Not really my field.",
      zh: professional ? "这应该交给有资质的人回答。" : "这不是我的领域。",
      trace: {
        route: professional ? "medical_legal_financial" : "unrelated_general",
        domain: professional ? "Professional-advice boundary" : "Outside Piastri / F1 scope",
        fact: "No retrieval performed",
        style: professional ? "SC-07 · unstyled refusal" : "SC-06 · direct stop",
        styleNote: "End after the boundary. No redirect or engagement hook.",
        meters: [98, 0, 99],
        sources: [],
      },
    };
  }

  if (/(win|won|victory|podium|领奖台|赢|冠军|brilliant)/i.test(input)) {
    return {
      en: factsOnly ? "The supplied context describes a win; this demo has not loaded a classified result beyond that context." : "That was a good one. The result looks simple; getting the whole weekend there usually isn't.",
      zh: factsOnly ? "当前输入描述了一场胜利；除此之外，本演示没有载入正式赛果，因而不补充更多事实。" : "这场不错。结果看起来简单，但把整个周末带到这里通常并不简单。",
      trace: factsOnly ? {
        route: "insufficient_current_fact",
        domain: "Positive race context",
        fact: "Only the user-supplied result is available",
        style: "Facts only · persona suppressed",
        styleNote: "No race detail is invented when the classified result is absent.",
        meters: [82, 0, 78],
        sources: [],
      } : {
        route: "fan_light",
        domain: "Positive fan reaction",
        fact: "User-supplied win context",
        style: "SC-02 · restrained win",
        styleNote: "Short first reaction; no destiny claim or mandatory speech.",
        meters: [87, 12, 72],
        sources: [SOURCE_LIBRARY.xWin, SOURCE_LIBRARY.xWinLong],
      },
    };
  }

  const asksAboutAttachedContext = contextEnabled && /(怎么看|这场|这里|这一段|这个结果|what do you think|this race|that result)/i.test(input);
  if (/(bad|mistake|失误|遗憾|retire|退赛|strategy|策略|tyre|轮胎|pace|速度|qualifying|排位|race|比赛|f1|mclaren)/i.test(input) || asksAboutAttachedContext) {
    return {
      en: factsOnly ? "I don't have enough verified session data in this static demo to identify the cause. Pace, tyre state, gaps, and the event record would need to be checked first." : "First work out what actually capped the result: pace, tyres, traffic, or the decision itself. Without that, a confident answer would just be theatre.",
      zh: factsOnly ? "这个静态演示没有足够的已核验赛段数据来确认原因；需要先核对速度、轮胎状态、差距和赛事记录。" : "先弄清真正限制结果的是什么：速度、轮胎、交通，还是决策本身。没有这些信息，过度确定的回答只是表演。",
      trace: {
        route: factsOnly ? "insufficient_current_fact" : "f1_grounded",
        domain: "Race or session analysis",
        fact: "Current session data not loaded",
        style: factsOnly ? "Facts only · stop at evidence gap" : "SC-01 · measured debrief",
        styleNote: "Name the missing constraints before making a driver-specific judgment.",
        meters: [62, 0, 68],
        sources: [],
      },
    };
  }

  return {
    en: "Not really my field.",
    zh: "这不是我的领域。",
    trace: {
      route: "unrelated_general",
      domain: "Outside Piastri / F1 scope",
      fact: "No retrieval performed",
      style: "SC-06 · direct stop",
      styleNote: "End after the boundary. No redirect or engagement hook.",
      meters: [98, 0, 99],
      sources: [],
    },
  };
}

function addMessage(role, text, translation = "") {
  const article = document.createElement("article");
  article.className = `message ${role === "user" ? "user-message" : "assistant-message"}`;

  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = role === "user" ? "YOU" : "81";

  const copy = document.createElement("div");
  copy.className = "message-copy";
  const main = document.createElement("p");
  main.className = "english";
  main.textContent = text;
  copy.append(main);

  if (translation) {
    const translated = document.createElement("p");
    translated.className = "translation";
    const label = document.createElement("span");
    label.textContent = "中文";
    translated.append(label, document.createTextNode(` ${translation}`));
    copy.append(translated);
  }

  if (role === "assistant") {
    const actions = document.createElement("div");
    actions.className = "answer-actions";
    const why = document.createElement("button");
    why.type = "button";
    why.textContent = "WHY THIS ANSWER";
    why.addEventListener("click", () => setPanel(true));
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "COPY";
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText([text, translation && `中文：${translation}`].filter(Boolean).join("\n\n"));
        copyButton.textContent = "COPIED";
        setTimeout(() => { copyButton.textContent = "COPY"; }, 1200);
      } catch (_) {
        copyButton.textContent = "SELECT TEXT";
      }
    });
    actions.append(why, copyButton);
    copy.append(actions);
  }

  article.append(meta, copy);
  els.messages.append(article);
  els.messages.scrollTop = els.messages.scrollHeight;
  messageCounter += 1;
}

function renderTrace(trace) {
  currentTrace = trace;
  els.routeBadge.textContent = trace.route.toUpperCase();
  els.domainTrace.textContent = trace.domain;
  els.factTrace.textContent = trace.fact;
  els.styleTrace.textContent = trace.style;
  els.styleNote.textContent = trace.styleNote;

  const meterBars = document.querySelectorAll(".meter-row i");
  const meterValues = document.querySelectorAll(".meter-row strong");
  trace.meters.forEach((value, index) => {
    meterBars[index].style.width = `${value}%`;
    meterValues[index].textContent = value;
  });

  els.evidenceList.replaceChildren();
  if (!trace.sources.length) {
    const empty = document.createElement("p");
    empty.className = "rail-note";
    empty.textContent = "No source opened for this route.";
    els.evidenceList.append(empty);
    return;
  }

  trace.sources.forEach((source) => {
    const link = document.createElement("a");
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    const mark = document.createElement("span");
    mark.className = "source-mark";
    mark.textContent = source.mark;
    const detail = document.createElement("span");
    const id = document.createElement("strong");
    id.textContent = source.id;
    const label = document.createElement("small");
    label.textContent = source.label;
    detail.append(id, label);
    const arrow = document.createElement("i");
    arrow.textContent = "↗";
    link.append(mark, detail, arrow);
    els.evidenceList.append(link);
  });
}

function setPanel(open) {
  els.panel.classList.toggle("is-open", open);
  els.panelButton.setAttribute("aria-expanded", String(open));
}

function resizeInput() {
  els.input.style.height = "auto";
  els.input.style.height = `${Math.min(els.input.scrollHeight, 110)}px`;
}

function syncViewportHeight() {
  const height = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty("--companion-viewport-height", `${Math.round(height)}px`);
}

async function submitPrompt(rawPrompt) {
  const prompt = rawPrompt.trim();
  if (!prompt || els.typing.hidden === false) return;
  addMessage("user", prompt);
  els.input.value = "";
  resizeInput();
  els.typing.hidden = false;
  els.messages.scrollTop = els.messages.scrollHeight;

  const response = makeResponse(prompt);
  await new Promise((resolve) => setTimeout(resolve, 430));
  els.typing.hidden = true;
  const useZh = containsChinese(prompt);
  const text = response.singleLanguage && useZh
    ? response.zh
    : (els.factsOnly.checked && response.factsEn ? response.factsEn : response.en);
  const translation = response.singleLanguage
    ? ""
    : (useZh ? (els.factsOnly.checked && response.factsZh ? response.factsZh : response.zh) : "");
  addMessage("assistant", text, translation);
  renderTrace(response.trace);
}

function resetConversation() {
  const seeded = els.messages.querySelector(".assistant-message");
  els.messages.replaceChildren(seeded);
  messageCounter = 0;
  renderTrace(DEFAULT_TRACE);
  els.input.focus();
}

function formatSessionTime(iso) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date) + " CST";
}

async function loadRaceContext() {
  try {
    const response = await fetch("../data/calendar.json", { cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    const race = data.next_race;
    if (!race) return;
    els.raceName.textContent = race.name;
    els.raceCode.textContent = race.country_code || "F1";
    els.raceRound.textContent = `ROUND ${race.round} · ${(race.locality || race.country_code || "F1").toUpperCase()}`;
    const sessions = Object.entries(race.sessions || {}).map(([key, value]) => ({ key, value, date: new Date(value) }));
    const next = sessions.find((session) => session.date.getTime() >= Date.now()) || sessions.at(-1);
    if (next) {
      const labels = { practice_1: "PRACTICE 1", practice_2: "PRACTICE 2", practice_3: "PRACTICE 3", sprint_qualifying: "SPRINT QUALI", sprint: "SPRINT", qualifying: "QUALIFYING", race: "RACE" };
      els.sessionLabel.textContent = labels[next.key] || next.key.toUpperCase();
      els.sessionTime.textContent = formatSessionTime(next.value);
      els.composerContext.textContent = `${race.name.replace(" Grand Prix", " GP")} · ${(labels[next.key] || next.key).replace("PRACTICE", "FP")}`;
    }
  } catch (_) {
    // The deterministic fallback remains usable when opened directly from disk.
  }
}

els.form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitPrompt(els.input.value);
});

els.input.addEventListener("input", resizeInput);
els.input.addEventListener("focus", () => {
  window.setTimeout(() => {
    syncViewportHeight();
    els.messages.scrollTop = els.messages.scrollHeight;
  }, 120);
});
els.input.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    els.form.requestSubmit();
  }
});

els.promptList.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-prompt]");
  if (button) submitPrompt(button.dataset.prompt);
});

els.reset.addEventListener("click", resetConversation);
els.panelButton.addEventListener("click", () => setPanel(!els.panel.classList.contains("is-open")));
els.closePanel.addEventListener("click", () => setPanel(false));
els.evidenceToggle.addEventListener("click", () => {
  const hidden = els.evidenceList.hidden;
  els.evidenceList.hidden = !hidden;
  els.evidenceToggle.textContent = hidden ? "Hide" : "Show";
  els.evidenceToggle.setAttribute("aria-expanded", String(hidden));
});
els.clearContext.addEventListener("click", () => {
  contextEnabled = false;
  els.clearContext.parentElement.hidden = true;
});
els.factsOnly.addEventListener("change", () => {
  renderTrace({ ...currentTrace, style: els.factsOnly.checked ? "Facts only · persona suppressed" : currentTrace.style });
});

window.addEventListener("resize", syncViewportHeight);
window.visualViewport?.addEventListener("resize", syncViewportHeight);

syncViewportHeight();
loadRaceContext();
renderTrace(DEFAULT_TRACE);
