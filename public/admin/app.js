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
};

const elements = {
  actionHint: document.querySelector("#actionHint"),
  adminKeyInput: document.querySelector("#adminKeyInput"),
  approveButton: document.querySelector("#approveButton"),
  candidateList: document.querySelector("#candidateList"),
  candidateScore: document.querySelector("#candidateScore"),
  connectionState: document.querySelector("#connectionState"),
  dateInput: document.querySelector("#dateInput"),
  decisionReasonInput: document.querySelector("#decisionReasonInput"),
  editorTitle: document.querySelector("#editorTitle"),
  emptyState: document.querySelector("#emptyState"),
  originalTitle: document.querySelector("#originalTitle"),
  pendingCount: document.querySelector("#pendingCount"),
  queueUpdated: document.querySelector("#queueUpdated"),
  reasonZhInput: document.querySelector("#reasonZhInput"),
  refreshButton: document.querySelector("#refreshButton"),
  rejectButton: document.querySelector("#rejectButton"),
  reviewForm: document.querySelector("#reviewForm"),
  saveSettingsButton: document.querySelector("#saveSettingsButton"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsDialog: document.querySelector("#settingsDialog"),
  sourceLink: document.querySelector("#sourceLink"),
  statusBadge: document.querySelector("#statusBadge"),
  summaryZhInput: document.querySelector("#summaryZhInput"),
  titleZhInput: document.querySelector("#titleZhInput"),
  toast: document.querySelector("#toast"),
  typeInput: document.querySelector("#typeInput"),
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

function updateConnectionState() {
  const connected = Boolean(workerUrl() && adminKey());
  elements.connectionState.textContent = connected ? "审核接口已配置" : "未连接审核接口";
  elements.connectionState.style.color = connected ? "var(--success)" : "var(--muted)";
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

function saveSettings() {
  if (!elements.workerUrlInput.reportValidity() || !elements.adminKeyInput.reportValidity()) return;
  localStorage.setItem("piasnewsWorkerUrl", elements.workerUrlInput.value.trim().replace(/\/$/, ""));
  sessionStorage.setItem("piasnewsAdminKey", elements.adminKeyInput.value);
  elements.settingsDialog.close();
  updateConnectionState();
  showToast("审核接口设置已保存。");
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
elements.refreshButton.addEventListener("click", () => loadCandidates());
elements.settingsButton.addEventListener("click", openSettings);
elements.saveSettingsButton.addEventListener("click", saveSettings);

updateConnectionState();
loadCandidates({ preserveSelection: false });
