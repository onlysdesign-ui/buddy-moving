import { useState } from "react";
import {
  Box,
  Button,
  Callout,
  Card,
  Container,
  Flex,
  Grid,
  Heading,
  Spinner,
  Text,
  TextArea
} from "@radix-ui/themes";
import { InfoCircledIcon } from "@radix-ui/react-icons";

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
    return <Text color="gray">No details yet.</Text>;
  }

  if (Array.isArray(value)) {
    return (
      <Flex direction="column" gap="2">
        {value.map((item, index) => (
          <Text key={`${item}-${index}`} size="2">
            • {item}
          </Text>
        ))}
      </Flex>
    );
  }

  if (typeof value === "object") {
    return (
      <Flex direction="column" gap="2">
        {Object.entries(value).map(([key, entry]) => (
          <Text key={key} size="2">
            <strong>{key}:</strong> {String(entry)}
          </Text>
        ))}
      </Flex>
    );
  }

  return (
    <Text size="2" style={{ whiteSpace: "pre-wrap" }}>
      {String(value)}
    </Text>
  );
};

function App() {
  const [task, setTask] = useState("");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const apiBase = import.meta.env.VITE_API_BASE || "";

  const handleReset = () => {
    setTask("");
    setContext("");
    setResult(null);
    setError("");
    setLoading(false);
  };

  const handleAnalyze = async () => {
    setError("");
    setResult(null);

    if (!task.trim()) {
      setError("Please describe the task before analyzing.");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box style={{ minHeight: "100vh", padding: "48px 0" }}>
      <Container size="3">
        <Flex direction="column" gap="5">
          <Box className="app-header">
            <Flex align="center" gap="4" wrap="wrap">
              <button
                type="button"
                onClick={handleReset}
                aria-label="Reset BuddyMoving"
                className="logo-button"
              >
                <img src="/buddymoving.svg" alt="BuddyMoving" />
              </button>
              <Box>
                <Text color="gray" size="2">
                  Product-design copilot for smarter product decisions.
                </Text>
              </Box>
            </Flex>
          </Box>

          <Box className="panel input-panel">
            <Flex direction="column" gap="4">
              <Box>
                <Text as="label" size="2" weight="medium">
                  Task
                </Text>
                <TextArea
                  className="large-input"
                  placeholder="Describe the task or feature you want to analyze"
                  value={task}
                  onChange={(event) => setTask(event.target.value)}
                  mt="2"
                  size="3"
                />
              </Box>
              <Box>
                <Text as="label" size="2" weight="medium">
                  Context
                </Text>
                <TextArea
                  className="large-input"
                  placeholder="Share context, constraints, or goals"
                  value={context}
                  onChange={(event) => setContext(event.target.value)}
                  mt="2"
                  size="3"
                />
              </Box>
              <Flex justify="end" align="center" gap="3">
                {loading && <Spinner size="3" />}
                <Button
                  className="analyze-button"
                  onClick={handleAnalyze}
                  disabled={loading}
                >
                  Analyze
                </Button>
              </Flex>
            </Flex>
          </Box>

          {error && (
            <Callout.Root color="red">
              <Callout.Icon>
                <InfoCircledIcon />
              </Callout.Icon>
              <Callout.Text>{error}</Callout.Text>
            </Callout.Root>
          )}

          <Grid columns={{ initial: "1", md: "2" }} gap="4">
            {sectionOrder.map((key) => (
              <Box key={key} className="panel result-panel">
                <Flex direction="column" gap="3">
                  <Heading size="4">{sectionLabels[key]}</Heading>
                  {renderContent(result?.[key])}
                </Flex>
              </Box>
            ))}
          </Grid>
        </Flex>
      </Container>
    </Box>
  );
}

export default App;
