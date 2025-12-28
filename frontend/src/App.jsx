import { useMemo, useState } from "react";
import { Button, Textarea } from "@heroui/react";

const initialOutput = "Enter a task and click Analyze to see the response.";
const API_BASE = import.meta.env.VITE_API_BASE || "";
const mockResponse = {
  summary: "Mock analysis (backend unavailable).",
  highlights: [
    "You can deploy the frontend to GitHub Pages right away.",
    "Configure VITE_API_BASE to point to the backend when ready."
  ],
  recommendations: ["Keep tasks concise.", "Add API_BASE for live data."]
};

export default function App() {
  const [task, setTask] = useState("");
  const [result, setResult] = useState(initialOutput);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const canSubmit = useMemo(() => task.trim().length > 0 && !isLoading, [task, isLoading]);

  const handleAnalyze = async () => {
    if (!task.trim()) {
      setError("Please enter a task to analyze.");
      return;
    }

    setIsLoading(true);
    setError("");
    setResult("Loading...");

    try {
      const response = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ task, context: "" })
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}.`);
      }

      const data = await response.json();
      setResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setError("Backend unavailable. Showing mock analysis instead.");
      setResult(JSON.stringify({ task, ...mockResponse }, null, 2));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col items-center justify-center gap-6 px-6 py-16">
        <div className="flex flex-col items-center gap-3">
          <img
            src={`${import.meta.env.BASE_URL}buddymoving.svg`}
            alt="Buddy Moving"
            className="h-10 w-auto"
          />
          <p className="text-center text-sm text-slate-400">
            Minimal HeroUI interface for reliable deployments.
          </p>
        </div>

        <div className="w-full space-y-4 rounded-2xl border border-white/10 bg-white/5 p-6 shadow-lg">
          <Textarea
            label="Task"
            variant="bordered"
            placeholder="Describe what you want analyzed..."
            value={task}
            onChange={(event) => setTask(event.target.value)}
          />
          <Button color="primary" onPress={handleAnalyze} isLoading={isLoading} isDisabled={!canSubmit}>
            Analyze
          </Button>
          {error ? (
            <p className="text-sm text-rose-400">{error}</p>
          ) : null}
        </div>

        <div className="w-full rounded-2xl border border-white/10 bg-black/40 p-6">
          <pre className="whitespace-pre-wrap text-xs text-slate-200">{result}</pre>
        </div>
      </div>
    </div>
  );
}
