"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clearActivityLogs } from "@/lib/activityLogAdmin";
import { useAdminDialogs } from "./AdminDialogProvider";

/**
 * Filter bar + log-clearing controls for Activity Logs. Neither existed
 * before — the page rendered an unfiltered, unbounded list with no way to
 * narrow it down or prune it, which becomes unusable fast on a busy site.
 * Filtering is done through the URL (searchParams) rather than client
 * state so a filtered view is linkable, survives refresh, and works with
 * the existing server-side pagination instead of fighting it.
 */
export function ActivityLogFilters({
  actionTypes,
  users,
  current,
}: {
  actionTypes: string[];
  users: { id: number; username: string }[];
  current: { action?: string; userId?: string; q?: string };
}) {
  const router = useRouter();
  const { confirm, notice } = useAdminDialogs();
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useState(current.q ?? "");
  const [action, setAction] = useState(current.action ?? "");
  const [userId, setUserId] = useState(current.userId ?? "");

  function apply(next?: { action?: string; userId?: string; q?: string }) {
    const params = new URLSearchParams();
    const a = next?.action ?? action;
    const u = next?.userId ?? userId;
    const s = next?.q ?? q;
    if (a) params.set("action", a);
    if (u) params.set("userId", u);
    if (s.trim()) params.set("q", s.trim());
    router.push(`/admin/activity-logs${params.toString() ? `?${params}` : ""}`);
  }

  function reset() {
    setQ("");
    setAction("");
    setUserId("");
    router.push("/admin/activity-logs");
  }

  async function handleClear(days: number, label: string) {
    if (!(await confirm(`${label} This cannot be undone.`, { title: "Clear Activity Logs", confirmText: "Clear" }))) return;
    startTransition(async () => {
      try {
        const { deleted } = await clearActivityLogs(days);
        notice(`Cleared ${deleted} log entr${deleted === 1 ? "y" : "ies"}.`, { type: "success" });
        router.refresh();
      } catch (err) {
        notice(err instanceof Error ? err.message : "Failed to clear logs.", { type: "error" });
      }
    });
  }

  return (
    <div className="card alf-bar">
      <div className="alf-row">
        <div className="alf-field">
          <label>Search</label>
          <input
            className="form-control"
            placeholder="Description or IP…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && apply()}
          />
        </div>
        <div className="alf-field">
          <label>Action</label>
          <select className="form-control" value={action} onChange={(e) => { setAction(e.target.value); apply({ action: e.target.value }); }}>
            <option value="">All actions</option>
            {actionTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="alf-field">
          <label>User</label>
          <select className="form-control" value={userId} onChange={(e) => { setUserId(e.target.value); apply({ userId: e.target.value }); }}>
            <option value="">All users</option>
            {users.map((u) => (
              <option key={u.id} value={String(u.id)}>{u.username}</option>
            ))}
          </select>
        </div>
        <div className="alf-actions">
          <button type="button" className="btn btn-primary" onClick={() => apply()}>
            <i className="fas fa-filter" /> Filter
          </button>
          <button type="button" className="btn btn-secondary" onClick={reset} title="Reset filters">
            <i className="fas fa-xmark" />
          </button>
        </div>
      </div>

      <div className="alf-clear">
        <span className="alf-clear-label">Clear logs:</span>
        <button type="button" className="btn btn-secondary btn-sm" disabled={isPending} onClick={() => handleClear(90, "Delete logs older than 90 days?")}>Older than 90 days</button>
        <button type="button" className="btn btn-secondary btn-sm" disabled={isPending} onClick={() => handleClear(30, "Delete logs older than 30 days?")}>Older than 30 days</button>
        <button type="button" className="btn btn-danger btn-sm" disabled={isPending} onClick={() => handleClear(0, "Delete ALL activity logs?")}>Clear all</button>
      </div>
    </div>
  );
}
