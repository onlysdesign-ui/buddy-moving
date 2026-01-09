import { getApiBase } from "../config/apiBase";

export const DEFAULT_KEYS = [
  "framing",
  "unknowns",
  "solution_space",
  "decision",
  "experiment_plan",
  "work_package",
] as const;

export const KEY_TITLES: Record<(typeof DEFAULT_KEYS)[number], string> = {
  framing: "Framing",
  unknowns: "Unknowns",
  solution_space: "Solution space",
  decision: "Decision",
  experiment_plan: "Experiment plan",
  work_package: "Work package",
};

export type AnalysisKey = (typeof DEFAULT_KEYS)[number];

export type AnalysisValue = {
  summary?: string;
  value?: string;
};

export type AnalysisResponse = {
  analysis?: Record<string, AnalysisValue | string>;
};

export type StreamKeyPayload = {
  key: AnalysisKey;
  summary?: string;
  value?: string;
};

export type StreamStatusPayload = {
  status: string;
  completed?: number;
  total?: number;
  key?: AnalysisKey;
};

export type StreamErrorPayload = {
  key?: AnalysisKey;
  error?: string;
  details?: string;
};

const DEBUG_STREAM =
  String(import.meta.env.VITE_DEBUG_STREAM ?? "").toLowerCase() === "true";

const parseSseEvent = (rawEvent: string) => {
  const lines = rawEvent.split("\n");
  let event = "message";
  const dataLines: string[] = [];

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

export const streamAnalysis = async ({
  task,
  context,
  keys,
  signal,
  onKey,
  onStatus,
  onError,
}: {
  task: string;
  context: string;
  keys: AnalysisKey[];
  signal?: AbortSignal;
  onKey?: (payload: StreamKeyPayload) => void;
  onStatus?: (payload: StreamStatusPayload) => void;
  onError?: (payload: StreamErrorPayload) => void;
}) => {
  const response = await fetch(`${getApiBase()}/analyze/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({ task, context, keys }),
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

  const handlePayload = (event: string, data: string) => {
    if (!event) return;

    if (event === "key") {
      if (!data) return;
      try {
        const payload = JSON.parse(data) as StreamKeyPayload;
        if (DEBUG_STREAM) {
          console.info("[stream] key", payload);
        }
        if (payload?.key) {
          onKey?.(payload);
        }
      } catch (error) {
        console.warn("Failed to parse key event", error);
      }
    }

    if (event === "status") {
      if (!data) return;
      try {
        const payload = JSON.parse(data) as StreamStatusPayload;
        if (DEBUG_STREAM) {
          console.info("[stream] status", payload);
        }
        onStatus?.(payload);
      } catch (error) {
        console.warn("Failed to parse status event", error);
      }
    }

    if (event === "error") {
      if (!data) return;
      try {
        const payload = JSON.parse(data) as StreamErrorPayload;
        if (DEBUG_STREAM) {
          console.info("[stream] error", payload);
        }
        onError?.(payload);
      } catch (error) {
        console.warn("Failed to parse error event", error);
      }
    }

    if (event === "done") {
      if (DEBUG_STREAM) {
        console.info("[stream] done");
      }
      sawDone = true;
    }
  };

  let streamError: unknown = null;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      events.forEach((rawEvent) => {
        const { event, data } = parseSseEvent(rawEvent);
        handlePayload(event, data);
      });
    }

    if (buffer.trim()) {
      const { event, data } = parseSseEvent(buffer);
      handlePayload(event, data);
    }
  } catch (error) {
    streamError = error;
  } finally {
    if (signal?.aborted) {
      return;
    }
    if (!sawDone) {
      onError?.({ error: "Stream ended early. Analysis marked complete." });
    }
  }

  if (streamError) {
    throw streamError;
  }
};

export const fetchAnalysis = async ({
  task,
  context,
  keys,
  signal,
}: {
  task: string;
  context: string;
  keys: AnalysisKey[];
  signal?: AbortSignal;
}): Promise<AnalysisResponse> => {
  const response = await fetch(`${getApiBase()}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ task, context, keys }),
    signal,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return response.json();
};

export const runAnalysisAction = async ({
  task,
  context,
  key,
  value,
  currentAnalysis,
  action,
}: {
  task: string;
  context: string;
  key: AnalysisKey;
  value: string;
  currentAnalysis: Record<string, string>;
  action: "deeper" | "verify";
}): Promise<{ summary?: string; value?: string }> => {
  const endpoint = action === "deeper" ? "/analyze/deeper" : "/analyze/verify";
  const response = await fetch(`${getApiBase()}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      task,
      context,
      key,
      value,
      currentAnalysis,
    }),
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  return response.json();
};
