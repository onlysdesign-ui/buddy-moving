import rawCases from "./eval_cases_v2.json";
import type { TestContext } from "./types";

export const defaultTestContexts = rawCases as TestContext[];

export const getTotalCases = (contexts: TestContext[] = defaultTestContexts) =>
  contexts.reduce((total, context) => total + context.cases.length, 0);
