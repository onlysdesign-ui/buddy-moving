import { STORAGE_KEY } from "./types.js";

export const loadRuns = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("Failed to read test runs", error);
    return [];
  }
};

export const saveRuns = (runs) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  } catch (error) {
    console.warn("Failed to save test runs", error);
  }
};

export const addRun = (runs, run) => {
  const updated = [run, ...runs];
  saveRuns(updated);
  return updated;
};
