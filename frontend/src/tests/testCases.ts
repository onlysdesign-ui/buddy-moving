import type { TestCase, TestContext, TestData } from "./types";

const CASES_URL = new URL("./eval_cases_v2.json", import.meta.url);

const ensureArray = <T,>(value: T[] | undefined | null): T[] =>
  Array.isArray(value) ? value : [];

const normalizeCase = (
  entry: Partial<TestCase> & { task?: string; title?: string },
  context: TestContext,
  index: number,
): TestCase => {
  const id = String(entry?.id || `${context.id}-case-${index + 1}`);
  return {
    id,
    contextId: context.id,
    contextTitle: context.title,
    contextText: context.context,
    title: String(entry?.title || entry?.task || `Case ${index + 1}`),
    task: String(entry?.task || entry?.title || ""),
    scale: String(entry?.scale || "medium"),
    tags: ensureArray(entry?.tags).map((tag) => String(tag)),
  };
};

const normalizeContext = (
  entry: Partial<TestContext> & { context?: string },
  index: number,
): TestContext => {
  const id = String(entry?.id || `context-${index + 1}`);
  const title = String(entry?.title || `Context ${index + 1}`);
  const contextText = String(entry?.context || "");
  const cases = ensureArray(entry?.cases).map((caseEntry, caseIndex) =>
    normalizeCase(caseEntry as Partial<TestCase>, { id, title, context: contextText, cases: [] }, caseIndex),
  );

  return {
    id,
    title,
    context: contextText,
    cases,
  };
};

export const loadTestCases = async (): Promise<TestData> => {
  const response = await fetch(CASES_URL);
  if (!response.ok) {
    throw new Error(`Unable to load test cases (${response.status}).`);
  }
  const data = (await response.json()) as TestData;
  const contexts = ensureArray(data?.contexts).map((context, index) =>
    normalizeContext(context, index),
  );
  return { contexts };
};

export const flattenTestCases = (data: TestData | null): TestCase[] =>
  ensureArray(data?.contexts).flatMap((context) => context.cases || []);
