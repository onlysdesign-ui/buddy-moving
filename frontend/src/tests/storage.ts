import type { TestRun } from "./types";

const STORAGE_KEY = "buddy_tests_runs";

export const loadRuns = (): TestRun[] => {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TestRun[]) : [];
  } catch {
    return [];
  }
};

export const saveRuns = (runs: TestRun[]): void => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
};

export const addRun = (run: TestRun): TestRun[] => {
  const runs = loadRuns();
  const next = [run, ...runs];
  saveRuns(next);
  return next;
};
