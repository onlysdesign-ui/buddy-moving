type StreamOptions = {
  url: string;
  payload: unknown;
  signal?: AbortSignal;
  onEvent?: (event: string, data: string) => void;
};

type StreamResult = {
  sawDone: boolean;
};

const parseSseEvent = (rawEvent: string): { event: string; data: string } => {
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

export const streamSse = async ({
  url,
  payload,
  signal,
  onEvent,
}: StreamOptions): Promise<StreamResult> => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(payload),
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

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() || "";

    for (const rawEvent of events) {
      const { event, data } = parseSseEvent(rawEvent);
      if (event === "done") {
        sawDone = true;
      }
      onEvent?.(event, data);
    }
  }

  if (buffer.trim()) {
    const { event, data } = parseSseEvent(buffer);
    if (event === "done") {
      sawDone = true;
    }
    onEvent?.(event, data);
  }

  return { sawDone };
};
