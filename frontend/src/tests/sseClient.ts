export type SseHandler = (event: string, data: string) => void;

export interface SseRequestOptions {
  url: string;
  body: unknown;
  signal?: AbortSignal;
  onEvent: SseHandler;
}

export const streamSse = async ({ url, body, signal, onEvent }: SseRequestOptions) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`SSE request failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const processChunk = (chunk: string) => {
    buffer += chunk;
    let boundaryIndex = buffer.indexOf("\n\n");
    while (boundaryIndex !== -1) {
      const rawEvent = buffer.slice(0, boundaryIndex).trim();
      buffer = buffer.slice(boundaryIndex + 2);
      if (rawEvent) {
        const lines = rawEvent.split(/\n/);
        let eventName = "message";
        const dataLines: string[] = [];
        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventName = line.replace("event:", "").trim();
          } else if (line.startsWith("data:")) {
            dataLines.push(line.replace("data:", "").trim());
          }
        }
        const data = dataLines.join("\n");
        onEvent(eventName, data);
      }
      boundaryIndex = buffer.indexOf("\n\n");
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      if (buffer.trim()) {
        processChunk("\n\n");
      }
      break;
    }
    processChunk(decoder.decode(value, { stream: true }));
  }
};
