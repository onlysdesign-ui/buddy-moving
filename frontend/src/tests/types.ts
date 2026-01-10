export type TestScale = "small" | "medium" | "large";

export interface TestCase {
  id: string;
  title: string;
  task: string;
  scale: TestScale;
  tags: string[];
}

export interface TestContext {
  id: string;
  title: string;
  context: string;
  cases: TestCase[];
}

export type AnalysisKey =
  | "framing"
  | "unknowns"
  | "solution_space"
  | "decision"
  | "experiment_plan"
  | "work_package";

export interface KeyResult {
  summary: string;
  value: string;
  status: "ok" | "error" | "partial" | "pending";
}

export interface CaseResult {
  caseId: string;
  contextId: string;
  title: string;
  scale: TestScale;
  tags: string[];
  startedAt: string;
  finishedAt?: string;
  ok: boolean;
  language?: string;
  error?: string;
  analysis?: Partial<
    Record<AnalysisKey, Omit<KeyResult, "status"> | string>
  >;
  keyStatus?: Partial<Record<AnalysisKey, KeyResult>>;
}

export interface TestRun {
  id: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "success" | "failed" | "partial";
  totalCases: number;
  succeeded: number;
  failed: number;
  cancelled: boolean;
  cases: CaseResult[];
}

export interface SseStatusEvent {
  status: string;
  completed: number;
  total: number;
  key?: string;
  language?: string;
}

export interface SseKeyEvent {
  key: AnalysisKey;
  summary: string;
  value: string;
  status: "ok" | "error" | "partial";
}

export interface SseErrorEvent {
  key?: string;
  error: string;
  details?: string;
}
