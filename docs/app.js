const API_BASE = "https://buddy-moving.onrender.com";
const ANALYSIS_KEYS = [
  "audience",
  "metrics",
  "risks",
  "questions",
  "scenarios",
  "approaches",
];
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
  tabs: document.getElementById("result-tabs"),
  resultCard: document.getElementById("result-card"),
  resultTitle: document.getElementById("result-title"),
  resultBody: document.getElementById("result-body"),
};

let currentAnalysis = ANALYSIS_KEYS.reduce((acc, key) => {
  acc[key] = "";
  return acc;
}, {});
let selectedKey = "audience";
let activeStreamController = null;
let activeStreamId = 0;

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

const setCardLoading = (key, isLoading, placeholder = "Loading…") => {
  if (!elements.resultCard) return;
  if (key !== selectedKey) return;
  elements.resultCard.classList.toggle("loading", isLoading);
  if (isLoading && elements.resultBody) {
    elements.resultBody.textContent = placeholder;
  }
};

const setCopyButtonState = (button, isCopied) => {
  if (!button) return;
  const label = isCopied ? "Copied" : button.dataset.label || "Copy";
  button.setAttribute("aria-label", label);
  button.setAttribute("title", label);
  button.classList.toggle("copied", isCopied);
};

const updateCard = (key, value) => {
  currentAnalysis[key] = value || "";
  if (key !== selectedKey) return;
  if (elements.resultBody) {
    elements.resultBody.textContent = value || "No details yet.";
  }
  elements.resultCard?.classList.remove("loading");
};

const resetCardsForLoading = () => {
  ANALYSIS_KEYS.forEach((key) => {
    currentAnalysis[key] = "";
  });
  setCardLoading(selectedKey, true);
};

const updateProgress = (completed, total) => {
  if (!elements.statusText) return;
  if (typeof completed === "number" && typeof total === "number") {
    elements.statusText.textContent = `Analyzing… ${completed}/${total}`;
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

const streamAnalysis = async ({ task, context, signal }) => {
  const response = await fetch(`${API_BASE}/analyze/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ task, context }),
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
  let total = ANALYSIS_KEYS.length;
  let completed = 0;
  let hasProgressEvents = false;

  const finishPendingCards = (message) => {
    ANALYSIS_KEYS.forEach((key) => {
      if (key === selectedKey) {
        updateCard(key, message);
      }
    });
  };

  const handleSsePayload = (event, data) => {
    if (!event) return;

    if (event === "key") {
      if (!data) return;
      try {
        const payload = JSON.parse(data);
        updateCard(payload.key, payload.value);
        setSelectedKey(payload.key);
        if (!hasProgressEvents) {
          completed += 1;
          updateProgress(completed, total);
        }
      } catch (error) {
        console.warn("Failed to parse key event", error);
      }
    }

    if (event === "status") {
      if (!data) return;
      try {
        const payload = JSON.parse(data);
        if (payload.status === "started") {
          total = payload.total ?? total;
          completed = 0;
          updateProgress(completed, total);
          return;
        }
        if (payload.status === "progress") {
          hasProgressEvents = true;
          completed = payload.completed ?? completed;
          total = payload.total ?? total;
          updateProgress(completed, total);
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
          updateCard(payload.key, `Error: ${payload.error || "Failed"}`);
          setSelectedKey(payload.key);
        }
        showToast(payload?.error || "Analysis failed.", "error");
        if (!hasProgressEvents) {
          completed += 1;
          updateProgress(completed, total);
        }
      } catch (error) {
        showToast("Analysis failed.", "error");
      }
    }

    if (event === "done") {
      sawDone = true;
      updateProgress(total, total);
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
      finishPendingCards("Failed / no response.");
      updateProgress(total, total);
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
  setSelectedKey("audience");
  resetCardsForLoading();

  try {
    await streamAnalysis({ task, context, signal: controller.signal });
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
    const value = currentAnalysis[key] || elements.resultBody?.textContent || "";
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

  setCardLoading(key, true, action === "deeper" ? "Deepening…" : "Rewriting…");

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
    elements.contextIndicator.textContent = "Context: not set";
    return;
  }
  const updatedAt = localStorage.getItem(STORAGE_KEYS.contextUpdatedAt);
  const formatted = formatContextTimestamp(updatedAt);
  elements.contextIndicator.textContent = formatted
    ? `Context: set - updated ${formatted}`
    : "Context: set";
};

const setSelectedKey = (key) => {
  if (!ANALYSIS_KEYS.includes(key)) return;
  selectedKey = key;
  if (elements.resultCard) {
    elements.resultCard.dataset.key = key;
  }
  const tabLabel = elements.tabs?.querySelector(`[data-key="${key}"]`)?.textContent;
  const title = tabLabel || key.charAt(0).toUpperCase() + key.slice(1);
  if (elements.resultTitle) {
    elements.resultTitle.textContent = title;
  }
  if (elements.resultBody) {
    elements.resultBody.textContent = currentAnalysis[key] || "No details yet.";
  }
  if (elements.tabs) {
    elements.tabs.querySelectorAll(".tab").forEach((tab) => {
      tab.classList.toggle("active", tab.dataset.key === key);
    });
  }
};

const init = () => {
  elements.analyze.addEventListener("click", analyzeTask);

  elements.resultCard?.addEventListener("click", (event) => {
    const button = event.target.closest(".card-btn");
    if (!button) return;
    const action = button.dataset.action;
    if (!action) return;
    handleCardAction(action, selectedKey, elements.resultCard);
  });

  elements.tabs?.addEventListener("click", (event) => {
    const tab = event.target.closest(".tab");
    if (!tab) return;
    const key = tab.dataset.key;
    if (!key) return;
    setSelectedKey(key);
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
  setSelectedKey(selectedKey);
};

init();
