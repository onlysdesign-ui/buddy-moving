import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AnalysisCard from "../components/AnalysisCard";
import {
  DEFAULT_KEYS,
  KEY_TITLES,
  fetchAnalysis,
  runAnalysisAction,
  streamAnalysis,
  type AnalysisKey,
  type AnalysisResponse,
} from "../api/analyzeClient";

const STORAGE_KEYS = {
  task: "buddyMoving.task",
  context: "buddyMoving.context",
  contextUpdatedAt: "buddyMoving.contextUpdatedAt",
};

type AnalysisEntry = {
  summary: string;
  value: string;
  isExpanded: boolean;
  status: "idle" | "loading" | "done" | "error";
  error?: { message?: string; details?: string } | null;
  statusText?: string;
};

type ToastState = {
  message: string;
  type: "success" | "error";
} | null;

const initState = () =>
  DEFAULT_KEYS.reduce<Record<AnalysisKey, AnalysisEntry>>((acc, key) => {
    acc[key] = {
      summary: "",
      value: "",
      isExpanded: false,
      status: "idle",
      error: null,
      statusText: "",
    };
    return acc;
  }, {} as Record<AnalysisKey, AnalysisEntry>);

const formatContextTimestamp = (timestamp: string | null) => {
  if (!timestamp) return "";
  const date = new Date(Number(timestamp));
  if (Number.isNaN(date.valueOf())) return "";
  const datePart = date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
  });
  const timePart = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart}, ${timePart}`;
};

const AnalyzerPage = () => {
  const [task, setTask] = useState("");
  const [context, setContext] = useState("");
  const [contextOpen, setContextOpen] = useState(false);
  const [contextUpdatedAt, setContextUpdatedAt] = useState<string | null>(null);
  const [analysisState, setAnalysisState] = useState(initState);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [statusText, setStatusText] = useState("Analyzing…");
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimeout = useRef<number | null>(null);
  const activeController = useRef<AbortController | null>(null);
  const activeStreamId = useRef(0);

  const contextIndicator = useMemo(() => {
    if (!context.trim()) {
      return "+ Add context";
    }
    const formatted = formatContextTimestamp(contextUpdatedAt);
    return formatted ? `Context set - updated ${formatted}` : "Context set";
  }, [context, contextUpdatedAt]);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    if (toastTimeout.current) {
      window.clearTimeout(toastTimeout.current);
    }
    toastTimeout.current = window.setTimeout(() => {
      setToast(null);
    }, 2500);
  };

  const updateEntry = (
    key: AnalysisKey,
    updater: (entry: AnalysisEntry) => AnalysisEntry,
  ) => {
    setAnalysisState((prev) => ({
      ...prev,
      [key]: updater(prev[key]),
    }));
  };

  const resetCardsForLoading = () => {
    setAnalysisState(initState());
  };

  const updateProgress = (completed?: number, total?: number) => {
    if (typeof completed === "number" && typeof total === "number" && total > 0) {
      setStatusText(`Analyzing ${completed}/${total}`);
    } else {
      setStatusText("Analyzing…");
    }
  };

  const updateAnalysisKey = (
    key: AnalysisKey,
    summaryValue: string,
    valueValue: string,
  ) => {
    updateEntry(key, (entry) => ({
      ...entry,
      summary: summaryValue,
      value: valueValue,
      status: "done",
      error: null,
      statusText: "",
    }));
  };

  const setCardLoading = (
    key: AnalysisKey,
    isLoading: boolean,
    statusLabel = "Analyzing…",
  ) => {
    updateEntry(key, (entry) => ({
      ...entry,
      status: isLoading ? "loading" : entry.status,
      error: null,
      statusText: isLoading ? statusLabel : entry.statusText,
    }));
  };

  const setCardError = (key: AnalysisKey, message?: string, details?: string) => {
    updateEntry(key, (entry) => ({
      ...entry,
      status: "error",
      error: { message, details },
      statusText: "",
    }));
  };

  const applyAnalysisResponse = (data: AnalysisResponse) => {
    const analysis =
      data?.analysis && typeof data.analysis === "object" ? data.analysis : {};

    setAnalysisState(
      DEFAULT_KEYS.reduce<Record<AnalysisKey, AnalysisEntry>>((acc, key) => {
        const entry = analysis[key];
        const resolvedEntry: AnalysisEntry = {
          summary: "",
          value: "",
          isExpanded: false,
          status: "done",
          error: null,
          statusText: "",
        };
        if (typeof entry === "string") {
          resolvedEntry.value = entry;
        } else if (entry && typeof entry === "object") {
          resolvedEntry.summary = entry.summary ?? "";
          resolvedEntry.value = entry.value ?? entry.summary ?? "";
        }
        acc[key] = resolvedEntry;
        return acc;
      }, {} as Record<AnalysisKey, AnalysisEntry>),
    );
  };

  const getFullAnalysisMap = () =>
    Object.fromEntries(
      DEFAULT_KEYS.map((key) => {
        const entry = analysisState[key];
        return [key, entry.value || entry.summary || ""];
      }),
    );

  const analyzeTask = useCallback(async () => {
    const trimmedTask = task.trim();
    const trimmedContext = context.trim();

    if (!trimmedTask) {
      showToast("Please enter a task to analyze.", "error");
      return;
    }

    if (activeController.current) {
      activeController.current.abort();
    }

    const controller = new AbortController();
    const requestId = ++activeStreamId.current;
    activeController.current = controller;

    setIsAnalyzing(true);
    updateProgress();
    resetCardsForLoading();

    DEFAULT_KEYS.forEach((key) => {
      setCardLoading(key, true, "Analyzing…");
    });

    try {
      await streamAnalysis({
        task: trimmedTask,
        context: trimmedContext,
        signal: controller.signal,
        keys: DEFAULT_KEYS,
        onStatus: (payload) => {
          if (payload.status === "key-start" && payload.key) {
            setCardLoading(payload.key, true, "Analyzing…");
            return;
          }

          if (payload.status === "started") {
            const total =
              typeof payload.total === "number"
                ? payload.total
                : DEFAULT_KEYS.length;
            updateProgress(payload.completed ?? 0, total);
            return;
          }

          if (payload.status === "progress") {
            updateProgress(payload.completed, payload.total ?? DEFAULT_KEYS.length);
          }
        },
        onKey: (payload) => {
          const summaryValue = payload.summary ?? "";
          const valueValue = payload.value ?? payload.summary ?? "";
          updateAnalysisKey(payload.key, summaryValue, valueValue);
        },
        onError: (payload) => {
          if (payload.key) {
            setCardError(
              payload.key,
              payload.error || "Failed to generate.",
              payload.details,
            );
          } else if (payload.error) {
            showToast(payload.error, "error");
          }
        },
      });
      showToast("Analysis complete.");
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      if (
        error instanceof Error &&
        error.message.includes("Streaming is not supported")
      ) {
        try {
          const data = await fetchAnalysis({
            task: trimmedTask,
            context: trimmedContext,
            keys: DEFAULT_KEYS,
            signal: controller.signal,
          });
          applyAnalysisResponse(data);
          showToast("Analysis complete.");
          return;
        } catch (fallbackError) {
          const message =
            fallbackError instanceof Error
              ? fallbackError.message
              : "Analysis failed.";
          showToast(`Analysis failed. ${message}`, "error");
          return;
        }
      }
      const message =
        error instanceof Error ? error.message : "Analysis failed.";
      showToast(`Analysis failed. ${message}`, "error");
    } finally {
      if (activeStreamId.current === requestId) {
        activeController.current = null;
        setIsAnalyzing(false);
        updateProgress();
      }
    }
  }, [context, task]);

  const handleAction = async (action: "deeper" | "verify", key: AnalysisKey) => {
    const trimmedTask = task.trim();
    const trimmedContext = context.trim();

    if (!trimmedTask) {
      showToast("Please enter a task first.", "error");
      return;
    }

    setCardLoading(
      key,
      true,
      action === "deeper" ? "Deepening…" : "Rewriting…",
    );

    try {
      const data = await runAnalysisAction({
        task: trimmedTask,
        context: trimmedContext,
        key,
        value: analysisState[key].value || analysisState[key].summary,
        currentAnalysis: getFullAnalysisMap(),
        action,
      });

      if (!data || !data.value) {
        throw new Error("Unexpected response from API.");
      }

      updateAnalysisKey(
        key,
        data.summary ?? "",
        data.value ?? data.summary ?? "",
      );
      showToast(action === "deeper" ? "Deeper analysis ready." : "Updated.");
    } catch (error) {
      setCardLoading(key, false);
      const message =
        error instanceof Error ? error.message : "Action failed.";
      showToast(`Action failed. ${message}`, "error");
    }
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (error) {
      showToast("Copy failed. Please try again.", "error");
      return false;
    }
  };

  useEffect(() => {
    const savedTask = localStorage.getItem(STORAGE_KEYS.task);
    const savedContext = localStorage.getItem(STORAGE_KEYS.context);
    const savedContextUpdatedAt = localStorage.getItem(
      STORAGE_KEYS.contextUpdatedAt,
    );

    if (savedTask) {
      setTask(savedTask);
    }
    if (savedContext) {
      setContext(savedContext);
    }
    if (savedContext && !savedContextUpdatedAt) {
      const now = Date.now().toString();
      localStorage.setItem(STORAGE_KEYS.contextUpdatedAt, now);
      setContextUpdatedAt(now);
    } else if (savedContextUpdatedAt) {
      setContextUpdatedAt(savedContextUpdatedAt);
    }
    if (savedContext) {
      setContextOpen(true);
    }

    return () => {
      if (activeController.current) {
        activeController.current.abort();
      }
      if (toastTimeout.current) {
        window.clearTimeout(toastTimeout.current);
      }
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.task, task);
  }, [task]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.context, context);
    const updatedAt = Date.now().toString();
    localStorage.setItem(STORAGE_KEYS.contextUpdatedAt, updatedAt);
    setContextUpdatedAt(updatedAt);
  }, [context]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const isTextArea = target.tagName === "TEXTAREA";
      if (!isTextArea) return;
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        event.preventDefault();
        void analyzeTask();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [analyzeTask]);

  return (
    <section className="analysis-app">
      <div className="analysis-layout">
        <div className="analysis-left">
          <label className="analysis-field">
            <span>Task</span>
            <textarea
              id="task"
              rows={6}
              placeholder="Describe the moving task you need help with..."
              value={task}
              onChange={(event) => setTask(event.target.value)}
            />
          </label>

          <div
            className={`analysis-context-panel ${contextOpen ? "open" : ""}`}
          >
            <button
              className="analysis-context-indicator"
              type="button"
              onClick={() => setContextOpen((prev) => !prev)}
            >
              {contextIndicator}
            </button>
            <div className="analysis-context-body">
              <label className="analysis-field">
                <span>Context</span>
                <textarea
                  id="context"
                  rows={4}
                  placeholder="Add constraints, timeline, budget, or other context..."
                  value={context}
                  onChange={(event) => setContext(event.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="analysis-actions">
            <button
              type="button"
              className="analysis-primary"
              onClick={analyzeTask}
              disabled={isAnalyzing}
            >
              Analyze
            </button>
            <div className={`analysis-status ${isAnalyzing ? "active" : ""}`}>
              <span className="analysis-spinner" aria-hidden="true"></span>
              <span className="analysis-status-text">{statusText}</span>
            </div>
          </div>
        </div>

        <div className="analysis-right">
          <div className="analysis-results-list">
            {DEFAULT_KEYS.map((key) => {
              const entry = analysisState[key];
              return (
                <AnalysisCard
                  key={key}
                  title={KEY_TITLES[key]}
                  summary={entry.summary}
                  value={entry.value}
                  status={entry.status}
                  statusText={entry.statusText}
                  error={entry.error}
                  expanded={entry.isExpanded}
                  onToggle={() =>
                    updateEntry(key, (prev) => ({
                      ...prev,
                      isExpanded: !prev.isExpanded,
                    }))
                  }
                  onCopy={handleCopy}
                  onAction={(action) => handleAction(action, key)}
                />
              );
            })}
          </div>
        </div>
      </div>

      {toast ? (
        <div
          className={`analysis-toast ${toast.type === "error" ? "error" : ""}`}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      ) : null}
    </section>
  );
};

export default AnalyzerPage;
