import rawData from "./eval_cases_v2.json";
import type {
  NormalizedCase,
  NormalizedContext,
  TestCasesFile,
  TestContextEntry,
  TestCaseEntry,
} from "./types";

const normalizeCase = (
  entry: TestCaseEntry,
  context: { id: string; title: string; context: string },
  index: number,
): NormalizedCase => {
  const id = String(entry?.id || `${context.id}-case-${index + 1}`);
  return {
    id,
    contextId: context.id,
    contextTitle: context.title,
    contextText: context.context,
    title: String(entry?.title || entry?.task || `Case ${index + 1}`),
    task: String(entry?.task || entry?.title || ""),
    scale: String(entry?.scale || "medium"),
    tags: Array.isArray(entry?.tags) ? entry.tags.map(String) : [],
  };
};

const normalizeContext = (
  entry: TestContextEntry,
  index: number,
): NormalizedContext => {
  const id = String(entry?.id || `context-${index + 1}`);
  const title = String(entry?.title || `Context ${index + 1}`);
  const context = String(entry?.context || "");
  const cases = Array.isArray(entry?.cases)
    ? entry.cases.map((caseEntry, caseIndex) =>
        normalizeCase(caseEntry ?? {}, { id, title, context }, caseIndex),
      )
    : [];

  return { id, title, context, cases };
};

export const loadTestCases = (): { contexts: NormalizedContext[] } => {
  const data = rawData as TestCasesFile;
  const contexts = Array.isArray(data?.contexts)
    ? data.contexts.map((entry, index) => normalizeContext(entry ?? {}, index))
    : [];

  return { contexts };
};

export const flattenCases = (
  data: { contexts: NormalizedContext[] },
): NormalizedCase[] =>
  data.contexts.flatMap((context) => context.cases || []);
