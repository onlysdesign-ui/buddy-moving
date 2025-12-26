const sections = [
  "audience",
  "metrics",
  "risks",
  "questions",
  "scenarios",
  "approaches"
];

const taskInput = document.getElementById("task");
const contextInput = document.getElementById("context");
const button = document.getElementById("analyze-button");
const loading = document.getElementById("loading");
const error = document.getElementById("error");
const errorMessage = document.getElementById("error-message");

const resolveApiBase = () => {
  if (window.VITE_API_BASE) {
    return window.VITE_API_BASE;
  }

  return "https://buddy-moving.onrender.com";
};

const renderContent = (element, value) => {
  element.innerHTML = "";
  if (!value) {
    element.textContent = "No details yet.";
    return;
  }

  if (Array.isArray(value)) {
    const list = document.createElement("ul");
    value.forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      list.appendChild(li);
    });
    element.appendChild(list);
    return;
  }

  if (typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) => {
      const p = document.createElement("p");
      p.innerHTML = `<strong>${key}:</strong> ${entry}`;
      element.appendChild(p);
    });
    return;
  }

  element.textContent = String(value);
};

const setError = (message) => {
  if (message) {
    errorMessage.textContent = message;
    error.hidden = false;
  } else {
    error.hidden = true;
  }
};

button.addEventListener("click", async () => {
  setError("");

  if (!taskInput.value.trim()) {
    setError("Please describe the task before analyzing.");
    return;
  }

  const apiBase = resolveApiBase();
  loading.hidden = false;
  button.disabled = true;

  try {
    const response = await fetch(`${apiBase}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: taskInput.value,
        context: contextInput.value
      })
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}.`);
    }

    const data = await response.json();
    sections.forEach((section) => {
      const container = document.querySelector(
        `[data-section="${section}"] .content`
      );
      renderContent(container, data?.[section]);
    });
  } catch (err) {
    setError(err instanceof Error ? err.message : "Something went wrong.");
  } finally {
    loading.hidden = true;
    button.disabled = false;
  }
});
