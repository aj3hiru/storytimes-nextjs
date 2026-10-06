"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runCronNow, setCronEnabled, setLogRetention } from "@/lib/cronAdmin";
import { CronCopyBlock } from "./CronCopyBlock";

interface TaskResult {
  task: string;
  ok: boolean;
  detail: string;
}
interface JobRun {
  job: "minute" | "daily";
  at: string;
  ms: number;
  trigger: "auto" | "manual" | "external";
  ok: boolean;
  tasks: TaskResult[];
}
interface Status {
  history: JobRun[];
  last: { minute: JobRun | null; daily: JobRun | null };
  enabled: { minute: boolean; daily: boolean };
  logRetentionDays: number;
  schedulerBeat: string | null;
  scheduledPosts: number;
}

const JOBS = [
  {
    key: "minute" as const,
    name: "Every-minute jobs",
    icon: "fa-bolt",
    schedule: "Every minute",
    cron: "* * * * *",
    tasks: ["Publish scheduled posts", "Release held traffic (20 min hold)", "Cache auto-clear (Cache Manager)"],
  },
  {
    key: "daily" as const,
    name: "Daily maintenance",
    icon: "fa-broom",
    schedule: "Once a day, after 3:00 AM IST",
    cron: "30 21 * * *",
    tasks: ["Remove expired logins", "Visitor log cleanup (only if a retention period is set)"],
  },
];

function ago(iso: string | null | undefined): string {
  if (!iso) return "Never";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleString();
}

const TRIGGER: Record<JobRun["trigger"], string> = { auto: "Automatic", manual: "Run now", external: "Crontab" };

