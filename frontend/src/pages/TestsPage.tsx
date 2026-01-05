import { useMemo, useRef, useState } from "react";
import { getApiBase } from "../config/apiBase";
import { loadTestCases, flattenCases } from "../tests/testCases";
import { runTests } from "../tests/runTests";
import { addRun, loadRuns, saveRuns } from "../tests/storage";
import {
  DEFAULT_TEST_KEYS,
  type CaseResult,
  type NormalizedContext,
  type RunProgress,
  type TestRun,
} from "../tests/types";

const formatDateTime = (value: string): string => {
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

const formatDuration = (start: string, end: string): string => {
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) return "—";
  const seconds = Math.max(0, Math.round((endTime - startTime) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainder}s` : `${remainder}s`;
};

const formatTags = (tags: string[]): { tags: string[]; extra: string | null } => {
  const limited = tags.slice(0, 3);
  const extra = tags.length - limited.length;
  return {
    tags: limited,
    extra: extra > 0 ? `+${extra}` : null,
  };
};

const getRunSummary = (results: CaseResult[], totalCases: number) => {
  let succeeded = 0;
  let failed = 0;
  let cancelled = 0;

  for (const result of results) {
    if (result.ok) {
      succeeded += 1;
    } else if (result.error === "Cancelled") {
      cancelled += 1;
    } else {
      failed += 1;
    }
  }

  return { totalCases, succeeded, failed, cancelled };
};

const computeRunStatus = (
  summary: ReturnType<typeof getRunSummary>,
  cancelled: boolean,
): TestRun["status"] => {
  if (cancelled) return "cancelled";
  const executed = summary.succeeded + summary.failed;
  if (executed < summary.totalCases) return "partial";
  if (summary.succeeded > 0 && summary.failed === 0 && summary.cancelled === 0)
    return "success";
  if (summary.succeeded > 0 && summary.failed > 0) return "partial";
  return "failed";
};

const buildRun = (totalCases: number): TestRun => {
  const now = new Date();
  return {
    id: `run-${now.getTime()}`,
    createdAt: now.toISOString(),
    status: "partial",
    summary: { totalCases, succeeded: 0, failed: 0, cancelled: 0 },
    results: [],
  };
};

const getCaseKeys = (result: CaseResult): string[] => {
  const analysis = result.analysis || {};
  const defaultKeys = DEFAULT_TEST_KEYS.filter((key) => analysis[key]);
  const extraKeys = Object.keys(analysis).filter(
    (key) => !DEFAULT_TEST_KEYS.includes(key as typeof DEFAULT_TEST_KEYS[number]),
  );
  return [...defaultKeys, ...extraKeys];
};

const buildContextGroups = (
  contexts: NormalizedContext[],
  results: CaseResult[],
) =>
  contexts
    .map((context) => {
      const cases = context.cases
        .map((caseItem) => {
          const result = results.find((entry) => entry.caseId === caseItem.id);
          return result ? { caseItem, result } : null;
        })
        .filter(Boolean);

      return { context, cases };
    })
    .filter((group) => group.cases.length > 0);

const TestsPage = () => {
  const data = useMemo(() => loadTestCases(), []);
  const [runs, setRuns] = useState<TestRun[]>(() => loadRuns());
  const [expandedRunId, setExpandedRunId] = useState<string | null>(
    () => loadRuns()[0]?.id ?? null,
  );
  const [expandedCases, setExpandedCases] = useState<Record<string, boolean>>({});
  const [expandedValues, setExpandedValues] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<RunProgress>({
    completed: 0,
    total: 0,
    label: "",
  });
  const [isRunning, setIsRunning] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const cases = useMemo(() => flattenCases(data), [data]);

  const updateRun = (runId: string, updater: (run: TestRun) => TestRun) => {
    setRuns((prev) => {
      const next = prev.map((run) => (run.id === runId ? updater(run) : run));
      saveRuns(next);
      return next;
    });
  };

  const handleToggleRun = (runId: string) => {
    setExpandedRunId((current) => (current === runId ? null : runId));
  };

  const handleToggleCase = (caseId: string) => {
    setExpandedCases((prev) => ({ ...prev, [caseId]: !prev[caseId] }));
  };

  const handleToggleValue = (key: string) => {
    setExpandedValues((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleCancel = () => {
    if (!isRunning) return;
    setCancelRequested(true);
    controllerRef.current?.abort();
    if (activeRunId) {
      updateRun(activeRunId, (run) => ({ ...run, status: "cancelled" }));
    }
  };

  const handleRun = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setCancelRequested(false);
    setProgress({ completed: 0, total: cases.length, label: "" });

    const run = buildRun(cases.length);
    setActiveRunId(run.id);
    const updatedRuns = addRun(run);
    setRuns(updatedRuns);
    setExpandedRunId(run.id);

    const controller = new AbortController();
    controllerRef.current = controller;

    const apiBase = getApiBase();

    const { results, cancelled } = await runTests({
      cases,
      apiBase,
      signal: controller.signal,
      onProgress: (completed, total, label) => {
        setProgress({ completed, total, label });
      },
      onCaseResult: (result) => {
        updateRun(run.id, (current) => {
          const nextResults = [...current.results, result];
          const summary = getRunSummary(nextResults, cases.length);
          return { ...current, results: nextResults, summary };
        });
      },
    });

    const summary = getRunSummary(results, cases.length);
    const status = computeRunStatus(summary, cancelled || cancelRequested);

    updateRun(run.id, (current) => ({
      ...current,
      results,
      summary,
      status,
    }));

    setIsRunning(false);
    setActiveRunId(null);
    controllerRef.current = null;
  };

  const statusLine = isRunning
    ? `Running... ${progress.completed}/${progress.total}`
    : "";

  return (
    <div className="tests-page">
      <header className="tests-header">
        <h1>Regression tests</h1>
        <div className="tests-actions">
          <button
            className="primary"
            type="button"
            onClick={handleRun}
            disabled={isRunning}
          >
            Прогнать тесты
          </button>
          {isRunning && (
            <button type="button" onClick={handleCancel}>
              Cancel
            </button>
          )}
        </div>
        {isRunning && (
          <div className="tests-status">
            {statusLine}
            {progress.label ? ` — ${progress.label}` : ""}
          </div>
        )}
      </header>

      <section className="tests-history">
        {!runs.length && (
          <div className="tests-run empty">
            No runs yet. Run the suite to get started.
          </div>
        )}
        {runs.map((run) => {
          const isExpanded = run.id === expandedRunId;
          const summary = run.summary;
          const contextGroups = buildContextGroups(data.contexts, run.results);

          return (
            <div className="tests-run" key={run.id}>
              <button
                type="button"
                className="tests-run-header"
                onClick={() => handleToggleRun(run.id)}
              >
                <div>
                  <strong>{formatDateTime(run.createdAt)}</strong>
                </div>
                <div className="tests-run-meta">
                  <span className={`status-badge status-${run.status}`}>
                    {run.status}
                  </span>
                  <span>{summary.succeeded} passed</span>
                  <span>{summary.failed} failed</span>
                  <span>{summary.cancelled} cancelled</span>
                </div>
              </button>

              {isExpanded && (
                <div className="tests-run-body">
                  {contextGroups.map((group) => (
                    <div className="tests-context" key={group.context.id}>
                      <div className="tests-context-header">
                        <h3>{group.context.title}</h3>
                        {group.context.context && (
                          <details>
                            <summary>Show context</summary>
                            <pre>{group.context.context}</pre>
                          </details>
                        )}
                      </div>
                      <div className="tests-cases">
                        {group.cases.map(({ caseItem, result }) => {
                          const caseKey = `${run.id}-${caseItem.id}`;
                          const isCaseExpanded = !!expandedCases[caseKey];
                          const duration = formatDuration(
                            result.startedAt,
                            result.finishedAt,
                          );
                          const tagInfo = formatTags(caseItem.tags);
                          const keys = getCaseKeys(result);

                          return (
                            <div className="tests-case" key={caseItem.id}>
                              <div className="tests-case-row">
                                <span className={`scale-badge scale-${caseItem.scale}`}>
                                  {caseItem.scale}
                                </span>
                                <span className="case-title">{caseItem.title}</span>
                                <span
                                  className={`status-badge status-${
                                    result.ok ? "success" : "failed"
                                  }`}
                                >
                                  {result.ok ? "ok" : "fail"}
                                </span>
                                <span className="case-tags">
                                  {tagInfo.tags.map((tag) => (
                                    <span key={tag} className="tag">
                                      {tag}
                                    </span>
                                  ))}
                                  {tagInfo.extra && (
                                    <span className="tag">{tagInfo.extra}</span>
                                  )}
                                </span>
                                <span className="case-duration">{duration}</span>
                                <button
                                  type="button"
                                  className="case-toggle"
                                  onClick={() => handleToggleCase(caseKey)}
                                >
                                  {isCaseExpanded ? "Collapse" : "Expand"}
                                </button>
                              </div>
                              {isCaseExpanded && (
                                <div className="tests-case-body">
                                  {result.error && (
                                    <div className="case-error">{result.error}</div>
                                  )}
                                  {keys.map((key) => {
                                    const entry = result.analysis?.[key as keyof typeof result.analysis];
                                    if (!entry) return null;
                                    const valueKey = `${caseKey}-${key}`;
                                    const isValueExpanded = !!expandedValues[valueKey];

                                    return (
                                      <div className="tests-case-key" key={key}>
                                        <div className="tests-case-key-header">
                                          <strong>{key}</strong>
                                          {entry.summary && <span>{entry.summary}</span>}
                                        </div>
                                        <div className="tests-case-key-body">
                                          <button
                                            type="button"
                                            className="toggle-full"
                                            onClick={() => handleToggleValue(valueKey)}
                                          >
                                            {isValueExpanded ? "Hide full" : "Show full"}
                                          </button>
                                          {isValueExpanded && (
                                            <pre>{entry.value}</pre>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
};

export default TestsPage;
