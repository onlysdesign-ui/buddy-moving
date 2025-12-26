import { useEffect, useState } from "react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  Chip,
  Spinner,
  Textarea
} from "@heroui/react";

const sectionLabels = {
  audience: "Audience",
  metrics: "Metrics",
  risks: "Risks",
  questions: "Questions",
  scenarios: "Scenarios",
  approaches: "Approaches"
};

const sectionOrder = [
  "audience",
  "metrics",
  "risks",
  "questions",
  "scenarios",
  "approaches"
];

const renderContent = (value) => {
  if (!value) {
    return <p className="muted">No details yet.</p>;
  }

  if (Array.isArray(value)) {
    return (
      <ul className="result-list">
        {value.map((item, index) => (
          <li key={`${item}-${index}`}>{item}</li>
        ))}
      </ul>
    );
  }

  if (typeof value === "object") {
    return (
      <div className="result-stack">
        {Object.entries(value).map(([key, entry]) => (
          <p key={key}>
            <strong>{key}:</strong> {String(entry)}
          </p>
        ))}
      </div>
    );
  }

  return <p className="preformatted">{String(value)}</p>;
};

function App() {
  const [task, setTask] = useState("");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [toast, setToast] = useState(null);

  const apiBase = import.meta.env.VITE_API_BASE || "";

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const handleReset = () => {
    setTask("");
    setContext("");
    setResult(null);
    setError("");
    setLoading(false);
    setToast(null);
  };

  const handleAnalyze = async () => {
    setError("");
    setResult(null);
    setToast(null);

    if (!task.trim()) {
      setError("Please describe the task before analyzing.");
      setToast({ message: "Add a task description to analyze.", tone: "warning" });
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${apiBase}/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ task, context })
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}.`);
      }

      const data = await response.json();
      setResult(data?.analysis ?? data);
      setToast({ message: "Analysis complete.", tone: "success" });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
      setToast({ message, tone: "danger" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      {toast && (
        <div className="toast">
          <Card className={`toast-card toast-${toast.tone}`} shadow="lg">
            <CardBody>
              <div className="toast-content">
                <Chip color={toast.tone} variant="flat" size="sm">
                  {toast.tone === "success" ? "Done" : "Notice"}
                </Chip>
                <span>{toast.message}</span>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      <div className="app-shell">
        <header className="app-header">
          <button
            type="button"
            onClick={handleReset}
            aria-label="Reset BuddyMoving"
            className="logo-button"
          >
            <img src="/buddymoving.svg" alt="BuddyMoving" />
          </button>
          <p className="subtitle">
            Product-design copilot for smarter product decisions.
          </p>
        </header>

        <Card className="panel input-panel" shadow="lg">
          <CardBody className="panel-body">
            <Textarea
              label="Task"
              labelPlacement="outside"
              placeholder="Describe the task or feature you want to analyze"
              value={task}
              onValueChange={setTask}
              minRows={6}
              size="lg"
              radius="lg"
              variant="bordered"
              classNames={{
                inputWrapper: "textarea-wrapper",
                input: "textarea-input"
              }}
            />
            <Textarea
              label="Context"
              labelPlacement="outside"
              placeholder="Share context, constraints, or goals"
              value={context}
              onValueChange={setContext}
              minRows={6}
              size="lg"
              radius="lg"
              variant="bordered"
              classNames={{
                inputWrapper: "textarea-wrapper",
                input: "textarea-input"
              }}
            />
            <div className="actions-row">
              <div className="status">
                {loading && (
                  <Chip
                    size="sm"
                    color="primary"
                    variant="flat"
                    startContent={<Spinner size="sm" color="current" />}
                  >
                    Analyzing
                  </Chip>
                )}
              </div>
              <Button
                size="lg"
                radius="lg"
                color="primary"
                onPress={handleAnalyze}
                isDisabled={loading}
                startContent={
                  loading ? <Spinner size="sm" color="current" /> : null
                }
              >
                Analyze
              </Button>
            </div>
          </CardBody>
        </Card>

        {error && (
          <Card className="panel error-panel" shadow="lg">
            <CardBody>
              <div className="error-content">
                <Chip color="danger" variant="flat" size="sm">
                  Error
                </Chip>
                <span>{error}</span>
              </div>
            </CardBody>
          </Card>
        )}

        <div className="results-grid">
          {sectionOrder.map((key) => (
            <Card key={key} className="panel result-panel" shadow="lg">
              <CardHeader className="result-header">
                <h3>{sectionLabels[key]}</h3>
              </CardHeader>
              <CardBody>{renderContent(result?.[key])}</CardBody>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