export function CronManagerClient({ status, base }: { status: Status; base: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyJob, setBusyJob] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [now, setNow] = useState(0);

  // Keep "x min ago" fresh and pick up runs made by the scheduler.
  // Times are formatted only in the browser (server time zone differs).
  useEffect(() => setNow(Date.now()), []);
  useEffect(() => {
    const t = setInterval(() => {
      setNow(Date.now());
      router.refresh();
    }, 30_000);
    return () => clearInterval(t);
  }, [router]);

  const mounted = now > 0;
  const when = (iso: string | null | undefined) => (mounted ? ago(iso) : "…");
  const stamp = (iso: string) => (mounted ? new Date(iso).toLocaleString() : "…");
  const beatAge = status.schedulerBeat ? (mounted ? now : Date.parse(status.schedulerBeat)) - Date.parse(status.schedulerBeat) : Infinity;
  const schedulerOk = beatAge < 3 * 60_000;

  const run = (job: "minute" | "daily") => {
    setBusyJob(job);
    setMessage(null);
    start(async () => {
      try {
        const r = await runCronNow(job);
        if (r.busy || !r.run) setMessage({ ok: false, text: "That job is running right now — try again in a moment." });
        else setMessage({ ok: r.run.ok, text: r.run.tasks.map((t) => `${t.task}: ${t.detail}`).join(" · ") });
      } catch (e) {
        setMessage({ ok: false, text: e instanceof Error ? e.message : "Could not run the job." });
      } finally {
        setBusyJob(null);
        router.refresh();
      }
    });
  };

  const toggle = (job: "minute" | "daily", on: boolean) => start(async () => {
    await setCronEnabled(job, on);
    router.refresh();
  });

  const crontab = JOBS.map((j) => `${j.cron} curl -fsS -H "Authorization: Bearer $CRON_SECRET" ${base}/api/cron/${j.key} > /dev/null 2>&1`).join("\n");

  return (
    <div className="cm-wrap">
      <div className={`cm-banner ${schedulerOk ? "ok" : "warn"}`}>
        <span className="cm-banner-icon">
          <i className={`fas ${schedulerOk ? "fa-circle-check" : "fa-triangle-exclamation"}`} />
        </span>
        <div>
          <div className="cm-banner-title">{schedulerOk ? "Scheduler is running" : "Scheduler has not checked in yet"}</div>
          <div className="cm-banner-sub">
            {schedulerOk
              ? `Built into the server — no crontab needed. Last heartbeat ${when(status.schedulerBeat)}.`
              : status.schedulerBeat
                ? `Last heartbeat ${when(status.schedulerBeat)}. It starts 30 seconds after the server starts; if this stays, restart the app.`
                : "It starts 30 seconds after the server (re)starts. Jobs can still be run by hand below."}
          </div>
        </div>
        <div className="cm-banner-stat">
          <strong>{status.scheduledPosts}</strong>
          <span>scheduled post{status.scheduledPosts === 1 ? "" : "s"}</span>
        </div>
      </div>

      {message && (
        <div className={`ps-alert ${message.ok ? "success" : "warning"}`} style={{ marginBottom: "1rem" }}>
          <i className={`fas ${message.ok ? "fa-check-circle" : "fa-circle-exclamation"}`} /> {message.text}
        </div>
      )}

      <div className="cm-grid">
        {JOBS.map((j) => {
          const last = status.last[j.key];
          const on = status.enabled[j.key];
          return (
            <section className="cm-card" key={j.key}>
              <div className="cm-card-head">
                <span className={`cm-icon ${!on ? "off" : last && !last.ok ? "bad" : "ok"}`}>
                  <i className={`fas ${j.icon}`} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="cm-name">{j.name}</div>
                  <div className="cm-sub">{j.schedule}</div>
                </div>
                <label className="ps-sw" title={on ? "Turn off" : "Turn on"}>
                  <input type="checkbox" checked={on} disabled={pending} onChange={(e) => toggle(j.key, e.target.checked)} />
                  <span className="ps-sl" />
                </label>
              </div>
              <ul className="cm-tasks">
                {j.tasks.map((t, i) => {
                  const res = last?.tasks[i];
                  return (
                    <li key={t}>
                      <i className={`fas ${res ? (res.ok ? "fa-check" : "fa-xmark") : "fa-minus"} ${res ? (res.ok ? "ok" : "bad") : ""}`} />
                      <span className="cm-task">{t}</span>
                      {res && <span className="cm-task-res">{res.detail}</span>}
                    </li>
                  );
                })}
              </ul>
              <div className="cm-foot">
                <span className="cm-last">
                  Last run: <strong>{when(last?.at)}</strong>
                  {last && ` · ${last.ms} ms · ${TRIGGER[last.trigger]}`}
                </span>
                <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => run(j.key)}>
                  <i className={`fas ${busyJob === j.key ? "fa-spinner fa-spin" : "fa-play"}`} /> Run now
                </button>
              </div>
              {!on && <div className="cm-off-note">Switched off — only &quot;Run now&quot; runs it.</div>}
            </section>
          );
        })}
      </div>

      <section className="cm-card" style={{ marginBottom: "1.25rem" }}>
        <div className="cm-card-head">
          <span className="cm-icon ok" style={{ background: "#fef3c7", color: "#d97706" }}>
            <i className="fas fa-database" />
          </span>
          <div style={{ flex: 1 }}>
            <div className="cm-name">Visitor log retention</div>
            <div className="cm-sub">Raw per-visit rows used for unique-visitor counts. View totals are kept either way.</div>
          </div>
          <select
            className="ps-dur-select"
            value={status.logRetentionDays}
            disabled={pending}
            onChange={(e) => start(async () => {
              await setLogRetention(parseInt(e.target.value, 10));
              router.refresh();
            })}
          >
            <option value={0}>Keep forever</option>
            <option value={365}>1 year</option>
            <option value={180}>6 months</option>
            <option value={90}>90 days</option>
            <option value={30}>30 days</option>
          </select>
        </div>
      </section>

      <section className="cm-card" style={{ marginBottom: "1.25rem" }}>
        <div className="cm-card-head">
          <span className="cm-icon ok" style={{ background: "#e0e7ff", color: "#4f46e5" }}>
            <i className="fas fa-clock-rotate-left" />
          </span>
          <div style={{ flex: 1 }}>
            <div className="cm-name">Recent runs</div>
            <div className="cm-sub">Runs that did something, plus every manual and daily run (last 30)</div>
          </div>
        </div>
        {status.history.length === 0 ? (
          <div className="cm-empty">No runs recorded yet.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="cm-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Job</th>
                  <th>Trigger</th>
                  <th>Result</th>
                  <th style={{ textAlign: "right" }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {status.history.map((h, i) => (
                  <tr key={h.at + h.job + i}>
                    <td style={{ whiteSpace: "nowrap" }}>{stamp(h.at)}</td>
                    <td>{h.job === "minute" ? "Every minute" : "Daily"}</td>
                    <td>{TRIGGER[h.trigger]}</td>
                    <td>
                      <span className={`cm-pill ${h.ok ? "ok" : "bad"}`}>{h.ok ? "OK" : "Error"}</span>{" "}
                      <span className="cm-detail">{h.tasks.filter((t) => !t.ok || !/^(Nothing|Not due|Kept)/.test(t.detail)).map((t) => `${t.task}: ${t.detail}`).join(" · ") || "Nothing to do"}</span>
                    </td>
                    <td style={{ textAlign: "right" }}>{h.ms} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <details className="cm-card cm-advanced">
        <summary>
          <i className="fas fa-terminal" /> Advanced: external crontab (optional)
        </summary>
        <div style={{ padding: "0 1.25rem 1.25rem" }}>
          <p className="cron-hint">
            Not needed — the built-in scheduler already runs these. Use this only if you set <code>DISABLE_BUILTIN_CRON=1</code> and{" "}
            <code>CRON_SECRET</code> in the server&apos;s <code>.env</code>.
          </p>
          <CronCopyBlock text={crontab} />
        </div>
      </details>
    </div>
  );
}
