import type { TestCase, TestCaseResult } from "./types";
import { DEFAULT_TEST_KEYS } from "./types";
import { streamSse } from "./sseClient";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isKeySuccess = (status?: string) => {
  if (!status) return false;
  const normalized = status.toLowerCase();
  return normalized === "ok" || normalized === "success" || normalized === "done";
};

interface RunCaseOptions {
  testCase: TestCase;
  backendBase: string;
  signal?: AbortSignal;
}

const runSingleCase = async ({ testCase, backendBase, signal }: RunCaseOptions) => {
  const startedAt = new Date().toISOString();
  const analysis: TestCaseResult["analysis"] = {};
  const okKeys = new Set<string>();
  let error: string | undefined;
  let language: string | null = null;

  const { sawDone } = await streamSse({
    url: `${backendBase}/analyze/stream`,
    payload: {
      task: testCase.task,
      context: testCase.contextText,
      keys: DEFAULT_TEST_KEYS,
    },
    signal,
    onEvent: (event, data) => {
      if (!data) return;
      if (event === "status") {
        try {
          const payload = JSON.parse(data) as { language?: string };
          if (payload.language) {
            language = payload.language;
          }
        } catch (parseError) {
          console.warn("Failed to parse status payload", parseError);
        }
      }

      if (event === "key") {
        try {
          const payload = JSON.parse(data) as {
            key: string;
            summary?: string;
            value?: string;
            status?: string;
          };
          if (!payload.key) return;
          analysis[payload.key] = {
            summary: payload.summary ?? "",
            value: payload.value ?? payload.summary ?? "",
            status: payload.status,
          };
          if (isKeySuccess(payload.status)) {
            okKeys.add(payload.key);
          }
        } catch (parseError) {
          console.warn("Failed to parse key payload", parseError);
        }
      }

      if (event === "error") {
        try {
          const payload = JSON.parse(data) as { error?: string; details?: string };
          error = payload.error || payload.details || "Unknown error";
        } catch (parseError) {
          error = "Unknown error";
        }
      }
    },
  });

  const finishedAt = new Date().toISOString();
  const ok = sawDone && okKeys.size >= 3 && !error;

  return {
    caseId: testCase.id,
    contextId: testCase.contextId,
    title: testCase.title,
    scale: testCase.scale,
    tags: testCase.tags,
    startedAt,
    finishedAt,
    ok,
    language,
    error: ok ? undefined : error || "Missing required output.",
    analysis,
  } satisfies TestCaseResult;
};

interface RunTestsOptions {
  cases: TestCase[];
  backendBase: string;
  signal?: AbortSignal;
  onProgress?: (completed: number, total: number) => void;
  onCaseResult?: (result: TestCaseResult, completed: number, total: number) => void;
  delayMs?: number;
}

export const runTests = async ({
  cases,
  backendBase,
  signal,
  onProgress,
  onCaseResult,
  delayMs = 300,
}: RunTestsOptions) => {
  const results: TestCaseResult[] = [];
  const total = cases.length;

  for (let index = 0; index < cases.length; index += 1) {
    if (signal?.aborted) {
      break;
    }

    const testCase = cases[index];
    let result: TestCaseResult;

    try {
      result = await runSingleCase({ testCase, backendBase, signal });
    } catch (error) {
      if (signal?.aborted) {
        break;
      }
      result = {
        caseId: testCase.id,
        contextId: testCase.contextId,
        title: testCase.title,
        scale: testCase.scale,
        tags: testCase.tags,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        ok: false,
        language: null,
        error: error instanceof Error ? error.message : "Failed to run case.",
        analysis: {},
      };
    }

    results.push(result);
    onCaseResult?.(result, results.length, total);
    onProgress?.(results.length, total);

    if (index < cases.length - 1) {
      await delay(delayMs);
    }
  }

  return {
    results,
    executedCases: results.length,
    cancelled: Boolean(signal?.aborted),
  };
};
