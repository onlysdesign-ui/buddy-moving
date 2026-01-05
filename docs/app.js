const API_BASE = (
  globalThis?.VITE_BACKEND_URL ||
  globalThis?.VITE_API_BASE ||
  "http://localhost:3000"
).replace(/\/$/, "");
const DEFAULT_KEYS = [
  "framing",
  "unknowns",
  "solution_space",
  "decision",
  "experiment_plan",
  "work_package",
];
const KEY_TITLES = {
  framing: "Framing",
  unknowns: "Unknowns",
  solution_space: "Solution space",
  decision: "Decision",
  experiment_plan: "Experiment plan",
  work_package: "Work package",
};
const KEY_SET = new Set(DEFAULT_KEYS);
const STORAGE_KEYS = {
  task: "buddyMoving.task",
  context: "buddyMoving.context",
  contextUpdatedAt: "buddyMoving.contextUpdatedAt",
};
const TESTS_STORAGE_KEY = "buddy_tests_runs";
const TESTS_DATA_URL = new URL("tests/eval_cases_v2.json", document.baseURI);
const TEST_CASE_DELAY_MS = 300;
const DEBUG_STREAM =
  String(globalThis?.VITE_DEBUG_STREAM ?? "").toLowerCase() === "true";

const elements = {
  task: document.getElementById("task"),
  context: document.getElementById("context"),
  contextIndicator: document.getElementById("context-indicator"),
  contextPanel: document.getElementById("context-panel"),
  analyze: document.getElementById("analyze"),
  status: document.getElementById("status"),
  statusText: document.getElementById("status-text"),
  toast: document.getElementById("toast"),
  resultsList: document.getElementById("results-list"),
  analysisPage: document.getElementById("analysis-page"),
  testsPage: document.getElementById("tests-page"),
  navButtons: document.querySelectorAll("[data-route]"),
  testsRun: document.getElementById("tests-run"),
  testsCancel: document.getElementById("tests-cancel"),
  testsStatus: document.getElementById("tests-status"),
  testsHistory: document.getElementById("tests-history"),
};

let analysisState = {};
let activeStreamController = null;
let activeStreamId = 0;
let progressState = { completed: 0, total: 0 };

const testsState = {
  data: null,
  runs: [],
  currentRun: null,
  running: false,
  cancelRequested: false,
  activeController: null,
};

const showToast = (message, type = "success") => {
  elements.toast.textContent = message;
  elements.toast.classList.remove("error");
  if (type === "error") {
    elements.toast.classList.add("error");
  }
  elements.toast.classList.add("show");
  setTimeout(() => elements.toast.classList.remove("show"), 2500);
};

const setStatus = (active, message = "Analyzing…") => {
  elements.status.classList.toggle("active", active);
  elements.analyze.disabled = active;
  if (elements.statusText) {
    elements.statusText.textContent = message;
  }
};

const setCopyButtonState = (button, isCopied) => {
  if (!button) return;
  const label = isCopied ? "Copied" : button.dataset.label || "Copy";
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
  button.classList.toggle("copied", isCopied);
};

const getKeyTitle = (key) => KEY_TITLES[key] || key;
const isSupportedKey = (key) => KEY_SET.has(key);

const ensureKeyState = (key) => {
  if (!analysisState[key]) {
    analysisState[key] = {
      summary: "",
      value: "",
      isExpanded: false,
      status: "idle",
      error: null,
    };
  }
};

const getSummaryValue = (key) =>
  analysisState[key]?.summary || analysisState[key]?.value || "";
const getFullValue = (key) =>
  analysisState[key]?.value || analysisState[key]?.summary || "";
const isExpanded = (key) => analysisState[key]?.isExpanded === true;

const getDisplayedValue = (key) =>
  isExpanded(key) ? getFullValue(key) : getSummaryValue(key);

const getFullAnalysisMap = () =>
  Object.entries(analysisState).reduce((acc, [key, value]) => {
    acc[key] = value.value || value.summary || "";
    return acc;
  }, {});

const shouldShowToggle = (key) => {
  const summary = (analysisState[key]?.summary || "").trim();
  const value = (analysisState[key]?.value || "").trim();
  if (!summary || !value) return false;
  return summary !== value;
};

const setToggleButtonState = (card, key) => {
  if (!card) return;
  const button = card.querySelector('[data-action="toggle"]');
  if (!button) return;
  const expanded = isExpanded(key);
  const showToggle = shouldShowToggle(key);
  button.hidden = !showToggle;
  if (!showToggle) return;
  button.textContent = expanded ? "Collapse" : "Expand";
  button.setAttribute("aria-expanded", expanded ? "true" : "false");
};

