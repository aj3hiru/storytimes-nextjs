"use client";

import { useCallback, useRef, useState } from "react";

export type LogState = "active" | "done" | "error" | "info";
export interface LogLine {
  id: number;
  text: string;
  state: LogState;
  at: string;
}

/** Progress bar + percent + live step log, shared by import, export, backup and restore. */
export function useProgressLog() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [percent, setPercent] = useState(0);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const seq = useRef(0);
  const now = () => new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata" });

  const settleActive = (list: LogLine[], to: LogState) => list.map((l) => (l.state === "active" ? { ...l, state: to } : l));

  const start = useCallback((text: string) => {
    seq.current = 0;
    setPercent(0);
    setStatus("running");
    setLines([{ id: ++seq.current, text, state: "active", at: now() }]);
  }, []);
  /** Finish the running step and begin a new one. */
  const step = useCallback((text: string) => {
    setLines((l) => [...settleActive(l, "done"), { id: ++seq.current, text, state: "active", at: now() }]);
  }, []);
  /** Change the running step's text (e.g. "Uploading… 40%"). */
  const update = useCallback((text: string) => {
    setLines((l) => {
      const i = l.findLastIndex((x) => x.state === "active");
      if (i < 0) return l;
      const copy = l.slice();
      copy[i] = { ...copy[i], text };
      return copy;
    });
  }, []);
  /** A finished line that doesn't stop the running step. */
  const note = useCallback((text: string, state: LogState = "done") => {
    setLines((l) => {
      const i = l.findLastIndex((x) => x.state === "active");
      const line = { id: ++seq.current, text, state, at: now() };
      if (i < 0) return [...l, line];
      return [...l.slice(0, i), line, ...l.slice(i)];
    });
  }, []);
  const finish = useCallback((text: string) => {
    setPercent(100);
    setStatus("done");
    setLines((l) => [...settleActive(l, "done"), { id: ++seq.current, text, state: "done", at: now() }]);
  }, []);
  const fail = useCallback((text: string) => {
    setStatus("error");
    setLines((l) => [...settleActive(l, "error"), { id: ++seq.current, text, state: "error", at: now() }]);
  }, []);
  const reset = useCallback(() => {
    setLines([]);
    setPercent(0);
    setStatus("idle");
  }, []);

  return { lines, percent, status, setPercent, start, step, update, note, finish, fail, reset };
}

export function ProgressLog({ title, lines, percent, status }: { title: string; lines: LogLine[]; percent: number; status: "idle" | "running" | "done" | "error" }) {
  if (status === "idle") return null;
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className={`pl-box ${status}`}>
      <div className="pl-head">
        <span className="pl-title">
          {status === "running" && <i className="fas fa-circle-notch fa-spin" />}
          {status === "done" && <i className="fas fa-circle-check" />}
          {status === "error" && <i className="fas fa-circle-xmark" />} {title}
        </span>
        <span className="pl-pct">{pct}%</span>
      </div>
      <div className="pl-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="pl-fill" style={{ width: `${pct}%` }} />
      </div>
      <ol className="pl-log" aria-live="polite">
        {lines.map((l) => (
          <li key={l.id} className={`pl-line ${l.state}`}>
            <span className="pl-ico">
              {l.state === "active" ? <i className="fas fa-spinner fa-spin" /> : l.state === "error" ? <i className="fas fa-xmark" /> : l.state === "info" ? <i className="fas fa-minus" /> : <i className="fas fa-check" />}
            </span>
            <span className="pl-text">{l.text}</span>
            <time className="pl-time">{l.at}</time>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function formatMB(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)} MB`;
}
