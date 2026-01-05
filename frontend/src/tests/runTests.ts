import { streamSse } from "./sseClient";
import type {
  AnalysisKey,
  CaseResult,
  SseErrorEvent,
  SseKeyEvent,
  SseStatusEvent,
  TestCase,
  TestContext,
} from "./types";

export const ANALYSIS_KEYS: AnalysisKey[] = [
  "framing",
  "unknowns",
  "solution_space",
  "decision",
  "experiment_plan",
  "work_package",
];

const parseJson = <T>(value: string): T | null => {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

export const runTestCase = async ({
  testCase,
  context,
  apiBase,
  signal,
  onUpdate,
}: {
  testCase: TestCase;
  context: TestContext;
  apiBase: string;
  signal: AbortSignal;
  onUpdate: (result: CaseResult) => void;
}): Promise<CaseResult> => {
  const startedAt = new Date().toISOString();
  let caseResult: CaseResult = {
    caseId: testCase.id,
    contextId: context.id,
    title: testCase.title,
    scale: testCase.scale,
    tags: testCase.tags,
    startedAt,
    ok: false,
    analysis: {},
    keyStatus: {},
  };

  let doneReceived = false;

  const update = (updateResult: Partial<CaseResult>) => {
    caseResult = {
      ...caseResult,
      ...updateResult,
      analysis: {
        ...caseResult.analysis,
        ...updateResult.analysis,
      },
      keyStatus: {
        ...caseResult.keyStatus,
        ...updateResult.keyStatus,
      },
    };
    onUpdate(caseResult);
  };

  await streamSse({
    url: `${apiBase}/analyze/stream`,
    body: {
      task: testCase.task,
      context: context.context,
      keys: ANALYSIS_KEYS,
    },
    signal,
    onEvent: (event, data) => {
      if (event === "status") {
        const payload = parseJson<SseStatusEvent>(data);
        if (payload?.language) {
          update({ language: payload.language });
        }
      }
      if (event === "key") {
        const payload = parseJson<SseKeyEvent>(data);
        if (payload) {
          update({
            analysis: {
              [payload.key]: { summary: payload.summary, value: payload.value },
            },
            keyStatus: {
              [payload.key]: {
                summary: payload.summary,
                value: payload.value,
                status: payload.status,
              },
            },
          });
        }
      }
      if (event === "error") {
        const payload = parseJson<SseErrorEvent>(data);
        if (payload) {
          update({
            error: `${payload.key ?? ""} ${payload.error}`.trim(),
          });
        }
      }
      if (event === "done") {
        doneReceived = true;
      }
    },
  });

  const finishedAt = new Date().toISOString();
  const okKeys = Object.values(caseResult.keyStatus || {}).filter(
    (entry) => entry?.status === "ok",
  ).length;

  const ok = doneReceived && okKeys >= 3;

  update({
    finishedAt,
    ok,
    error: ok ? undefined : caseResult.error || "Incomplete run",
  });

  return caseResult;
};