const createResultCard = (key) => {
  const card = document.createElement("div");
  card.className = "card result-card";
  card.dataset.key = key;
  card.innerHTML = `
    <div class="card-head">
      <h3>${getKeyTitle(key)}</h3>
      <div class="card-actions">
        <button class="card-btn" data-action="toggle" aria-expanded="false" hidden>Expand</button>
        <button class="card-btn" data-action="deeper">Deeper</button>
        <button class="card-btn icon-only" data-action="verify" aria-label="Verify realism" title="Verify realism">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M9 16.2l-3.5-3.5L4 14.2 9 19l11-11-1.5-1.5z" />
          </svg>
        </button>
        <button class="card-btn icon-only" data-action="copy" aria-label="Copy" title="Copy" data-label="Copy">
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M16 1H6c-1.1 0-2 .9-2 2v12h2V3h10V1zm3 4H10c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h9c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H10V7h9v14z" />
          </svg>
        </button>
      </div>
    </div>
    <div class="card-body">
      <div class="card-content">No details yet.</div>
      <div class="card-skeleton" aria-hidden="true">
        <span class="skeleton-line line-xl"></span>
        <span class="skeleton-line line-lg"></span>
        <span class="skeleton-line line-md"></span>
        <span class="skeleton-line line-lg"></span>
        <span class="skeleton-line line-sm"></span>
      </div>
    </div>
    <div class="card-status" aria-live="polite"></div>
  `;
  return card;
};

const ensureCard = (key, { moveToEnd = false } = {}) => {
  if (!elements.resultsList) return null;
  let card = elements.resultsList.querySelector(`[data-key="${key}"]`);
  if (!card) {
    card = createResultCard(key);
    elements.resultsList.appendChild(card);
    return card;
  }
  if (moveToEnd) {
    elements.resultsList.appendChild(card);
  }
  return card;
};

const renderPlainText = (text, container) => {
  if (!container) return;
  container.textContent = text || "";
};

const setCardLoading = (
  key,
  isLoading,
  { placeholder = "Loading…", showSkeleton = false, statusText } = {},
) => {
  if (!isSupportedKey(key)) return;
  ensureKeyState(key);
  if (isLoading) {
    analysisState[key].status = "loading";
    analysisState[key].error = null;
  } else if (analysisState[key].status === "loading") {
    analysisState[key].status = "done";
  }
  const card = ensureCard(key);
  if (!card) return;
  card.classList.remove("error");
  card.classList.toggle("loading", isLoading);
  card.classList.toggle("skeleton", isLoading && showSkeleton);
  const body = card.querySelector(".card-content");
  const status = card.querySelector(".card-status");
  if (body && isLoading) {
    renderPlainText(placeholder, body);
  }
  if (status) {
    status.textContent = isLoading ? statusText || placeholder : "";
  }
};

const updateCardContent = (key) => {
  if (!isSupportedKey(key)) return;
  ensureKeyState(key);
  const card = ensureCard(key);
  if (!card) return;
  const body = card.querySelector(".card-content");
  if (body) {
    const summary = analysisState[key]?.summary ?? "";
    const value = analysisState[key]?.value ?? "";
    const showSummary = !isExpanded(key) && summary.trim().length > 0;
    const displayed = showSummary ? summary : value || summary;
    const isLoading = analysisState[key]?.status === "loading";
    const contentText =
      displayed || (isLoading ? "Analyzing..." : "No details yet.");
    renderPlainText(contentText, body);
    body.classList.toggle("is-summary", showSummary);
  }
  setToggleButtonState(card, key);
};

const updateAnalysisKey = (key, summaryValue, valueValue) => {
  if (!isSupportedKey(key)) return;
  ensureKeyState(key);
  const resolvedSummary = summaryValue ?? "";
  const resolvedValue = valueValue ?? summaryValue ?? "";
  analysisState[key].summary = resolvedSummary;
  analysisState[key].value = resolvedValue;
  analysisState[key].status = "done";
  analysisState[key].error = null;
  const card = ensureCard(key);
  if (!card) return;
  card.classList.remove("loading", "skeleton", "error");
  const status = card.querySelector(".card-status");
  if (status) {
    status.textContent = "";
  }
  updateCardContent(key);
};

