import { useEffect, useMemo, useRef, useState } from "react";
import type { TestCase, TestCaseResult, TestData, TestRun } from "../tests/types";
import { DEFAULT_TEST_KEYS } from "../tests/types";
import { loadTestCases, flattenTestCases } from "../tests/testCases";
import { runTests } from "../tests/runTests";
import { addRun, loadRuns, saveRuns } from "../tests/storage";

const PRODUCTION_BACKEND = "https://buddy-moving.onrender.com";

const getBackendBase = () => {
  const envBase = import.meta.env.VITE_API_BASE as string | undefined;
  if (envBase && envBase.trim()) {
    return envBase;
  }
  return import.meta.env.PROD ? PRODUCTION_BACKEND : "http://localhost:3000";
};

const formatDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) return "Unknown time";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatDuration = (start: string, end: string) => {
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) return "—";
  const seconds = Math.max(0, Math.round((endTime - startTime) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
};

const formatTags = (tags: string[]) => {
  const limited = tags.slice(0, 3);
  const extra = tags.length - limited.length;
  return {
    tags: limited,
    extra: extra > 0 ? `+${extra}` : null,
  };
};

const computeStatus = (run: TestRun, cancelled: boolean) => {
  if (cancelled) return "cancelled";
  const { succeeded, failed, executedCases, totalCases } = run.summary;
  if (executedCases < totalCases) return "partial";
  if (succeeded > 0 && failed === 0) return "success";
  if (succeeded > 0 && failed > 0) return "partial";
  return "failed";
};

const getCaseAnalysisKeys = (result: TestCaseResult) => {
  const analysis = result.analysis || {};
  const defaultKeys = DEFAULT_TEST_KEYS.filter((key) => analysis[key]);
  const extraKeys = Object.keys(analysis).filter(
    (key) => !DEFAULT_TEST_KEYS.includes(key as (typeof DEFAULT_TEST_KEYS)[number]),
  );
  return [...defaultKeys, ...extraKeys];
};

export const TestsPage = () => {
  const [data, setData] = useState<TestData | null>(null);
  const [cases, setCases] = useState<TestCase[]>([]);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const storedRuns = loadRuns().sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    setRuns(storedRuns);
    setExpandedRunId(storedRuns[0]?.id ?? null);
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const loaded = await loadTestCases();
        setData(loaded);
        setCases(flattenTestCases(loaded));
      } catch (loadError) {
        setError("Failed to load test cases.");
        console.error(loadError);
      }
    };
    load();
  }, []);

  const contexts = useMemo(() => data?.contexts ?? [], [data]);

  const updateRun = (runId: string, updater: (run: TestRun) => TestRun) => {
    setRuns((prev) => {
      const updated = prev.map((run) => (run.id === runId ? updater(run) : run));
      saveRuns(updated);
      return updated;
    });
  };

  const handleRun = async () => {
    if (isRunning || error) return;
    const totalCases = cases.length;
    const runId = `run-${Date.now()}`;
    const run: TestRun = {
      id: runId,
      createdAt: new Date().toISOString(),
      status: "partial",
      summary: {
        totalCases,
        succeeded: 0,
        failed: 0,
        executedCases: 0,
      },
      results: [],
    };

    setIsRunning(true);
    setProgress({ completed: 0, total: totalCases });
    setExpandedRunId(runId);
    setRuns((prev) => addRun(prev, run));

    const controller = new AbortController();
    controllerRef.current = controller;
    const backendBase = getBackendBase();

    try {
      const { results, executedCases, cancelled } = await runTests({
        cases,
        backendBase,
        signal: controller.signal,
        onProgress: (completed, total) => {
          setProgress({ completed, total });
        },
        onCaseResult: (result, completed) => {
          updateRun(runId, (current) => {
            const updatedResults = [...current.results, result];
            const succeeded = updatedResults.filter((item) => item.ok).length;
            const failed = updatedResults.length - succeeded;
            const next = {
              ...current,
              results: updatedResults,
              summary: {
                totalCases,
                succeeded,
                failed,
                executedCases: completed,
              },
            };
            return {
              ...next,
              status: computeStatus(next, false),
            };
          });
          setProgress({ completed, total: totalCases });
        },
      });

      updateRun(runId, (current) => {
        const succeeded = results.filter((item) => item.ok).length;
        const failed = results.length - succeeded;
        const executed = executedCases;
        const summary = {
          totalCases,
          succeeded,
          failed,
          executedCases: executed,
        };
        return {
          ...current,
          results,
          summary,
          status: computeStatus({ ...current, summary }, cancelled),
        };
      });
    } finally {
      setIsRunning(false);
      controllerRef.current = null;
      setProgress({ completed: 0, total: 0 });
    }
  };

  const handleCancel = () => {
    controllerRef.current?.abort();
  };

  const toggleRun = (runId: string) => {
    setExpandedRunId((prev) => (prev === runId ? null : runId));
  };

  const toggleKey = (key: string) => {
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <section className="tests-page">
      <header className="tests-header">
        <div>
          <h1>Regression tests</h1>
        </div>
        <div className="tests-actions">
          <button type="button" onClick={handleRun} disabled={isRunning}>
            Прогнать тесты
          </button>
          {isRunning && (
            <button type="button" onClick={handleCancel}>
              Cancel
            </button>
          )}
          {isRunning && (
            <span>
              Running... {progress.completed}/{progress.total}
            </span>
          )}
        </div>
      </header>

      {error && <p>{error}</p>}

      {!error && runs.length === 0 && (
        <p>No runs yet. Run the suite to get started.</p>
      )}

      <div className="tests-history">
        {runs.map((run) => {
          const isExpanded = expandedRunId === run.id;
          return (
            <details key={run.id} open={isExpanded}>
              <summary onClick={() => toggleRun(run.id)}>
                <div>
                  <strong>{formatDateTime(run.createdAt)}</strong>
                </div>
                <div>
                  <span>{run.status}</span>
                  <span>
                    {run.summary.succeeded} passed / {run.summary.failed} failed
                  </span>
                </div>
              </summary>
              <div>
                {contexts.map((context) => {
                  const caseResults = context.cases
                    .map((caseItem) => {
                      const result = run.results.find(
                        (entry) => entry.caseId === caseItem.id,
                      );
                      return result ? { result, caseItem } : null;
                    })
                    .filter(Boolean) as Array<{
                    result: TestCaseResult;
                    caseItem: TestCase;
                  }>;

                  if (caseResults.length === 0) return null;

                  return (
                    <div key={context.id} className="context-block">
                      <h3>{context.title}</h3>
                      <p>{context.context}</p>
                      <div>
                        {caseResults.map(({ result, caseItem }) => {
                          const duration = formatDuration(
                            result.startedAt,
                            result.finishedAt,
                          );
                          const tagInfo = formatTags(caseItem.tags || []);
                          return (
                            <details key={caseItem.id}>
                              <summary>
                                <span>{caseItem.scale}</span>
                                <span>{caseItem.title}</span>
                                <span>{result.ok ? "OK" : "Fail"}</span>
                                <span>
                                  {tagInfo.tags.join(", ")}
                                  {tagInfo.extra ? ` ${tagInfo.extra}` : ""}
                                </span>
                                <span>{duration}</span>
                              </summary>
                              <div>
                                {result.error && <p>{result.error}</p>}
                                {getCaseAnalysisKeys(result).map((key) => {
                                  const entry = result.analysis?.[key];
                                  const summary = entry?.summary ?? "";
                                  const value = entry?.value ?? "";
                                  const toggleId = `${run.id}-${caseItem.id}-${key}`;
                                  const showFull = expandedKeys[toggleId];
                                  return (
                                    <div key={key} className="case-key">
                                      <div>
                                        <strong>{key}</strong>
                                        <button
                                          type="button"
                                          onClick={() => toggleKey(toggleId)}
                                        >
                                          {showFull ? "Hide full" : "Show full"}
                                        </button>
                                      </div>
                                      <pre>
                                        {showFull ? value || summary : summary || value}
                                      </pre>
                                    </div>
                                  );
                                })}
                              </div>
                            </details>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
};
