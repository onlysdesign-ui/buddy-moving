const API_BASE = "https://buddy-moving.onrender.com";

const elements = {
  task: document.getElementById("task"),
  context: document.getElementById("context"),
  analyze: document.getElementById("analyze"),
  status: document.getElementById("status"),
  toast: document.getElementById("toast"),
  cards: {
    audience: document.getElementById("audience"),
    metrics: document.getElementById("metrics"),
    risks: document.getElementById("risks"),
    questions: document.getElementById("questions"),
    scenarios: document.getElementById("scenarios"),
    approaches: document.getElementById("approaches"),
  },
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

const setStatus = (active) => {
  elements.status.classList.toggle("active", active);
  elements.analyze.disabled = active;
};

const updateCards = (analysis) => {
  elements.cards.audience.textContent = analysis.audience || "No details yet.";
  elements.cards.metrics.textContent = analysis.metrics || "No details yet.";
  elements.cards.risks.textContent = analysis.risks || "No details yet.";
  elements.cards.questions.textContent = analysis.questions || "No details yet.";
  elements.cards.scenarios.textContent = analysis.scenarios || "No details yet.";
  elements.cards.approaches.textContent = analysis.approaches || "No details yet.";
};

const analyzeTask = async () => {
  const task = elements.task.value.trim();
  const context = elements.context.value.trim();

  if (!task) {
    showToast("Please enter a task to analyze.", "error");
    return;
  }

  setStatus(true);

  try {
    const response = await fetch(`${API_BASE}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ task, context }),
    });

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`);
    }

    const data = await response.json();
    if (!data || !data.analysis) {
      throw new Error("Unexpected response from API.");
    }

    updateCards(data.analysis);
    showToast("Analysis complete.");
  } catch (error) {
    showToast(`Analysis failed. ${error.message}`, "error");
  } finally {
    setStatus(false);
  }
};

const init = () => {
  elements.analyze.addEventListener("click", analyzeTask);
};

init();