const setCardError = (key, message, details) => {
  if (!isSupportedKey(key)) return;
  ensureKeyState(key);
  analysisState[key].status = "error";
  analysisState[key].error = { message, details };
  const card = ensureCard(key);
  if (!card) return;
  const body = card.querySelector(".card-content");
  if (body) {
    body.innerHTML = "";
    const headline = document.createElement("div");
    headline.className = "card-error-message";
    headline.textContent = message || "Failed to generate.";
    body.appendChild(headline);

    if (details) {
      const detailsWrapper = document.createElement("details");
      detailsWrapper.className = "card-error-details";
      const summary = document.createElement("summary");
      summary.textContent = "Details";
      const detailBody = document.createElement("pre");
      detailBody.textContent = details;
      detailsWrapper.append(summary, detailBody);
      body.appendChild(detailsWrapper);
    }
  }
  card.classList.remove("loading", "skeleton");
  card.classList.add("error");
  const status = card.querySelector(".card-status");
  if (status) {
    status.textContent = "";
  }
};

const resetCardsForLoading = () => {
  if (elements.resultsList) {
    elements.resultsList.innerHTML = "";
  }
  analysisState = {};
  progressState = { completed: 0, total: 0 };
};

const updateProgress = (completed, total) => {
  if (!elements.statusText) return;
  if (typeof completed === "number" && typeof total === "number" && total > 0) {
    elements.statusText.textContent = `Analyzing ${completed}/${total}`;
  } else {
    elements.statusText.textContent = "Analyzing…";
  }
};

const applyAnalysisResponse = (data) => {
  const analysis =
    data?.analysis && typeof data.analysis === "object" ? data.analysis : {};

  if (elements.resultsList) {
    elements.resultsList.innerHTML = "";
  }

  analysisState = {};

  DEFAULT_KEYS.forEach((key) => {
    ensureKeyState(key);
    const entry = analysis[key];
    if (typeof entry === "string") {
      analysisState[key].summary = "";
      analysisState[key].value = entry;
    } else if (entry && typeof entry === "object") {
      analysisState[key].summary = entry.summary ?? "";
      analysisState[key].value = entry.value ?? entry.summary ?? "";
    } else {
      analysisState[key].summary = "";
      analysisState[key].value = "";
    }
    analysisState[key].status = "done";
    analysisState[key].error = null;
    ensureCard(key);
    updateCardContent(key);
  });
};

const parseSseEvent = (rawEvent) => {
  const lines = rawEvent.split("\n");
  let event = "message";
  const dataLines = [];

  for (const line of lines) {
    if (!line || line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      event = line.replace("event:", "").trim();
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.replace("data:", "").trimStart());
    }
  }

  return { event, data: dataLines.join("\n") };
};

const streamAnalysis = async ({
  task,
  context,
  signal,
  keys,
  onKey,
  onError,
  onStatus,
  onDone,
  quiet = false,
}) => {
  const response = await fetch(`${API_BASE}/analyze/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ task, context, keys }),
    signal,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  if (!response.body) {
    throw new Error("Streaming is not supported in this browser.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawDone = false;

  const handleSsePayload = (event, data) => {
    if (!event) return;

    if (event === "key") {
      if (!data) return;
      try {
        const payload = JSON.parse(data);
        if (DEBUG_STREAM) {
          console.info("[stream] key", payload);
        }
        if (payload?.key) {
          if (onKey) {
            onKey(payload);
          } else {
            const summaryValue = payload.summary ?? "";
            const valueValue = payload.value ?? payload.summary ?? "";
            updateAnalysisKey(payload.key, summaryValue, valueValue);
          }
        }
      } catch (error) {
        console.warn("Failed to parse key event", error);
      }
    }

    if (event === "status") {
      if (!data) return;
      try {
        const payload = JSON.parse(data);
        if (DEBUG_STREAM) {
          console.info("[stream] status", payload);
        }
        if (onStatus) {
          onStatus(payload);
        }
      } catch (error) {
        console.warn("Failed to parse status event", error);
      }
    }

    if (event === "error") {
      if (!data) return;
      try {
        const payload = JSON.parse(data);
        if (DEBUG_STREAM) {
          console.info("[stream] error", payload);
        }
        if (onError) {
          onError(payload);
        } else if (payload?.key) {
          setCardError(payload.key, payload.error, payload.details);
        }
        if (!quiet) {
          showToast(payload?.error || "Analysis failed.", "error");
        }
      } catch (error) {
        if (!quiet) {
          showToast("Analysis failed.", "error");
        }
      }
    }

    if (event === "done") {
      if (DEBUG_STREAM) {
        console.info("[stream] done");
      }
      sawDone = true;
      if (onDone) {
        onDone();
      }
    }
  };

  let streamError = null;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      events.forEach((rawEvent) => {
        const { event, data } = parseSseEvent(rawEvent);
        handleSsePayload(event, data);
      });
    }

    if (buffer.trim()) {
      const { event, data } = parseSseEvent(buffer);
      handleSsePayload(event, data);
    }
  } catch (error) {
    streamError = error;
  } finally {
    if (signal?.aborted) {
      return;
    }
    if (!sawDone && !quiet) {
      showToast("Stream ended early. Analysis marked complete.", "error");
    }
  }

  if (streamError) {
    throw streamError;
  }
};

const fetchAnalysis = async ({ task, context, keys, signal }) => {
  const response = await fetch(`${API_BASE}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ task, context, keys }),
    signal,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return response.json();
};

