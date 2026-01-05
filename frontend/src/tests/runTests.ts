import { DEFAULT_TEST_KEYS, type CaseResult, type NormalizedCase } from "./types";
import { streamSse } from "./sseClient";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type RunTestsOptions = {
  cases: NormalizedCase[];
  apiBase: string;
  signal: AbortSignal;
  onProgress?: (completed: number, total: number, label?: string) => void;
  onCaseResult?: (result: CaseResult) => void;
};

export type RunTestsResult = {
  results: CaseResult[];
  cancelled: boolean;
};

export const runTests = async ({
  cases,
  apiBase,
  signal,
  onProgress,
  onCaseResult,
}: RunTestsOptions): Promise<RunTestsResult> => {
  const results: CaseResult[] = [];
  let cancelled = false;
  const total = cases.length;
  let completed = 0;

  for (const testCase of cases) {
    if (signal.aborted) {
      cancelled = true;
      break;
    }

    onProgress?.(
      completed,
      total,
      `${testCase.contextTitle}: ${testCase.title}`,
    );

    const startedAt = new Date().toISOString();
    let finishedAt = startedAt;
    let ok = false;
    let language: string | undefined;
    let error: string | undefined;
    const analysis: CaseResult["analysis"] = {};
    let doneReceived = false;
    let succeededKeys = 0;

    try {
      const { sawDone } = await streamSse({
        url: `${apiBase.replace(/\/$/, "")}/analyze/stream`,
        payload: {
          task: testCase.task,
          context: testCase.contextText,
          keys: DEFAULT_TEST_KEYS,
        },
        signal,
        onEvent: (event, data) => {
          if (!data) return;
          try {
            const parsed = JSON.parse(data);
            if (event === "status") {
              if (parsed?.language) {
                language = String(parsed.language);
              }
            }
            if (event === "key" && parsed?.key) {
              const keyName = String(parsed.key);
              if (DEFAULT_TEST_KEYS.includes(keyName as typeof DEFAULT_TEST_KEYS[number])) {
                analysis[keyName as keyof typeof analysis] = {
                  summary: String(parsed.summary ?? ""),
                  value: String(parsed.value ?? ""),
                  status: parsed.status ? String(parsed.status) : undefined,
                };
                if (String(parsed.status) === "ok") {
                  succeededKeys += 1;
                }
              }
            }
            if (event === "error") {
              error = parsed?.error
                ? String(parsed.error)
                : parsed?.details
                  ? String(parsed.details)
                  : "Stream error";
            }
          } catch (parseError) {
            error = parseError instanceof Error ? parseError.message : "Stream parse error";
          }
        },
      });

      doneReceived = sawDone;
      ok = doneReceived && succeededKeys >= 3;
    } catch (err) {
      if (signal.aborted) {
        cancelled = true;
        error = "Cancelled";
      } else if (err instanceof Error) {
        error = err.message;
      } else {
        error = "Unexpected error";
      }
    } finally {
      finishedAt = new Date().toISOString();
      const result: CaseResult = {
        caseId: testCase.id,
        contextId: testCase.contextId,
        title: testCase.title,
        scale: testCase.scale,
        tags: testCase.tags,
        startedAt,
        finishedAt,
        ok,
        language,
        error,
        analysis: Object.keys(analysis).length ? analysis : undefined,
      };
      results.push(result);
      completed += 1;
      onProgress?.(
        completed,
        total,
        `${testCase.contextTitle}: ${testCase.title}`,
      );
      onCaseResult?.(result);
    }

    if (signal.aborted) {
      cancelled = true;
      break;
    }

    await delay(300);
  }

  return { results, cancelled };
};
