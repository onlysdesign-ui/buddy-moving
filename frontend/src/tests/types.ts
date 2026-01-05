export type TestKey =
  | "framing"
  | "unknowns"
  | "solution_space"
  | "decision"
  | "experiment_plan"
  | "work_package";

export const DEFAULT_TEST_KEYS: TestKey[] = [
  "framing",
  "unknowns",
  "solution_space",
  "decision",
  "experiment_plan",
  "work_package",
];

export type RunStatus = "success" | "partial" | "failed" | "cancelled";

export interface TestCase {
  id: string;
  contextId: string;
  contextTitle: string;
  contextText: string;
  title: string;
  task: string;
  scale: string;
  tags: string[];
}

export interface TestContext {
  id: string;
  title: string;
  context: string;
  cases: TestCase[];
}

export interface TestData {
  contexts: TestContext[];
}

export interface TestCaseAnalysis {
  summary: string;
  value: string;
  status?: string;
}

export interface TestCaseResult {
  caseId: string;
  contextId: string;
  title: string;
  scale: string;
  tags: string[];
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  language: string | null;
  error?: string;
  analysis?: Record<string, TestCaseAnalysis>;
}

export interface TestRunSummary {
  totalCases: number;
  succeeded: number;
  failed: number;
  executedCases: number;
}

export interface TestRun {
  id: string;
  createdAt: string;
  status: RunStatus;
  summary: TestRunSummary;
  results: TestCaseResult[];
}
