"use client";

import { useState } from "react";
import { auditViewCounts, repairViewCounts } from "@/lib/viewCountAudit";
import type { ViewCountAuditResult } from "@/lib/adminTypes";
import { useAdminDialogs } from "./AdminDialogProvider";

/**
 * Verify & Repair View Counts — see lib/viewCountAudit.ts for the full
 * reasoning on why this exists and how it differs from the reference
 * PHP's "flush pending views" button (which solved a buffering problem
 * this port doesn't have).
 *
 * Deliberately two separate steps: running the check changes nothing, so
 * it's always safe to press. Repair only becomes available once there's
 * a concrete, visible result to act on — no blind "fix everything"
 * button that acts on numbers nobody has seen.
 */
export function ViewCountAuditPanel() {
  const { notice, confirm } = useAdminDialogs();
  const [result, setResult] = useState<ViewCountAuditResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [repairing, setRepairing] = useState(false);

  async function handleCheck() {
    setChecking(true);
    try {
      setResult(await auditViewCounts());
    } catch (err) {
      notice(err instanceof Error ? err.message : "Check failed.", { type: "error" });
    } finally {
      setChecking(false);
    }
  }

  async function handleRepair() {
    if (!result) return;
    const positive = result.driftedPosts.filter((d) => d.drift > 0);
    const totalMissing = positive.reduce((s, d) => s + d.drift, 0);
    const ok = await confirm(
      `Add ${totalMissing.toLocaleString()} missing view(s) across ${positive.length} post(s) into today's daily stats? ` +
        `Their original date, source and country can't be recovered, so they'll be recorded as today / direct / unknown-country. This can't be undone.`,
      { title: "Repair View Counts", confirmText: "Repair" }
    );
    if (!ok) return;

    setRepairing(true);
    try {
      const r = await repairViewCounts();
      notice(
        `Repaired ${r.repairedPosts} post(s), recovering ${r.viewsRecovered.toLocaleString()} view(s).` +
          (r.skippedNegative > 0 ? ` ${r.skippedNegative} post(s) with negative drift were left alone — see the table.` : ""),
        { type: "success" }
      );
      setResult(await auditViewCounts());
    } catch (err) {
      notice(err instanceof Error ? err.message : "Repair failed.", { type: "error" });
    } finally {
      setRepairing(false);
    }
  }

  const positiveDrift = result?.driftedPosts.filter((d) => d.drift > 0) ?? [];

  return (
    <div className="card" style={{ padding: "1.25rem" }}>
      <div className="form-section-title" style={{ marginBottom: "0.25rem" }}>
        <i className="fas fa-clipboard-check" /> Verify &amp; Repair View Counts
      </div>
      <p style={{ fontSize: "0.8125rem", color: "var(--gray-500)", margin: "0 0 1rem", lineHeight: 1.6 }}>
        Every tracked view writes a lifetime total and a daily stats row. If one of those writes fails
        mid-request, the two disagree silently. This compares them and can top up whatever the daily
        stats are missing. Checking changes nothing.
      </p>

      <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary" onClick={handleCheck} disabled={checking || repairing}>
          <i className="fas fa-magnifying-glass" /> {checking ? "Checking…" : "Run Check"}
        </button>
        {positiveDrift.length > 0 && (
          <button type="button" className="btn btn-secondary" onClick={handleRepair} disabled={repairing || checking}>
            <i className="fas fa-wrench" /> {repairing ? "Repairing…" : `Repair ${positiveDrift.length} post(s)`}
          </button>
        )}
      </div>

      {result && (
        <div style={{ marginTop: "1rem" }}>
          <div className="vca-summary">
            <span><strong>{result.postsChecked}</strong> posts checked</span>
            <span>Lifetime total: <strong>{result.totalLifetime.toLocaleString()}</strong></span>
            <span>Daily stats sum: <strong>{result.totalDaily.toLocaleString()}</strong></span>
          </div>

          {result.driftedPosts.length === 0 ? (
            <div className="alert alert-success" style={{ marginTop: "0.85rem" }}>
              <i className="fas fa-circle-check" />
              <span>No drift found — every post&apos;s lifetime total matches its daily stats exactly.</span>
            </div>
          ) : (
            <div className="table-wrap" style={{ marginTop: "0.85rem" }}>
              <table>
                <thead>
                  <tr>
                    <th>Post</th>
                    <th>Lifetime</th>
                    <th>Daily sum</th>
                    <th>Drift</th>
                  </tr>
                </thead>
                <tbody>
                  {result.driftedPosts.map((d) => (
                    <tr key={d.postId}>
                      <td>{d.title}</td>
                      <td>{d.lifetimeTotal.toLocaleString()}</td>
                      <td>{d.dailySum.toLocaleString()}</td>
                      <td style={{ fontWeight: 700, color: d.drift > 0 ? "var(--warning)" : "var(--danger)" }}>
                        {d.drift > 0 ? `+${d.drift}` : d.drift}
                        {d.drift < 0 && <small style={{ display: "block", fontWeight: 400 }}>not auto-repaired</small>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
