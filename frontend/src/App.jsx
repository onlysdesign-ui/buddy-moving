import { useMemo, useState } from "react";
import { Button, Card, CardBody, CardHeader, Textarea } from "@heroui/react";

const initialResults = [
  {
    title: "Audience",
    items: []
  },
  {
    title: "Metrics",
    items: []
  },
  {
    title: "Risks",
    items: []
  },
  {
    title: "Questions",
    items: []
  },
  {
    title: "Scenarios",
    items: []
  },
  {
    title: "Approaches",
    items: []
  }
];
const API_BASE = import.meta.env.VITE_API_BASE || "";
const mockResponse = {
  analysis: {
    audience: ["Mock analysis (backend unavailable)."],
    metrics: ["You can deploy the frontend to GitHub Pages right away."],
    risks: ["Configure VITE_API_BASE to point to the backend when ready."],
    questions: ["Keep tasks concise."],
    scenarios: ["Add API_BASE for live data."],
    approaches: []
  }
};

export default function App() {
  const [task, setTask] = useState("");
  const [context, setContext] = useState("");
  const [results, setResults] = useState(initialResults);
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
    setResults(
      initialResults.map((item) => ({
        ...item,
        isLoading: true
      }))
    );

    try {
      const response = await fetch(`${API_BASE}/analyze`, {
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
      setResults(buildCards(normalizeAnalysis(data)));
    } catch (err) {
      setError("Backend unavailable. Showing mock analysis instead.");
      setResults(buildCards(normalizeAnalysis(mockResponse)));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-6 py-10">
        <header className="flex items-center justify-center md:justify-start">
          <img
            src={`${import.meta.env.BASE_URL}buddymoving.svg`}
            alt="Buddy Moving"
            className="h-14 w-auto md:h-16"
          />
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,280px)]">
          <Card className="border border-divider shadow-sm">
            <CardBody className="gap-4">
              <Textarea
                label="Task"
                variant="bordered"
                size="lg"
                minRows={4}
                placeholder="Describe what you want analyzed..."
                value={task}
                onChange={(event) => setTask(event.target.value)}
              />
              <Textarea
                label="Context"
                variant="bordered"
                size="lg"
                minRows={4}
                placeholder="Add any helpful context (optional)."
                value={context}
                onChange={(event) => setContext(event.target.value)}
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  color="primary"
                  size="lg"
                  onPress={handleAnalyze}
                  isLoading={isLoading}
                  isDisabled={!canSubmit}
                >
                  Analyze
                </Button>
                {error ? <p className="text-sm text-danger-400">{error}</p> : null}
              </div>
            </CardBody>
          </Card>

          <Card className="border border-divider shadow-sm">
            <CardHeader>
              <p className="text-sm font-medium text-default-500">Status</p>
            </CardHeader>
            <CardBody className="gap-2">
              <p className="text-base font-semibold">Ready for analysis</p>
              <p className="text-sm text-default-500">
                Results will populate in the cards below after you submit a task.
              </p>
            </CardBody>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {results.map((item, index) => (
            <Card key={`${item.title}-${index}`} className="border border-divider shadow-sm">
              <CardHeader>
                <p className="text-sm font-medium text-default-500">{item.title}</p>
              </CardHeader>
              <CardBody>
                {item.isLoading ? (
                  <p className="text-sm text-default-700">Loading...</p>
                ) : item.items.length > 0 ? (
                  <ul className="list-disc space-y-1 pl-5 text-sm text-default-700">
                    {item.items.map((entry, entryIndex) => (
                      <li key={`${item.title}-${entryIndex}`}>{entry}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-default-700">No details yet.</p>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

function buildCards(analysis) {
  return [
    {
      title: "Audience",
      items: analysis.audience
    },
    {
      title: "Metrics",
      items: analysis.metrics
    },
    {
      title: "Risks",
      items: analysis.risks
    },
    {
      title: "Questions",
      items: analysis.questions
    },
    {
      title: "Scenarios",
      items: analysis.scenarios
    },
    {
      title: "Approaches",
      items: analysis.approaches
    }
  ];
}

function normalizeAnalysis(data) {
  const analysis = data?.analysis ?? {};
  return {
    audience: Array.isArray(analysis.audience) ? analysis.audience : [],
    metrics: Array.isArray(analysis.metrics) ? analysis.metrics : [],
    risks: Array.isArray(analysis.risks) ? analysis.risks : [],
    questions: Array.isArray(analysis.questions) ? analysis.questions : [],
    scenarios: Array.isArray(analysis.scenarios) ? analysis.scenarios : [],
    approaches: Array.isArray(analysis.approaches) ? analysis.approaches : []
  };
}
