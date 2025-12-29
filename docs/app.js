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
};

const elements = {
  task: document.getElementById("task"),
  context: document.getElementById("context"),
  analyze: document.getElementById("analyze"),
  status: document.getElementById("status"),
  statusText: document.getElementById("status-text"),
  toast: document.getElementById("toast"),
  results: document.querySelector(".results"),
  cards: ANALYSIS_KEYS.reduce((acc, key) => {
    acc[key] = {
      container: document.querySelector(`.card[data-key="${key}"]`),
      value: document.getElementById(key),
    };
    return acc;
  }, {}),
};

let currentAnalysis = ANALYSIS_KEYS.reduce((acc, key) => {
  acc[key] = "";
  return acc;
}, {});

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
  const card = elements.cards[key];
  if (!card) return;
  card.container.classList.toggle("loading", isLoading);
  if (isLoading) {
    card.value.textContent = placeholder;
  }
};

const updateCard = (key, value) => {
  const card = elements.cards[key];
  if (!card) return;
  card.value.textContent = value || "No details yet.";
  card.container.classList.remove("loading");
  currentAnalysis[key] = value || "";
};

const resetCardsForLoading = () => {
  ANALYSIS_KEYS.forEach((key) => {
    setCardLoading(key, true);
    currentAnalysis[key] = "";
  });
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

const streamAnalysis = async ({ task, context }) => {
  const response = await fetch(`${API_BASE}/analyze/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ task, context }),
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

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    events.forEach((rawEvent) => {
      const { event, data } = parseSseEvent(rawEvent);
      if (!event || !data) return;

      if (event === "key") {
        try {
          const payload = JSON.parse(data);
          updateCard(payload.key, payload.value);
        } catch (error) {
          console.warn("Failed to parse key event", error);
        }
      }

      if (event === "status") {
        try {
          const payload = JSON.parse(data);
          updateProgress(payload.completed, payload.total);
        } catch (error) {
          console.warn("Failed to parse status event", error);
        }
      }

      if (event === "error") {
        try {
          const payload = JSON.parse(data);
          if (payload?.key) {
            updateCard(payload.key, `Error: ${payload.error || "Failed"}`);
          }
          showToast(payload?.error || "Analysis failed.", "error");
        } catch (error) {
          showToast("Analysis failed.", "error");
        }
      }
    });
  }

  if (buffer.trim()) {
    const { event, data } = parseSseEvent(buffer);
    if (event === "key") {
      try {
        const payload = JSON.parse(data);
        updateCard(payload.key, payload.value);
      } catch (error) {
        console.warn("Failed to parse trailing key event", error);
      }
    }
  }
};

const analyzeTask = async () => {
  const task = elements.task.value.trim();
  const context = elements.context.value.trim();

  if (!task) {
    showToast("Please enter a task to analyze.", "error");
    return;
  }

  setStatus(true);
  resetCardsForLoading();

  try {
    await streamAnalysis({ task, context });
    showToast("Analysis complete.");
  } catch (error) {
    showToast(`Analysis failed. ${error.message}`, "error");
  } finally {
    setStatus(false);
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
    const value = currentAnalysis[key] || elements.cards[key].value.textContent;
    try {
      await navigator.clipboard.writeText(value);
      const button = cardElement.querySelector(`[data-action="copy"]`);
      if (button) {
        const originalText = button.textContent;
        button.textContent = "Copied";
        button.classList.add("copied");
        setTimeout(() => {
          button.textContent = originalText;
          button.classList.remove("copied");
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
  if (savedTask) {
    elements.task.value = savedTask;
  }
  if (savedContext) {
    elements.context.value = savedContext;
  }
};

const persistInput = (key, value) => {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    console.warn("Failed to save input", error);
  }
};

const init = () => {
  elements.analyze.addEventListener("click", analyzeTask);

  elements.results.addEventListener("click", (event) => {
    const button = event.target.closest(".card-btn");
    if (!button) return;
    const card = button.closest(".card");
    if (!card) return;
    const key = card.dataset.key;
    const action = button.dataset.action;
    if (!key || !action) return;
    handleCardAction(action, key, card);
  });

  elements.task.addEventListener("input", (event) => {
    persistInput(STORAGE_KEYS.task, event.target.value);
  });
  elements.context.addEventListener("input", (event) => {
    persistInput(STORAGE_KEYS.context, event.target.value);
  });

  restoreInputs();
};

init();
