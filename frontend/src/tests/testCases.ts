import rawCases from "./eval_cases_v2.json";
import type { TestContext } from "./types";

export const testContexts = rawCases as TestContext[];

export const getTotalCases = () =>
  testContexts.reduce((total, context) => total + context.cases.length, 0);
