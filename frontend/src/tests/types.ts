export const DEFAULT_TEST_KEYS = [
  "framing",
  "unknowns",
  "solution_space",
  "decision",
  "experiment_plan",
  "work_package",
] as const;

export type TestKey = (typeof DEFAULT_TEST_KEYS)[number];

export type TestCaseEntry = {
  id?: string;
  title?: string;
  task?: string;
  scale?: string;
  tags?: string[];
};

export type TestContextEntry = {
  id?: string;
  title?: string;
  context?: string;
  cases?: TestCaseEntry[];
};

export type TestCasesFile = {
  contexts?: TestContextEntry[];
};

export type NormalizedCase = {
  id: string;
  contextId: string;
  contextTitle: string;
  contextText: string;
  title: string;
  task: string;
  scale: string;
  tags: string[];
};

export type NormalizedContext = {
  id: string;
  title: string;
  context: string;
  cases: NormalizedCase[];
};

export type CaseAnalysisEntry = {
  summary: string;
  value: string;
  status?: string;
};

export type CaseResult = {
  caseId: string;
  contextId: string;
  title: string;
  scale: string;
  tags: string[];
  startedAt: string;
  finishedAt: string;
  ok: boolean;
  language?: string;
  error?: string;
  analysis?: Partial<Record<TestKey, CaseAnalysisEntry>>;
};

export type RunSummary = {
  totalCases: number;
  succeeded: number;
  failed: number;
  cancelled: number;
};

export type RunStatus = "success" | "failed" | "partial" | "cancelled";

export type TestRun = {
  id: string;
  createdAt: string;
  status: RunStatus;
  summary: RunSummary;
  results: CaseResult[];
};

export type RunProgress = {
  completed: number;
  total: number;
  label?: string;
};
