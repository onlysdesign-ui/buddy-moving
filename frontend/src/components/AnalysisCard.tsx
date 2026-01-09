import { useState } from "react";

type AnalysisError = {
  message?: string;
  details?: string;
};

type AnalysisCardProps = {
  title: string;
  summary: string;
  value: string;
  status: "idle" | "loading" | "done" | "error";
  statusText?: string;
  error?: AnalysisError | null;
  expanded: boolean;
  onToggle: () => void;
  onCopy: (text: string) => Promise<boolean>;
  onAction: (action: "deeper" | "verify") => void;
};

const AnalysisCard = ({
  title,
  summary,
  value,
  status,
  statusText,
  error,
  expanded,
  onToggle,
  onCopy,
  onAction,
}: AnalysisCardProps) => {
  const [copied, setCopied] = useState(false);
  const showToggle = summary.trim().length > 0 && summary.trim() !== value.trim();
  const showSummary = !expanded && summary.trim().length > 0;
  const displayed = expanded ? value || summary : summary || value;
  const contentText =
    displayed || (status === "loading" ? "Analyzing..." : "No details yet.");

  const handleCopy = async () => {
    const ok = await onCopy(displayed || contentText);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1000);
    }
  };

  return (
    <div
      className={`analysis-card ${status === "loading" ? "loading" : ""} ${
        status === "error" ? "error" : ""
      } ${status === "loading" ? "skeleton" : ""}`}
    >
      <div className="analysis-card-head">
        <h3>{title}</h3>
        <div className="analysis-card-actions">
          <button
            className="analysis-card-btn"
            data-action="toggle"
            onClick={onToggle}
            aria-expanded={expanded}
            hidden={!showToggle}
            type="button"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
          <button
            className="analysis-card-btn"
            data-action="deeper"
            onClick={() => onAction("deeper")}
            type="button"
          >
            Deeper
          </button>
          <button
            className="analysis-card-btn icon-only"
            data-action="verify"
            onClick={() => onAction("verify")}
            aria-label="Verify realism"
            title="Verify realism"
            type="button"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M9 16.2l-3.5-3.5L4 14.2 9 19l11-11-1.5-1.5z" />
            </svg>
          </button>
          <button
            className={`analysis-card-btn icon-only ${copied ? "copied" : ""}`}
            data-action="copy"
            onClick={handleCopy}
            aria-label={copied ? "Copied" : "Copy"}
            title={copied ? "Copied" : "Copy"}
            type="button"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M16 1H6c-1.1 0-2 .9-2 2v12h2V3h10V1zm3 4H10c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h9c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H10V7h9v14z" />
            </svg>
          </button>
        </div>
      </div>
      <div className="analysis-card-body">
        {status === "error" && error ? (
          <div className="analysis-card-content">
            <div className="analysis-card-error-message">
              {error.message || "Failed to generate."}
            </div>
            {error.details ? (
              <details className="analysis-card-error-details">
                <summary>Details</summary>
                <pre>{error.details}</pre>
              </details>
            ) : null}
          </div>
        ) : (
          <pre
            className={`analysis-card-content ${showSummary ? "is-summary" : ""}`}
          >
            {contentText}
          </pre>
        )}
        <div className="analysis-card-skeleton" aria-hidden="true">
          <span className="analysis-skeleton-line line-xl"></span>
          <span className="analysis-skeleton-line line-lg"></span>
          <span className="analysis-skeleton-line line-md"></span>
          <span className="analysis-skeleton-line line-lg"></span>
          <span className="analysis-skeleton-line line-sm"></span>
        </div>
      </div>
      <div className="analysis-card-status" aria-live="polite">
        {status === "loading" ? statusText || "Analyzing…" : ""}
      </div>
    </div>
  );
};

export default AnalysisCard;
