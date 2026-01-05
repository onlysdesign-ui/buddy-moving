import { DEFAULT_TEST_KEYS, RUN_STATUS } from "./types.js";
import { streamSse } from "./sseClient.js";
import { addRun, loadRuns, saveRuns } from "./storage.js";

const elements = {
  runButton: document.getElementById("run-tests"),
  cancelButton: document.getElementById("cancel-tests"),
  status: document.getElementById("tests-status"),
  history: document.getElementById("tests-history"),
};

const state = {
  data: null,
  cases: [],
  runs: [],
  expandedRunId: null,
  expandedCases: {},
  expandedKeys: {},
  isRunning: false,
  progress: { completed: 0, total: 0 },
  currentLabel: "",
  controller: null,
  cancelRequested: false,
  activeRunId: null,
};

const getApiBase = () => {
  if (window.VITE_BACKEND_URL) return window.VITE_BACKEND_URL;
  if (window.VITE_API_BASE) return window.VITE_API_BASE;
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return "http://localhost:3000";
  }
  return "https://buddy-moving.onrender.com";
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const formatDateTime = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Unknown time";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDuration = (start, end) => {
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) return "—";
  const seconds = Math.max(0, Math.round((endTime - startTime) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
};

const formatTags = (tags = []) => {
  const limited = tags.slice(0, 3);
  const extra = tags.length - limited.length;
  return {
    tags: limited,
    extra: extra > 0 ? `+${extra}` : null,
  };
};

const normalizeCase = (entry, context, index) => {
  const raw = entry && typeof entry === "object" ? entry : {};
  const id = String(raw.id || `${context.id}-case-${index + 1}`);
  return {
    id,
    contextId: context.id,
    contextTitle: context.title,
    contextText: context.context,
    title: String(raw.title || raw.task || `Case ${index + 1}`),
    task: String(raw.task || raw.title || ""),
    scale: String(raw.scale || "medium"),
    tags: Array.isArray(raw.tags) ? raw.tags.map((tag) => String(tag)) : [],
  };
};

const normalizeContext = (entry, index) => {
  const raw = entry && typeof entry === "object" ? entry : {};
  const id = String(raw.id || `context-${index + 1}`);
  const title = String(raw.title || `Context ${index + 1}`);
  const contextText = String(raw.context || "");
  const cases = Array.isArray(raw.cases)
    ? raw.cases.map((caseEntry, caseIndex) =>
        normalizeCase(caseEntry, { id, title, context: contextText }, caseIndex),
      )
    : [];

  return {
    id,
    title,
    context: contextText,
    cases,
  };
};

const loadTestCases = async () => {
  const response = await fetch(new URL("./eval_cases_v2.json", import.meta.url));
  if (!response.ok) {
    throw new Error(`Unable to load test cases (${response.status}).`);
  }
  const data = await response.json();
  const contexts = Array.isArray(data?.contexts)
    ? data.contexts.map(normalizeContext)
    : [];
  return { contexts };
};

const flattenCases = (data) =>
  Array.isArray(data?.contexts)
    ? data.contexts.flatMap((context) => context.cases || [])
    : [];

const setControls = () => {
  if (!elements.runButton || !elements.cancelButton) return;
  elements.runButton.disabled = state.isRunning;
  elements.cancelButton.hidden = !state.isRunning;
};

const setStatusLine = () => {
  if (!elements.status) return;
  if (!state.isRunning) {
    elements.status.textContent = "";
    return;
  }
  const { completed, total } = state.progress;
  const label = state.currentLabel ? ` — ${state.currentLabel}` : "";
  elements.status.textContent = `Running... ${completed}/${total}${label}`;
};

const getCaseKeys = (result) => {
  const analysis = result.analysis || {};
  const defaultKeys = DEFAULT_TEST_KEYS.filter((key) => analysis[key]);
  const extraKeys = Object.keys(analysis).filter(
    (key) => !DEFAULT_TEST_KEYS.includes(key),
  );
  return [...defaultKeys, ...extraKeys];
};

const computeStatus = ({ summary }, cancelled) => {
  if (cancelled) return RUN_STATUS.cancelled;
  const { succeeded, failed, totalCases, cancelled: cancelledCount } = summary;
  const executed = succeeded + failed + cancelledCount;
  if (executed < totalCases) return RUN_STATUS.partial;
  if (succeeded > 0 && failed === 0 && cancelledCount === 0)
    return RUN_STATUS.success;
  if (succeeded > 0 && failed > 0) return RUN_STATUS.partial;
  return RUN_STATUS.failed;
};

const renderRuns = () => {
  if (!elements.history) return;
  if (!state.runs.length) {
    elements.history.innerHTML =
      '<div class="tests-run">No runs yet. Run the suite to get started.</div>';
    return;
  }

  elements.history.innerHTML = state.runs
    .map((run) => {
      const isExpanded = run.id === state.expandedRunId;
      const summary = run.summary || { succeeded: 0, failed: 0, cancelled: 0 };
      const badgeClass = `status-badge status-${run.status}`;
      const runHeader = `
        <button type="button" class="tests-run-header" data-action="toggle-run" data-run-id="${run.id}">
          <div>
            <strong>${formatDateTime(run.createdAt)}</strong>
          </div>
          <div class="tests-run-meta">
            <span class="${badgeClass}">${run.status}</span>
            <span>${summary.succeeded} passed</span>
            <span>${summary.failed} failed</span>
            <span>${summary.cancelled} cancelled</span>
          </div>
        </button>
      `;

      if (!isExpanded) {
        return `<div class="tests-run">${runHeader}</div>`;
      }

      const contextBlocks = (state.data?.contexts || [])
        .map((context) => {
          const caseResults = (context.cases || [])
            .map((caseItem) => {
              const result = run.results.find((entry) => entry.caseId === caseItem.id);
              return result ? { result, caseItem } : null;
            })
            .filter(Boolean);

          if (!caseResults.length) return "";

          const casesMarkup = caseResults
            .map(({ result, caseItem }) => {
              const duration = formatDuration(result.startedAt, result.finishedAt);
              const tagInfo = formatTags(caseItem.tags || []);
              const caseExpanded = state.expandedCases[caseItem.id];
              const caseHeader = `
                <div class="case-row">
                  <span class="case-scale">${caseItem.scale}</span>
                  <span class="case-title">${caseItem.title}</span>
                  <span class="${result.ok ? "case-ok" : "case-fail"}">
                    ${result.ok ? "OK" : "Fail"}
                  </span>
                  <span class="case-tags">
                    ${tagInfo.tags.join(", ")}${tagInfo.extra ? ` ${tagInfo.extra}` : ""}
                  </span>
                  <span class="case-duration">${duration}</span>
                  <button class="case-toggle" type="button" data-action="toggle-case" data-case-id="${caseItem.id}">
                    ${caseExpanded ? "Hide" : "Details"}
                  </button>
                </div>
              `;

              if (!caseExpanded) {
                return `<div class="case-card">${caseHeader}</div>`;
              }

              const keysMarkup = getCaseKeys(result)
                .map((key) => {
                  const entry = result.analysis?.[key] || {};
                  const summary = entry.summary || entry.value || "";
                  const value = entry.value || entry.summary || "";
                  const toggleId = `${run.id}-${caseItem.id}-${key}`;
                  const showFull = state.expandedKeys[toggleId];
                  return `
                    <div class="case-key">
                      <div class="case-key-header">
                        <strong>${key}</strong>
                        <button type="button" class="case-toggle" data-action="toggle-full" data-toggle-id="${toggleId}">
                          ${showFull ? "Hide full" : "Show full"}
                        </button>
                      </div>
                      <pre>${showFull ? value || summary : summary || value}</pre>
                    </div>
                  `;
                })
                .join("");

              const errorMarkup = result.error ? `<p>${result.error}</p>` : "";

              return `
                <div class="case-card">
                  ${caseHeader}
                  <div class="case-details">
                    ${errorMarkup}
                    ${keysMarkup}
                  </div>
                </div>
              `;
            })
            .join("");

          return `
            <div class="context-block">
              <h3>${context.title}</h3>
              <div class="case-list">${casesMarkup}</div>
            </div>
          `;
        })
        .join("");

      return `
        <div class="tests-run">
          ${runHeader}
          ${contextBlocks || "<p>No results yet.</p>"}
        </div>
      `;
    })
    .join("");
};

const updateRuns = (updater) => {
  state.runs = updater(state.runs);
  saveRuns(state.runs);
  renderRuns();
};

const runSingleCase = async ({ testCase, signal }) => {
  const startedAt = new Date().toISOString();
  const analysis = {};
  const okKeys = new Set();
  let error = null;
  let language = null;

  const { sawDone } = await streamSse({
    url: `${getApiBase()}/analyze/stream`,
    payload: {
      task: testCase.task,
      context: testCase.contextText,
      keys: DEFAULT_TEST_KEYS,
    },
    signal,
    onEvent: (event, data) => {
      if (!data) return;
      if (event === "status") {
        try {
          const payload = JSON.parse(data);
          if (payload?.language) {
            language = payload.language;
          }
        } catch (parseError) {
          console.warn("Failed to parse status payload", parseError);
        }
      }
      if (event === "key") {
        try {
          const payload = JSON.parse(data);
          if (!payload?.key) return;
          analysis[payload.key] = {
            summary: payload.summary ?? "",
            value: payload.value ?? payload.summary ?? "",
            status: payload.status ?? "",
          };
          const status = String(payload.status || "").toLowerCase();
          if (["ok", "success", "done"].includes(status)) {
            okKeys.add(payload.key);
          }
        } catch (parseError) {
          console.warn("Failed to parse key payload", parseError);
        }
      }
      if (event === "error") {
        try {
          const payload = JSON.parse(data);
          error = payload?.error || payload?.details || "Unknown error";
        } catch (parseError) {
          error = "Unknown error";
        }
      }
    },
  });

  const finishedAt = new Date().toISOString();
  const ok = sawDone && okKeys.size >= 3 && !error;

  return {
    caseId: testCase.id,
    contextId: testCase.contextId,
    title: testCase.title,
    scale: testCase.scale,
    tags: testCase.tags,
    startedAt,
    finishedAt,
    ok,
    language,
    error: ok ? undefined : error || "Missing required output.",
    analysis,
  };
};

const runAllCases = async () => {
  const total = state.cases.length;
  const runId = `run-${Date.now()}`;
  const run = {
    id: runId,
    createdAt: new Date().toISOString(),
    status: RUN_STATUS.partial,
    summary: {
      totalCases: total,
      succeeded: 0,
      failed: 0,
      cancelled: 0,
    },
    results: [],
  };

  state.isRunning = true;
  state.progress = { completed: 0, total };
  state.currentLabel = "";
  state.cancelRequested = false;
  state.activeRunId = runId;
  state.controller = new AbortController();
  state.expandedRunId = runId;
  state.runs = addRun(state.runs, run);
  renderRuns();
  setControls();
  setStatusLine();

  let executedCases = 0;

  try {
    for (let index = 0; index < state.cases.length; index += 1) {
      if (state.controller.signal.aborted) break;
      const testCase = state.cases[index];
      state.currentLabel = `${testCase.contextTitle} — ${testCase.title}`;
      setStatusLine();

      let result;
      try {
        result = await runSingleCase({ testCase, signal: state.controller.signal });
      } catch (error) {
        if (state.controller.signal.aborted) break;
        result = {
          caseId: testCase.id,
          contextId: testCase.contextId,
          title: testCase.title,
          scale: testCase.scale,
          tags: testCase.tags,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          ok: false,
          language: null,
          error: error?.message || "Failed to run case.",
          analysis: {},
        };
      }

      executedCases += 1;
      state.progress = { completed: executedCases, total };

      updateRuns((prev) =>
        prev.map((entry) => {
          if (entry.id !== runId) return entry;
          const results = [...entry.results, result];
          const succeeded = results.filter((item) => item.ok).length;
          const failed = results.length - succeeded;
          const cancelled = state.cancelRequested ? total - executedCases : 0;
          const summary = {
            totalCases: total,
            succeeded,
            failed,
            cancelled,
          };
          return {
            ...entry,
            results,
            summary,
            status: computeStatus({ summary }, state.cancelRequested),
          };
        }),
      );

      setStatusLine();
      if (index < state.cases.length - 1) {
        await delay(300);
      }
    }
  } finally {
    const cancelled = state.cancelRequested || state.controller.signal.aborted;
    updateRuns((prev) =>
      prev.map((entry) => {
        if (entry.id !== runId) return entry;
        const succeeded = entry.results.filter((item) => item.ok).length;
        const failed = entry.results.length - succeeded;
        const cancelledCount = cancelled ? total - entry.results.length : 0;
        const summary = {
          totalCases: total,
          succeeded,
          failed,
          cancelled: cancelledCount,
        };
        return {
          ...entry,
          summary,
          status: computeStatus({ summary }, cancelled),
        };
      }),
    );
    state.isRunning = false;
    state.controller = null;
    state.currentLabel = "";
    state.activeRunId = null;
    state.progress = { completed: 0, total: 0 };
    setControls();
    setStatusLine();
  }
};

const handleCancel = () => {
  state.cancelRequested = true;
  state.controller?.abort();
};

const handleHistoryClick = (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;

  if (action === "toggle-run") {
    const runId = target.dataset.runId;
    if (!runId) return;
    state.expandedRunId = state.expandedRunId === runId ? null : runId;
    renderRuns();
    return;
  }

  if (action === "toggle-case") {
    const caseId = target.dataset.caseId;
    if (!caseId) return;
    state.expandedCases[caseId] = !state.expandedCases[caseId];
    renderRuns();
    return;
  }

  if (action === "toggle-full") {
    const toggleId = target.dataset.toggleId;
    if (!toggleId) return;
    state.expandedKeys[toggleId] = !state.expandedKeys[toggleId];
    renderRuns();
  }
};

const init = async () => {
  state.runs = loadRuns().sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  state.expandedRunId = state.runs[0]?.id || null;

  try {
    state.data = await loadTestCases();
    state.cases = flattenCases(state.data);
  } catch (error) {
    console.error(error);
  }

  renderRuns();
  setControls();
  setStatusLine();

  elements.runButton?.addEventListener("click", () => {
    if (!state.isRunning) {
      runAllCases();
    }
  });

  elements.cancelButton?.addEventListener("click", handleCancel);
  elements.history?.addEventListener("click", handleHistoryClick);
};

init();
