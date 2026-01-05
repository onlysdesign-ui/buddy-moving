import type { TestRun } from "./types";

const STORAGE_KEY = "buddy_tests_runs";

export const loadRuns = (): TestRun[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TestRun[]) : [];
  } catch (error) {
    console.warn("Failed to read test runs", error);
    return [];
  }
};

export const saveRuns = (runs: TestRun[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  } catch (error) {
    console.warn("Failed to save test runs", error);
  }
};

export const addRun = (runs: TestRun[], run: TestRun) => {
  const updated = [run, ...runs];
  saveRuns(updated);
  return updated;
};
