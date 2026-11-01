import React, { useEffect, useRef } from "react";
import { X, ArrowUpRight, FlaskConical, Info } from "lucide-react";
import type { Result, Report } from "../model";
import { outcome, date, title } from "../model";
export function Status({ decision }: { decision: string }) {
  const labels: Record<string, string> = {
    approve: "Allowed",
    block: "Blocked",
    require_approval: "Review",
    error: "Error",
  };
  return (
    <span className={`status ${decision}`}>
      <i />
      {labels[decision] || decision}
    </span>
  );
}
export function Empty({
  title: heading,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <FlaskConical size={23} />
      </span>
      <h3>{heading}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="notice">
      <Info size={16} />
      <span>{children}</span>
    </div>
  );
}
export function JsonPanel({
  value,
  label = "Technical details",
}: {
  value: unknown;
  label?: string;
}) {
  return (
    <details className="json-panel">
      <summary>{label}</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}
export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const body = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const node = ref.current;
    node?.querySelector<HTMLElement>("button,input,select")?.focus();
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && node) {
        const els = Array.from(
          node.querySelectorAll<HTMLElement>(
            'button:not(:disabled),a,input,select,textarea,summary,[tabindex="0"]',
          ),
        );
        const first = els[0],
          last = els.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = body;
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <div className="dialog-head">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function ActivityList({
  reports,
  onInspect,
  limit = 8,
}: {
  reports: Report[];
  onInspect: (r: Report) => void;
  limit?: number;
}) {
  const rows = reports
    .flatMap((report) =>
      report.results.results.map((result, index) => ({
        report,
        result,
        index,
      })),
    )
    .slice(0, limit);
  return (
    <div className="activity-list">
      {rows.length ? (
        <>
          <div className="activity-row list-head">
            <span>Attack / test</span>
            <span>Target guard</span>
            <span>Timestamp</span>
            <span>Result</span>
          </div>
          {rows.map(({ report, result, index }) => (
            <button
              className="activity-row"
              key={`${report.id}-${index}`}
              onClick={() => onInspect(report)}
            >
              <span className="activity-name">
                <span
                  className={`activity-symbol ${result.passed ? "passed" : "failed"}`}
                >
                  <FlaskConical size={16} />
                </span>
                <span>
                  {title(result.category)}
                  <small>
                    <span className="mobile-guard">{report.guard.name} · </span>
                    {result.passed
                      ? "Expected response"
                      : result.actual === "error"
                        ? "Execution error"
                        : "Unexpected response"}{" "}
                    · mock test
                  </small>
                </span>
              </span>
              <span className="guard-name">{report.guard.name}</span>
              <time>{date(report.createdAt)}</time>
              <span className="activity-result">
                <Status decision={result.actual} />
                <small
                  className={result.passed ? "text-success" : "text-danger"}
                >
                  {result.passed ? "Test passed" : "Test failed"}
                </small>
              </span>
            </button>
          ))}
        </>
      ) : (
        <Empty title="No test activity yet">
          Run a controlled assessment to see real results here.
        </Empty>
      )}
    </div>
  );
}
export function ReportDetails({ report }: { report: Report }) {
  return (
    <>
      <div className="report-summary">
        <div>
          <span className="muted">Security score</span>
          <strong>
            {report.score}
            <small>/100</small>
          </strong>
        </div>
        <div>
          <span>False positives</span>
          <strong>{report.results.falsePositives}</strong>
        </div>
        <div>
          <span>False negatives</span>
          <strong>{report.results.falseNegatives}</strong>
        </div>
      </div>
      <p className="muted">
        Mock suite {report.results.suiteVersion} · {date(report.createdAt)} · A
        blocked malicious request is a successful defense.
      </p>
      <div className="result-list">
        {report.results.results.map((r: Result, i) => (
          <div className="result-row" key={i}>
            <div>
              <strong>{title(r.category)}</strong>
              <p>{r.reason || "No explanation returned"}</p>
            </div>
            <div>
              <Status decision={r.actual} />
              <small className={r.passed ? "text-success" : "text-danger"}>
                {r.passed ? "Test passed" : "Test failed"} · expected{" "}
                {outcome({ ...r, actual: r.expected })}
              </small>
            </div>
          </div>
        ))}
      </div>
      <div className="actions">
        <a className="button" href={`/api/reports/${report.id}/export`}>
          Export JSON <ArrowUpRight size={14} />
        </a>
        <a
          className="button primary"
          href={`/api/reports/${report.id}/export?format=pdf`}
        >
          Download PDF <ArrowUpRight size={14} />
        </a>
      </div>
      <JsonPanel value={report} label="Full assessment data" />
    </>
  );
}
