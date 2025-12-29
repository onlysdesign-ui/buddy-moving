const API_BASE = "https://buddy-moving.onrender.com";
const DEFAULT_KEYS = [
  "framing",
  "audience_focus",
  "hypotheses",
  "scenarios",
  "success_criteria",
  "options",
  "recommendation",
];
const KEY_LABELS = {
  framing: "Task framing",
  audience_focus: "Audience focus",
  hypotheses: "Hypotheses",
  scenarios: "Scenarios",
  success_criteria: "Success criteria",
  options: "Solution options",
  recommendation: "Recommendation",
};
const STORAGE_KEYS = {
  task: "buddyMoving.task",
  context: "buddyMoving.context",
  contextUpdatedAt: "buddyMoving.contextUpdatedAt",
};

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
};

let currentAnalysis = DEFAULT_KEYS.reduce((acc, key) => {
  acc[key] = "";
  return acc;
}, {});
let activeStreamController = null;
let activeStreamId = 0;
let progressState = { completed: 0, total: 0 };

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

const getKeyLabel = (key) => KEY_LABELS[key] || key;

const createResultCard = (key) => {
  const card = document.createElement("div");
  card.className = "card result-card";
  card.dataset.key = key;
  card.innerHTML = `
    <div class="card-head">
      <h3>${getKeyLabel(key)}</h3>
      <div class="card-actions">
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
      <p class="card-content">No details yet.</p>
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

const setCardLoading = (
  key,
  isLoading,
  { placeholder = "Loading…", showSkeleton = false, statusText } = {},
) => {
  const card = ensureCard(key);
  if (!card) return;
  card.classList.remove("error");
  card.classList.toggle("loading", isLoading);
  card.classList.toggle("skeleton", isLoading && showSkeleton);
  const body = card.querySelector(".card-content");
  const status = card.querySelector(".card-status");
  if (body) {
    if (!showSkeleton || !isLoading) {
      body.textContent = isLoading ? placeholder : body.textContent;
    }
  }
  if (status) {
    status.textContent = isLoading ? statusText || placeholder : "";
  }
};

const updateCard = (key, value) => {
  if (!Object.hasOwn(currentAnalysis, key)) {
    currentAnalysis[key] = "";
  }
  currentAnalysis[key] = value || "";
  const card = ensureCard(key);
  if (!card) return;
  const body = card.querySelector(".card-content");
  if (body) {
    body.textContent = value || "No details yet.";
  }
  card.classList.remove("loading", "skeleton", "error");
  const status = card.querySelector(".card-status");
  if (status) {
    status.textContent = "";
  }
};

const setCardError = (key, message, details) => {
  const card = ensureCard(key);
  if (!card) return;
  const body = card.querySelector(".card-content");
  const detailText = details ? `\n${details}` : "";
  if (body) {
    body.textContent = `Error: ${message || "Failed"}${detailText}`;
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
  DEFAULT_KEYS.forEach((key) => {
    currentAnalysis[key] = "";
  });
  progressState = { completed: 0, total: 0 };
};

const updateProgress = (completed, total) => {
  if (!elements.statusText) return;
  if (typeof completed === "number" && typeof total === "number") {
    if (total > 0) {
      elements.statusText.textContent = `Analyzing… ${completed}/${total}`;
    } else {
      elements.statusText.textContent = "Analyzing…";
    }
  }
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
        if (payload?.key) {
          if (onKey) {
            onKey(payload);
          } else {
            updateCard(payload.key, payload.value);
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
        if (payload?.key) {
          setCardError(payload.key, payload.error, payload.details);
          if (onError) {
            onError(payload);
          }
        }
        showToast(payload?.error || "Analysis failed.", "error");
      } catch (error) {
        showToast("Analysis failed.", "error");
      }
    }

    if (event === "done") {
      sawDone = true;
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
    if (!sawDone) {
      showToast("Stream ended early. Analysis marked complete.", "error");
    }
  }

  if (streamError) {
    throw streamError;
  }
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
  let sawKeyStart = false;
  let fallbackSkeletonsCreated = false;

  try {
    await streamAnalysis({
      task,
      context,
      signal: controller.signal,
      keys: DEFAULT_KEYS,
      onStatus: (payload) => {
        if (payload.status === "key-start" && payload.key) {
          sawKeyStart = true;
          setCardLoading(payload.key, true, {
            showSkeleton: true,
            statusText: "Analyzing...",
          });
          return;
        }

        if (payload.status === "started") {
          if (typeof payload.total === "number") {
            progressState = {
              completed: typeof payload.completed === "number" ? payload.completed : 0,
              total: payload.total,
            };
            updateProgress(progressState.completed, progressState.total);
          }
          if (!sawKeyStart && !fallbackSkeletonsCreated) {
            DEFAULT_KEYS.forEach((key) => {
              setCardLoading(key, true, {
                showSkeleton: true,
                statusText: "Analyzing...",
              });
            });
            fallbackSkeletonsCreated = true;
          }
          return;
        }

        if (payload.status === "progress") {
          if (
            typeof payload.completed === "number" &&
            typeof payload.total === "number"
          ) {
            progressState = {
              completed: payload.completed,
              total: payload.total,
            };
            updateProgress(progressState.completed, progressState.total);
          }
        }
      },
      onKey: (payload) => {
        updateCard(payload.key, payload.value);
      },
    });
    showToast("Analysis complete.");
  } catch (error) {
    if (controller.signal.aborted) {
      return;
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
      currentAnalysis[key] ||
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
        value: currentAnalysis[key],
        currentAnalysis,
      }),
    });

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }

    const data = await response.json();
    if (!data || !data.value) {
      throw new Error("Unexpected response from API.");
    }

    updateCard(key, data.value);
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

const isTextInputTarget = (target) => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.tagName === "TEXTAREA") return true;
  if (target.tagName === "INPUT") {
    const type = target.type?.toLowerCase() || "text";
    return ["text", "search", "email", "url", "tel", "password"].includes(type);
  }
  return false;
};

const init = () => {
  elements.analyze.addEventListener("click", analyzeTask);

  document.addEventListener("keydown", (event) => {
    if (!isTextInputTarget(event.target)) return;
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
};

init();
