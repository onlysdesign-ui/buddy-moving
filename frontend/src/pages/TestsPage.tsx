import { useEffect, useMemo, useRef, useState } from "react";
import { getApiBase } from "../config/apiBase";
import { loadRuns, saveRuns } from "../tests/storage";
import { getTotalCases, testContexts } from "../tests/testCases";
import { runTestCase } from "../tests/runTests";
import type { CaseResult, TestRun } from "../tests/types";

const formatDateTime = (value?: string) => {
  if (!value) return "";
  return new Date(value).toLocaleString();
};

const formatDuration = (start?: string, end?: string) => {
  if (!start || !end) return "-";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const seconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remaining}s` : `${remaining}s`;
};

const exportCaseResult = (caseResult: CaseResult) => {
  const context = testContexts.find((item) => item.id === caseResult.contextId);
  const payload = {
    case: {
      id: caseResult.caseId,
      title: caseResult.title,
      scale: caseResult.scale,
    },
    context: context
      ? {
          id: context.id,
          title: context.title,
          context: context.context,
        }
      : null,
    tags: caseResult.tags ?? [],
    response: caseResult.analysis ?? {},
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${caseResult.caseId}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const TestsPage = () => {
  const totalCases = useMemo(() => getTotalCases(), []);
  const [runs, setRuns] = useState<TestRun[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: totalCases });
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [expandedCases, setExpandedCases] = useState<Set<string>>(new Set());
  const [expandedValues, setExpandedValues] = useState<Set<string>>(new Set());
  const cancelRequested = useRef(false);
  const activeController = useRef<AbortController | null>(null);

  useEffect(() => {
    const storedRuns = loadRuns();
    setRuns(storedRuns);
    if (storedRuns[0]) {
      setExpandedRuns(new Set([storedRuns[0].id]));
    }
  }, []);

  useEffect(() => {
    saveRuns(runs);
  }, [runs]);

  const toggleRun = (runId: string) => {
    setExpandedRuns((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  };

  const toggleCase = (caseId: string) => {
    setExpandedCases((prev) => {
      const next = new Set(prev);
      if (next.has(caseId)) {
        next.delete(caseId);
      } else {
        next.add(caseId);
      }
      return next;
    });
  };

  const toggleValue = (caseId: string, key: string) => {
    const id = `${caseId}:${key}`;
    setExpandedValues((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const updateRun = (runId: string, updater: (run: TestRun) => TestRun) => {
    setRuns((prev) => prev.map((run) => (run.id === runId ? updater(run) : run)));
  };

  const upsertCase = (run: TestRun, result: CaseResult) => {
    const existingIndex = run.cases.findIndex(
      (entry) => entry.caseId === result.caseId,
    );
    if (existingIndex === -1) {
      return { ...run, cases: [...run.cases, result] };
    }
    const nextCases = [...run.cases];
    nextCases[existingIndex] = result;
    return { ...run, cases: nextCases };
  };

  const startRun = async () => {
    if (isRunning) return;
    cancelRequested.current = false;
    setProgress({ completed: 0, total: totalCases });

    const runId = `run-${Date.now()}`;
    const startedAt = new Date().toISOString();
    const newRun: TestRun = {
      id: runId,
      startedAt,
      status: "running",
      totalCases,
      succeeded: 0,
      failed: 0,
      cancelled: false,
      cases: [],
    };

    setRuns((prev) => [newRun, ...prev]);
    setExpandedRuns(new Set([runId]));
    setIsRunning(true);

    let succeeded = 0;
    let failed = 0;
    let completed = 0;

    for (const context of testContexts) {
      for (const testCase of context.cases) {
        if (cancelRequested.current) {
          break;
        }
        const controller = new AbortController();
        activeController.current = controller;
        try {
          const result = await runTestCase({
            testCase,
            context,
            apiBase: getApiBase(),
            signal: controller.signal,
            onUpdate: (updated) => {
              updateRun(runId, (run) => upsertCase(run, updated));
            },
          });
          completed += 1;
          if (result.ok) {
            succeeded += 1;
          } else {
            failed += 1;
          }
          updateRun(runId, (run) => ({
            ...upsertCase(run, result),
            succeeded,
            failed,
          }));
          setProgress({ completed, total: totalCases });
        } catch (error) {
          completed += 1;
          failed += 1;
          const fallbackResult: CaseResult = {
            caseId: testCase.id,
            contextId: context.id,
            title: testCase.title,
            scale: testCase.scale,
            tags: testCase.tags,
            startedAt: new Date().toISOString(),
            finishedAt: new Date().toISOString(),
            ok: false,
            error: error instanceof Error ? error.message : "Request failed",
          };
          updateRun(runId, (run) => ({
            ...upsertCase(run, fallbackResult),
            succeeded,
            failed,
          }));
          setProgress({ completed, total: totalCases });
        }

        if (!cancelRequested.current) {
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
      }
      if (cancelRequested.current) {
        break;
      }
    }

    const finishedAt = new Date().toISOString();
    const executedCases = succeeded + failed;
    const cancelled = cancelRequested.current || executedCases < totalCases;
    const status = cancelled
      ? "partial"
      : failed > 0
        ? "failed"
        : "success";

    updateRun(runId, (run) => ({
      ...run,
      finishedAt,
      status,
      succeeded,
      failed,
      cancelled,
    }));

    setIsRunning(false);
    activeController.current = null;
  };

  const cancelRun = () => {
    cancelRequested.current = true;
    activeController.current?.abort();
  };

  const renderCase = (caseResult: CaseResult) => {
    const expanded = expandedCases.has(caseResult.caseId);
    const duration = formatDuration(caseResult.startedAt, caseResult.finishedAt);
    const tags = caseResult.tags || [];
    const visibleTags = tags.slice(0, 3);
    const remainingTags = tags.length - visibleTags.length;

    return (
      <div className="case-row" key={caseResult.caseId}>
        <div className="case-header">
          <span className={`badge scale-${caseResult.scale}`}>
            {caseResult.scale}
          </span>
          <span className="case-title">{caseResult.title}</span>
          <span className={`badge ${caseResult.ok ? "ok" : "fail"}`}>
            {caseResult.ok ? "ok" : "fail"}
          </span>
          <button
            className="button secondary"
            onClick={() => toggleCase(caseResult.caseId)}
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
          {caseResult.ok && (
            <button
              className="button secondary"
              onClick={() => exportCaseResult(caseResult)}
            >
              Export JSON
            </button>
          )}
        </div>
        <div className="case-meta">
          <span>Duration: {duration}</span>
          {caseResult.language && <span>Language: {caseResult.language}</span>}
          {caseResult.error && <span>Error: {caseResult.error}</span>}
        </div>
        <div className="case-meta">
          {visibleTags.map((tag) => (
            <span className="badge" key={tag}>
              {tag}
            </span>
          ))}
          {remainingTags > 0 && <span>+{remainingTags}</span>}
        </div>
        {expanded && (
          <div className="case-details">
            {caseResult.analysis &&
              Object.entries(caseResult.analysis).map(([key, value]) => {
                if (!value) return null;
                const valueId = `${caseResult.caseId}:${key}`;
                const isValueExpanded = expandedValues.has(valueId);
                return (
                  <div className="key-block" key={key}>
                    <div className="key-title">{key}</div>
                    <pre className="key-summary pre-text">{value.summary}</pre>
                    <div className="inline-actions">
                      <button
                        className="button secondary"
                        onClick={() => toggleValue(caseResult.caseId, key)}
                      >
                        {isValueExpanded ? "Hide full" : "Show full"}
                      </button>
                    </div>
                    {isValueExpanded && (
                      <pre className="key-value">{value.value}</pre>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>
    );
  };

  return (
    <section>
      <div className="card">
        <h1 className="section-title">Regression tests</h1>
        <div className="inline-actions">
          <button className="button" onClick={startRun} disabled={isRunning}>
            Прогнать тесты
          </button>
          {isRunning && (
            <button className="button secondary" onClick={cancelRun}>
              Cancel
            </button>
          )}
          {isRunning && (
            <span className="text-muted">
              Running... {progress.completed}/{progress.total}
            </span>
          )}
        </div>
      </div>

      <div className="run-list">
        {runs.length === 0 && (
          <div className="card text-muted">No runs yet.</div>
        )}
        {runs.map((run) => {
          const isExpanded = expandedRuns.has(run.id);
          const statusLabel = run.status;
          const duration = formatDuration(run.startedAt, run.finishedAt);
          return (
            <div
              className={`run-row ${isExpanded ? "" : "collapsed"}`}
              key={run.id}
              onClick={() => (!isExpanded ? toggleRun(run.id) : undefined)}
            >
              <div className="run-header">
                <span>{formatDateTime(run.startedAt)}</span>
                <span className="badge">{statusLabel}</span>
              </div>
              <div className="run-meta">
                <span>Succeeded: {run.succeeded}</span>
                <span>Failed: {run.failed}</span>
                <span>Duration: {duration}</span>
              </div>
              {isExpanded && (
                <div>
                  <button
                    className="button secondary"
                    onClick={() => toggleRun(run.id)}
                  >
                    Collapse
                  </button>
                  {testContexts.map((context) => {
                    const contextCases = run.cases.filter(
                      (item) => item.contextId === context.id,
                    );
                    if (contextCases.length === 0) return null;
                    return (
                      <div className="context-section" key={context.id}>
                        <h3>{context.title}</h3>
                        <pre className="text-muted pre-text">
                          {context.context}
                        </pre>
                        {contextCases.map((caseResult) => renderCase(caseResult))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default TestsPage;
