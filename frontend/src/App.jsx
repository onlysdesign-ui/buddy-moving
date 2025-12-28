import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Container,
  Group,
  Loader,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  Title
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { nprogress } from "@mantine/nprogress";
import { IconAlertTriangle, IconCheck } from "@tabler/icons-react";

const DEFAULT_API_BASE = "https://buddy-moving.onrender.com";
const API_BASE = (import.meta.env.VITE_API_BASE || "").trim() || DEFAULT_API_BASE;

const sections = [
  { key: "audience", label: "Audience" },
  { key: "metrics", label: "Metrics" },
  { key: "risks", label: "Risks" },
  { key: "questions", label: "Questions" },
  { key: "scenarios", label: "Scenarios" },
  { key: "approaches", label: "Approaches" }
];

const emptyAnalysis = {
  audience: [],
  metrics: [],
  risks: [],
  questions: [],
  scenarios: [],
  approaches: []
};

export default function App() {
  const [task, setTask] = useState("");
  const [context, setContext] = useState("");
  const [analysis, setAnalysis] = useState(emptyAnalysis);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const isApiConfigured = Boolean(API_BASE);
  const canSubmit = useMemo(
    () => task.trim().length > 0 && !isLoading && isApiConfigured,
    [task, isLoading, isApiConfigured]
  );

  const handleAnalyze = async () => {
    if (!task.trim()) {
      setError("Please enter a task to analyze.");
      return;
    }

    if (!isApiConfigured) {
      setError("Add a VITE_API_BASE value to enable analysis.");
      return;
    }

    setIsLoading(true);
    setError("");
    nprogress.start();

    try {
      const base = API_BASE.replace(/\/$/, "");
      const response = await fetch(`${base}/analyze`, {
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
      setAnalysis(normalizeAnalysis(data));
      notifications.show({
        title: "Analysis complete",
        message: "Results updated",
        color: "green",
        icon: <IconCheck size={16} />
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to reach the API.";
      setError(message);
      notifications.show({
        title: "Something went wrong",
        message,
        color: "red",
        icon: <IconAlertTriangle size={16} />
      });
    } finally {
      nprogress.complete();
      setIsLoading(false);
    }
  };

  return (
    <Container size="lg" py="xl">
      <Stack gap="xl">
        <header>
          <Group gap="md">
            <img src={`${import.meta.env.BASE_URL}buddymoving.svg`} alt="Buddy Moving" height={56} />
            <Text size="lg" c="dimmed">
              Clear, fast insights for your next move.
            </Text>
          </Group>
        </header>

        <Card withBorder radius="md" padding="lg">
          <Stack gap="md">
            <Title order={3}>Analyze a task</Title>
            <Textarea
              label="Task"
              size="lg"
              minRows={4}
              placeholder="Describe what you want analyzed..."
              value={task}
              onChange={(event) => setTask(event.currentTarget.value)}
            />
            <Textarea
              label="Context"
              size="lg"
              minRows={4}
              placeholder="Add any helpful context (optional)."
              value={context}
              onChange={(event) => setContext(event.currentTarget.value)}
            />
            <Group justify="space-between" align="center" wrap="wrap">
              <Group gap="sm">
                <Button size="lg" onClick={handleAnalyze} disabled={!canSubmit} loading={isLoading}>
                  Analyze
                </Button>
                {isLoading ? (
                  <Group gap="xs">
                    <Loader size="xs" />
                    <Text size="sm" c="dimmed">
                      Analyzing...
                    </Text>
                  </Group>
                ) : null}
              </Group>
              <Badge variant="light" color="blue">
                API: {isApiConfigured ? API_BASE : "Not configured"}
              </Badge>
            </Group>
            {error ? (
              <Text size="sm" c="red.4">
                {error}
              </Text>
            ) : null}
            {!isApiConfigured ? (
              <Text size="sm" c="yellow.4">
                Set VITE_API_BASE to enable analysis requests.
              </Text>
            ) : null}
          </Stack>
        </Card>

        <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="md">
          {sections.map((section) => {
            const entries = analysis[section.key] ?? [];
            return (
              <Card key={section.key} withBorder radius="md" padding="lg">
                <Group justify="space-between" mb="sm">
                  <Text fw={600}>{section.label}</Text>
                  <Badge variant="outline" color="gray">
                    {entries.length} items
                  </Badge>
                </Group>
                {isLoading ? (
                  <Group gap="xs">
                    <Loader size="xs" />
                    <Text size="sm" c="dimmed">
                      Loading...
                    </Text>
                  </Group>
                ) : entries.length > 0 ? (
                  <Stack gap="xs">
                    {entries.map((entry, index) => (
                      <Text key={`${section.key}-${index}`} size="sm" c="gray.2">
                        • {entry}
                      </Text>
                    ))}
                  </Stack>
                ) : (
                  <Text size="sm" c="dimmed">
                    No details yet.
                  </Text>
                )}
              </Card>
            );
          })}
        </SimpleGrid>
      </Stack>
    </Container>
  );
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