const analyzeTask = async () => {
  const task = elements.task.value.trim();
  const context = elements.context.value.trim();

  if (!task) {
    showToast("Please enter a task to analyze.", "error");
    return;
  }

  if (activeStreamController) {
    activeStreamController.abort();
  }

  const controller = new AbortController();
  const requestId = ++activeStreamId;
  activeStreamController = controller;

  setStatus(true);
  resetCardsForLoading();
  DEFAULT_KEYS.forEach((key) => {
    setCardLoading(key, true, {
      placeholder: "Analyzing...",
      statusText: "Analyzing…",
    });
  });

  try {
    await streamAnalysis({
      task,
      context,
      signal: controller.signal,
      keys: DEFAULT_KEYS,
      onStatus: (payload) => {
        if (payload.status === "key-start" && payload.key) {
          setCardLoading(payload.key, true, {
            placeholder: "Analyzing...",
            statusText: "Analyzing…",
          });
          return;
        }

        if (payload.status === "started") {
          const total =
            typeof payload.total === "number"
              ? payload.total
              : DEFAULT_KEYS.length;
          progressState = {
            completed:
              typeof payload.completed === "number" ? payload.completed : 0,
            total,
          };
          updateProgress(progressState.completed, progressState.total);
          return;
        }

        if (payload.status === "progress") {
          progressState = {
            completed:
              typeof payload.completed === "number"
                ? payload.completed
                : progressState.completed,
            total:
              typeof payload.total === "number"
                ? payload.total
                : progressState.total || DEFAULT_KEYS.length,
          };
          updateProgress(progressState.completed, progressState.total);
        }
      },
      onKey: (payload) => {
        const summaryValue = payload.summary ?? "";
        const valueValue = payload.value ?? payload.summary ?? "";
        updateAnalysisKey(payload.key, summaryValue, valueValue);
      },
      onError: (payload) => {
        if (payload?.key) {
          setCardError(
            payload.key,
            payload.error || "Failed to generate.",
            payload.details,
          );
        }
      },
    });
    showToast("Analysis complete.");
  } catch (error) {
    if (controller.signal.aborted) {
      return;
    }
    if (error.message.includes("Streaming is not supported")) {
      try {
        const data = await fetchAnalysis({
          task,
          context,
          keys: DEFAULT_KEYS,
          signal: controller.signal,
        });
        applyAnalysisResponse(data);
        showToast("Analysis complete.");
        return;
      } catch (fallbackError) {
        showToast(`Analysis failed. ${fallbackError.message}`, "error");
        return;
      }
    }
    showToast(`Analysis failed. ${error.message}`, "error");
  } finally {
    if (activeStreamId === requestId) {
      activeStreamController = null;
      setStatus(false);
    }
  }
};

