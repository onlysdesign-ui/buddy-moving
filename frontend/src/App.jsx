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
    return (
      <Text color="gray" size="2">
        No data yet.
      </Text>
    );
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
      <Container size="4" style={{ maxWidth: 960 }}>
        <Flex direction="column" gap="6">
          <Box className="app-header">
            <Flex
              align={{ initial: "start", sm: "center" }}
              direction={{ initial: "column", sm: "row" }}
              gap="3"
              justify="between"
            >
              <button
                type="button"
                onClick={handleReset}
                aria-label="Reset BuddyMoving"
                className="logo-button"
              >
                <img src="/buddymoving.svg" alt="BuddyMoving logo" />
              </button>
              <Box>
                <Text color="gray" size="2">
                  Product-design copilot for smarter product decisions.
                </Text>
              </Box>
            </Flex>
          </Box>

          <Card className="form-card">
            <Flex direction="column" gap="4">
              <Box>
                <Flex direction="column" gap="1">
                  <Text as="label" size="2" weight="medium">
                    Task
                  </Text>
                  <Text size="1" color="gray">
                    Outline what you want BuddyMoving to evaluate.
                  </Text>
                </Flex>
                <TextArea
                  className="input-textarea task-textarea"
                  placeholder="Describe the task or feature you want to analyze"
                  value={task}
                  onChange={(event) => setTask(event.target.value)}
                  mt="2"
                  size="3"
                />
              </Box>
              <Box>
                <Flex direction="column" gap="1">
                  <Text as="label" size="2" weight="medium">
                    Context
                  </Text>
                  <Text size="1" color="gray">
                    Share constraints, goals, or background that matters.
                  </Text>
                </Flex>
                <TextArea
                  className="input-textarea context-textarea"
                  placeholder="Share context, constraints, or goals"
                  value={context}
                  onChange={(event) => setContext(event.target.value)}
                  mt="2"
                  size="3"
                />
              </Box>
              <Flex justify="end">
                <Button
                  className="analyze-button"
                  onClick={handleAnalyze}
                  disabled={loading}
                >
                  <Flex align="center" gap="2">
                    {loading && <Spinner size="2" />}
                    <span>{loading ? "Analyzing" : "Analyze"}</span>
                  </Flex>
                </Button>
              </Flex>
            </Flex>
          </Card>

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
              <Card key={key} className="result-card">
                <Flex direction="column" gap="3">
                  <Heading size="4">{sectionLabels[key]}</Heading>
                  {renderContent(result?.[key])}
                </Flex>
              </Card>
            ))}
          </Grid>
        </Flex>
      </Container>
    </Box>
  );
}

export default App;
