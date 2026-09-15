"use client";

import { useState } from "react";
import { scanImportAction, commitImportAction } from "@/lib/postExportImportActions";
import type { ScanResult, ImportDecision } from "@/lib/postExportImport";
import { useAdminDialogs } from "./AdminDialogProvider";

type CommitResult = { imported: number; replaced: number; renamed: number; skipped: number; type: string };

/**
 * ZIP import with conflict resolution — replaces the old CSV bulk
 * importer with a straight port of admin/import-export.php's Import
 * flow: upload a posts_export/pages_export ZIP (from the Export panel,
 * this site or another StoryTimes site), scan it for slug conflicts
 * against what's already here, let the admin choose skip/replace/keep-both
 * per conflicting item, then commit.
 */
export function BulkImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [decisions, setDecisions] = useState<Record<string, ImportDecision>>({});
  const [result, setResult] = useState<CommitResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm } = useAdminDialogs();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setScan(null);
    setResult(null);
    setError(null);
    setDecisions({});
  }

  async function handleScan() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("importFile", file);
      const s = await scanImportAction(fd);
      setScan(s);
      const initial: Record<string, ImportDecision> = {};
      for (const c of s.conflicts) initial[c.slug] = "keep_both";
      setDecisions(initial);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read ZIP file.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    if (!file || !scan) return;
    const label = scan.type === "posts_export" ? "posts" : "pages";
    if (!(await confirm(`Import this ${label} archive? This cannot be undone in bulk.`))) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("importFile", file);
      fd.set("decisions", JSON.stringify(decisions));
      const r = await commitImportAction(fd);
      setResult(r);
      setScan(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ padding: "1.5rem" }}>
      <h3 style={{ marginBottom: "0.5rem" }}>Import Content (ZIP)</h3>
      <p style={{ color: "var(--gray-600)", fontSize: "0.875rem", marginBottom: "1rem" }}>
        Upload a <code>posts_export_*.zip</code> or <code>pages_export_*.zip</code> file created by the
        Export panel below (this site or another StoryTimes site). Media referenced inside is
        re-uploaded automatically, and categories/tags/authors are matched by name or created if
        missing.
      </p>

      <input type="file" accept=".zip,application/zip" onChange={handleFile} className="form-control" style={{ marginBottom: "1rem" }} />

      {file && !scan && !result && (
        <button type="button" className="btn btn-primary" onClick={handleScan} disabled={loading}>
          {loading ? "Reading…" : `Check "${file.name}"`}
        </button>
      )}

      {error && (
        <div className="alert alert-error" style={{ marginTop: "1rem" }}>
          <i className="fas fa-exclamation-circle" /> {error}
        </div>
      )}

      {scan && (
        <div style={{ marginTop: "1rem" }}>
          <div className="alert alert-info">
            Detected a <strong>{scan.type === "posts_export" ? "Posts" : "Pages"}</strong> export.{" "}
            {scan.conflicts.length === 0
              ? "No slug conflicts — everything will be imported as new."
              : `${scan.conflicts.length} item(s) already exist on this site — choose what to do with each.`}
          </div>

          {scan.conflicts.length > 0 && (
            <div className="table-wrap" style={{ marginTop: "1rem", maxHeight: 400, overflowY: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Incoming</th>
                    <th>Existing</th>
                    <th>Decision</th>
                  </tr>
                </thead>
                <tbody>
                  {scan.conflicts.map((c) => (
                    <tr key={c.slug}>
                      <td>
                        {c.title}
                        <div style={{ fontSize: "0.75rem", color: "var(--gray-500)" }}>{c.slug}</div>
                      </td>
                      <td>{c.existingTitle}</td>
                      <td>
                        <select
                          className="form-control"
                          value={decisions[c.slug] ?? "keep_both"}
                          onChange={(e) =>
                            setDecisions((d) => ({ ...d, [c.slug]: e.target.value as ImportDecision }))
                          }
                        >
                          <option value="keep_both">Keep both (rename incoming)</option>
                          <option value="replace">Replace existing</option>
                          <option value="skip">Skip</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <button type="button" className="btn btn-primary" style={{ marginTop: "1rem" }} onClick={handleCommit} disabled={loading}>
            {loading ? "Importing…" : "Confirm Import"}
          </button>
        </div>
      )}

      {result && (
        <div className="alert alert-success" style={{ marginTop: "1rem" }}>
          Done — {result.imported} new, {result.replaced} replaced, {result.renamed} renamed (kept both),{" "}
          {result.skipped} skipped.
        </div>
      )}
    </div>
  );
}