const handleCardAction = async (action, key, cardElement) => {
  const task = elements.task.value.trim();
  const context = elements.context.value.trim();

  if (!task) {
    showToast("Please enter a task first.", "error");
    return;
  }

  if (action === "copy") {
    const value =
      getDisplayedValue(key) ||
      cardElement.querySelector(".card-content")?.textContent ||
      "";
    try {
      await navigator.clipboard.writeText(value);
      const button = cardElement.querySelector(`[data-action="copy"]`);
      if (button) {
        setCopyButtonState(button, true);
        setTimeout(() => {
          setCopyButtonState(button, false);
        }, 1000);
      }
    } catch (error) {
      showToast("Copy failed. Please try again.", "error");
    }
    return;
  }

  if (action === "toggle") {
    ensureKeyState(key);
    analysisState[key].isExpanded = !analysisState[key].isExpanded;
    updateCardContent(key);
    return;
  }

  const endpoint =
    action === "deeper" ? "/analyze/deeper" : "/analyze/verify";

  setCardLoading(key, true, {
    placeholder: action === "deeper" ? "Deepening…" : "Rewriting…",
    statusText: action === "deeper" ? "Deepening…" : "Rewriting…",
  });

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        task,
        context,
        key,
        value: getFullValue(key),
        currentAnalysis: getFullAnalysisMap(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }

    const data = await response.json();
    if (!data || !data.value) {
      throw new Error("Unexpected response from API.");
    }

    updateAnalysisKey(key, data.summary ?? "", data.value ?? data.summary ?? "");
    showToast(action === "deeper" ? "Deeper analysis ready." : "Updated.");
  } catch (error) {
    setCardLoading(key, false);
    showToast(`Action failed. ${error.message}`, "error");
  }
};

const restoreInputs = () => {
  const savedTask = localStorage.getItem(STORAGE_KEYS.task);
  const savedContext = localStorage.getItem(STORAGE_KEYS.context);
  const savedContextUpdatedAt = localStorage.getItem(
    STORAGE_KEYS.contextUpdatedAt,
  );
  if (savedTask) {
    elements.task.value = savedTask;
  }
  if (savedContext) {
    elements.context.value = savedContext;
  }
  if (savedContext && !savedContextUpdatedAt) {
    persistInput(STORAGE_KEYS.contextUpdatedAt, Date.now().toString());
  }
};

const persistInput = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn("Failed to save input", error);
  }
};

const formatContextTimestamp = (timestamp) => {
  if (!timestamp) return "";
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.valueOf())) return "";
  const datePart = date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
  });
  const timePart = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart}, ${timePart}`;
};

const updateContextIndicator = () => {
  if (!elements.contextIndicator) return;
  const contextValue = elements.context.value.trim();
  if (!contextValue) {
    elements.contextIndicator.textContent = "+ Add context";
    return;
  }
  const updatedAt = localStorage.getItem(STORAGE_KEYS.contextUpdatedAt);
  const formatted = formatContextTimestamp(updatedAt);
  elements.contextIndicator.textContent = formatted
    ? `Context set - updated ${formatted}`
    : "Context set";
};

const getBasePath = () => new URL(document.baseURI).pathname.replace(/\/$/, "");

const normalizeRoute = (pathname) => {
  const basePath = getBasePath();
  const trimmed = pathname.startsWith(basePath)
    ? pathname.slice(basePath.length)
    : pathname;
  return trimmed === "" ? "/" : trimmed;
};

const setActiveRoute = (route) => {
  const normalized = route === "/tests" ? "/tests" : "/";
  const isTests = normalized === "/tests";
  if (elements.analysisPage) {
    elements.analysisPage.hidden = isTests;
  }
  if (elements.testsPage) {
    elements.testsPage.hidden = !isTests;
  }
  elements.navButtons?.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.route === normalized);
  });
};

const navigateTo = (route) => {
  const basePath = getBasePath();
  const target = route === "/" ? `${basePath || "/"}` : `${basePath}${route}`;
  window.history.pushState({}, "", target);
  setActiveRoute(route);
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const loadStoredRuns = () => {
  try {
    const raw = localStorage.getItem(TESTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (error) {
    console.warn("Failed to parse stored test runs", error);
    return [];
  }
};

const saveStoredRuns = (runs) => {
  try {
    localStorage.setItem(TESTS_STORAGE_KEY, JSON.stringify(runs));
  } catch (error) {
    console.warn("Failed to save test runs", error);
  }
};

const getTestsData = async () => {
  if (testsState.data) return testsState.data;
  const response = await fetch(TESTS_DATA_URL);
  if (!response.ok) {
    throw new Error(`Failed to load test cases (${response.status})`);
  }
  const data = await response.json();
  const contextsById = new Map(
    (data.contexts || []).map((context) => [context.contextId, context]),
  );
  const casesByContext = (data.cases || []).reduce((acc, testCase) => {
    if (!acc[testCase.contextId]) {
      acc[testCase.contextId] = [];
    }
    acc[testCase.contextId].push(testCase);
    return acc;
  }, {});
  testsState.data = { ...data, contextsById, casesByContext };
  return testsState.data;
};

const formatRunDate = (isoString) => {
  if (!isoString) return "Unknown date";
  const date = new Date(isoString);
  if (Number.isNaN(date.valueOf())) return "Unknown date";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

const formatDuration = (start, end) => {
  if (!start || !end) return "—";
  const durationMs = new Date(end).valueOf() - new Date(start).valueOf();
  if (!Number.isFinite(durationMs) || durationMs < 0) return "—";
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}m ${remainder}s`;
};

const formatStatusLabel = (status) => {
  if (status === "success") return "Success";
  if (status === "failed") return "Failed";
  if (status === "partial") return "Partial";
  if (status === "running") return "Running";
  return status || "Unknown";
};

const createBadge = (text, className) => {
  const badge = document.createElement("span");
  badge.className = `badge ${className || ""}`.trim();
  badge.textContent = text;
  return badge;
};

const createCaseTag = (text) => {
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.textContent = text;
  return tag;
};

const buildCaseDetails = (caseResult) => {
  const details = document.createElement("details");
  details.className = "case-row";
  const summary = document.createElement("summary");
  const summaryContent = document.createElement("div");
  summaryContent.className = "case-summary";

  const badges = document.createElement("div");
  badges.className = "case-badges";
  badges.appendChild(createBadge(caseResult.scale || "n/a", caseResult.scale));
  badges.appendChild(
    createBadge(caseResult.ok ? "OK" : "Fail", caseResult.ok ? "success" : "failed"),
  );

  const meta = document.createElement("div");
  meta.className = "case-summary-meta";
  const title = document.createElement("div");
  title.className = "case-title";
  title.textContent = caseResult.title || "Untitled case";
  const tags = document.createElement("div");
  tags.className = "case-tags";
  const tagList = Array.isArray(caseResult.tags) ? caseResult.tags : [];
  tagList.slice(0, 3).forEach((tag) => tags.appendChild(createCaseTag(tag)));
  if (tagList.length > 3) {
    tags.appendChild(createCaseTag(`+${tagList.length - 3}`));
  }
  meta.appendChild(title);
  meta.appendChild(tags);

  const metaRight = document.createElement("div");
  metaRight.className = "case-meta-right";
  const duration = document.createElement("span");
  duration.textContent = `Duration: ${formatDuration(
    caseResult.startedAt,
    caseResult.finishedAt,
  )}`;
  metaRight.appendChild(duration);

  summaryContent.appendChild(badges);
  summaryContent.appendChild(meta);
  summaryContent.appendChild(metaRight);
  summary.appendChild(summaryContent);
  details.appendChild(summary);

  const detailsBody = document.createElement("div");
  detailsBody.className = "case-details";

  if (caseResult.error) {
    const errorBlock = document.createElement("div");
    errorBlock.className = "case-key-summary";
    errorBlock.textContent = `Error: ${caseResult.error}`;
    detailsBody.appendChild(errorBlock);
  }

  const analysisEntries = caseResult.analysis
    ? DEFAULT_KEYS.filter((key) => caseResult.analysis[key]).map((key) => [
        key,
        caseResult.analysis[key],
      ])
    : [];
  if (analysisEntries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "case-key-summary";
    empty.textContent = "No analysis generated for this case.";
    detailsBody.appendChild(empty);
  } else {
    analysisEntries.forEach(([key, value]) => {
      const keyBlock = document.createElement("div");
      keyBlock.className = "case-key";

      const header = document.createElement("div");
      header.className = "case-key-header";
      const name = document.createElement("span");
      name.className = "case-key-name";
      name.textContent = key;
      header.appendChild(name);

      const toggle = document.createElement("button");
      toggle.className = "case-key-toggle";
      toggle.type = "button";
      toggle.textContent = "Show full";

      const summary = document.createElement("div");
      summary.className = "case-key-summary";
      summary.textContent = (value?.summary || value?.value || "").trim();

      const full = document.createElement("pre");
      full.className = "case-key-full";
      full.textContent = (value?.value || value?.summary || "").trim();
      full.hidden = true;

      const hasToggle =
        summary.textContent &&
        full.textContent &&
        summary.textContent !== full.textContent;
      if (hasToggle) {
        header.appendChild(toggle);
        toggle.addEventListener("click", () => {
          const isHidden = full.hidden;
          full.hidden = !isHidden;
          toggle.textContent = isHidden ? "Hide full" : "Show full";
        });
      } else {
        toggle.hidden = true;
      }

      keyBlock.appendChild(header);
      keyBlock.appendChild(summary);
      if (full.textContent) {
        keyBlock.appendChild(full);
      }
      detailsBody.appendChild(keyBlock);
    });
  }

  details.appendChild(detailsBody);
  return details;
};

const buildRunCard = (run, { expanded = false } = {}) => {
  const details = document.createElement("details");
  details.className = "run-card";
  details.open = expanded;

  const summary = document.createElement("summary");
  const summaryContent = document.createElement("div");
  summaryContent.className = "run-summary";

  const meta = document.createElement("div");
  meta.className = "run-meta";
  const date = document.createElement("span");
  date.textContent = formatRunDate(run.createdAt);
  const statusLabel = run.status || "running";
  const badgeClass = statusLabel === "running" ? "partial" : statusLabel;
  const statusBadge = createBadge(formatStatusLabel(statusLabel), badgeClass);
  meta.appendChild(date);
  meta.appendChild(statusBadge);

  const counts = document.createElement("span");
  const succeeded = run.summary?.succeeded ?? 0;
  const failed = run.summary?.failed ?? 0;
  counts.textContent = `Passed ${succeeded} · Failed ${failed}`;

  summaryContent.appendChild(meta);
  summaryContent.appendChild(counts);
  summary.appendChild(summaryContent);
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "run-details";

  const data = testsState.data;
  const contexts = data?.contexts || [];
  const resultsByContext = (run.results || []).reduce((acc, result) => {
    if (!acc[result.contextId]) {
      acc[result.contextId] = [];
    }
    acc[result.contextId].push(result);
    return acc;
  }, {});

  const contextsToRender =
    contexts.length > 0
      ? contexts
      : Object.keys(resultsByContext).map((contextId) => ({
          contextId,
          title: contextId,
        }));

  contextsToRender.forEach((context) => {
    const cases = resultsByContext[context.contextId];
    if (!cases || cases.length === 0) return;
    const block = document.createElement("div");
    block.className = "context-block";
    const title = document.createElement("div");
    title.className = "context-title";
    title.textContent = context.title || context.contextId;
    block.appendChild(title);
    cases.forEach((caseResult) => {
      block.appendChild(buildCaseDetails(caseResult));
    });
    body.appendChild(block);
  });

  if (!body.childElementCount) {
    const empty = document.createElement("div");
    empty.className = "case-key-summary";
    empty.textContent = "No results captured for this run yet.";
    body.appendChild(empty);
  }

  details.appendChild(body);
  return details;
};

const renderTestsHistory = () => {
  if (!elements.testsHistory) return;
  elements.testsHistory.innerHTML = "";
  const runs = testsState.currentRun
    ? [testsState.currentRun, ...testsState.runs]
    : testsState.runs;
  if (!runs.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No test runs yet. Start a run to see results here.";
    elements.testsHistory.appendChild(empty);
    return;
  }
  const expandedId = runs[0]?.id;
  runs.forEach((run) => {
    elements.testsHistory.appendChild(
      buildRunCard(run, { expanded: run.id === expandedId }),
    );
  });
};

const setTestsStatus = (text) => {
  if (!elements.testsStatus) return;
  elements.testsStatus.textContent = text || "";
};

const setTestsRunning = (isRunning) => {
  testsState.running = isRunning;
  if (elements.testsRun) {
    elements.testsRun.disabled = isRunning;
  }
  if (elements.testsCancel) {
    elements.testsCancel.hidden = !isRunning;
  }
};

const runSingleTestCase = async (testCase, contextText) => {
  const startedAt = new Date().toISOString();
  const analysis = {};
  const keyStatuses = {};
  let sawDone = false;
  let language = null;
  let errorMessage = null;
  const controller = new AbortController();
  testsState.activeController = controller;

  try {
    await streamAnalysis({
      task: testCase.task,
      context: contextText,
      keys: DEFAULT_KEYS,
      signal: controller.signal,
      quiet: true,
      onStatus: (payload) => {
        if (payload?.language) {
          language = payload.language;
        }
      },
      onKey: (payload) => {
        if (!payload?.key) return;
        analysis[payload.key] = {
          summary: payload.summary ?? "",
          value: payload.value ?? payload.summary ?? "",
        };
        if (payload.status) {
          keyStatuses[payload.key] = payload.status;
        }
      },
      onError: (payload) => {
        errorMessage =
          payload?.error ||
          payload?.details ||
          errorMessage ||
          "Unknown error";
        if (payload?.key && payload.status) {
          keyStatuses[payload.key] = payload.status;
        }
      },
      onDone: () => {
        sawDone = true;
      },
    });
  } catch (error) {
    if (controller.signal.aborted) {
      errorMessage = "Cancelled";
    } else {
      errorMessage = error.message || "Request failed";
    }
  } finally {
    testsState.activeController = null;
  }

  const finishedAt = new Date().toISOString();
  const succeededKeys = Object.values(keyStatuses).filter(
    (status) => status === "ok",
  ).length;
  const ok = sawDone && succeededKeys >= 3 && !errorMessage;

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
    error: errorMessage || undefined,
    analysis: Object.keys(analysis).length ? analysis : undefined,
  };
};

const startTestsRun = async () => {
  if (testsState.running) return;
  testsState.cancelRequested = false;
  setTestsRunning(true);
  setTestsStatus("Loading test cases...");

  let data;
  try {
    data = await getTestsData();
  } catch (error) {
    showToast(`Failed to load tests. ${error.message}`, "error");
    setTestsRunning(false);
    setTestsStatus("");
    return;
  }

  const run = {
    id: `run_${Date.now()}`,
    createdAt: new Date().toISOString(),
    status: "running",
    summary: {
      totalCases: data.cases.length,
      succeeded: 0,
      failed: 0,
    },
    results: [],
  };

  testsState.currentRun = run;
  renderTestsHistory();

  for (let index = 0; index < data.cases.length; index += 1) {
    if (testsState.cancelRequested) break;
    const testCase = data.cases[index];
    const context = data.contextsById.get(testCase.contextId);
    const contextText = context?.context || "";
    setTestsStatus(`Running... ${index + 1}/${data.cases.length}`);

    const result = await runSingleTestCase(testCase, contextText);
    run.results.push(result);
    if (result.ok) {
      run.summary.succeeded += 1;
    } else {
      run.summary.failed += 1;
    }
    renderTestsHistory();

    if (index < data.cases.length - 1 && !testsState.cancelRequested) {
      await delay(TEST_CASE_DELAY_MS);
    }
  }

  run.status =
    run.summary.failed === 0
      ? "success"
      : run.summary.succeeded === 0
        ? "failed"
        : "partial";

  testsState.currentRun = null;
  testsState.runs = [run, ...testsState.runs].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  );
  saveStoredRuns(testsState.runs);
  renderTestsHistory();
  setTestsRunning(false);
  setTestsStatus("");
};

const cancelTestsRun = () => {
  if (!testsState.running) return;
  testsState.cancelRequested = true;
  if (testsState.activeController) {
    testsState.activeController.abort();
  }
  setTestsStatus("Cancelling...");
};

const initTests = async () => {
  testsState.runs = loadStoredRuns().sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  );
  renderTestsHistory();

  try {
    await getTestsData();
    renderTestsHistory();
  } catch (error) {
    console.warn("Failed to load tests data", error);
  }

  elements.testsRun?.addEventListener("click", startTestsRun);
  elements.testsCancel?.addEventListener("click", cancelTestsRun);
};

const isAnalyzeShortcutTarget = (target) =>
  target === elements.task || target === elements.context;

const init = () => {
  elements.navButtons?.forEach((button) => {
    button.addEventListener("click", () => {
      const route = button.dataset.route || "/";
      navigateTo(route);
    });
  });

  window.addEventListener("popstate", () => {
    setActiveRoute(normalizeRoute(window.location.pathname));
  });

  elements.analyze.addEventListener("click", analyzeTask);

  document.addEventListener("keydown", (event) => {
    if (!isAnalyzeShortcutTarget(event.target)) return;
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      analyzeTask();
    }
  });

  elements.resultsList?.addEventListener("click", (event) => {
    const button = event.target.closest(".card-btn");
    if (!button) return;
    const action = button.dataset.action;
    if (!action) return;
    const card = button.closest(".card");
    const key = card?.dataset.key;
    if (!key) return;
    handleCardAction(action, key, card);
  });

  elements.task.addEventListener("input", (event) => {
    persistInput(STORAGE_KEYS.task, event.target.value);
  });
  elements.context.addEventListener("input", (event) => {
    persistInput(STORAGE_KEYS.context, event.target.value);
    persistInput(STORAGE_KEYS.contextUpdatedAt, Date.now().toString());
    updateContextIndicator();
  });

  elements.contextIndicator?.addEventListener("click", () => {
    elements.contextPanel?.classList.toggle("open");
  });

  restoreInputs();
  updateContextIndicator();
  setActiveRoute(normalizeRoute(window.location.pathname));
  initTests();
};

init();
