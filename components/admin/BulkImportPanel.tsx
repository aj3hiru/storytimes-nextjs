"use client";

import { useState } from "react";
import { previewPostImport, commitPostImport, type ImportPreview, type ImportResult } from "@/lib/postImport";
import { useAdminDialogs } from "./AdminDialogProvider";

export function BulkImportPanel() {
  const [csvText, setCsvText] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { confirm } = useAdminDialogs();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    setFileName(file.name);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  async function handlePreview() {
    if (!csvText) return;
    setLoading(true);
    setError(null);
    try {
      const p = await previewPostImport(csvText);
      setPreview(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse CSV.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    if (!csvText) return;
    if (!(await confirm(`Import ${preview?.validCount ?? 0} post(s)? This cannot be undone in bulk.`))) return;
    setLoading(true);
    setError(null);
    try {
      const r = await commitPostImport(csvText);
      setResult(r);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ padding: "1.5rem" }}>
      <h3 style={{ marginBottom: "0.5rem" }}>Bulk Import Posts (CSV)</h3>
      <p style={{ color: "var(--gray-600)", fontSize: "0.875rem", marginBottom: "1rem" }}>
        Required columns: <code>title</code>, <code>content</code>, <code>category</code> (must match
        an existing category name exactly). Optional: <code>slug</code>, <code>excerpt</code>,{" "}
        <code>status</code> (draft/published/archived, defaults to draft), <code>tags</code>
        (semicolon-separated).
      </p>

      <input type="file" accept=".csv,text/csv" onChange={handleFile} className="form-control" style={{ marginBottom: "1rem" }} />

      {fileName && !preview && !result && (
        <button type="button" className="btn btn-primary" onClick={handlePreview} disabled={loading}>
          {loading ? "Checking…" : `Preview "${fileName}"`}
        </button>
      )}

      {error && (
        <div className="alert alert-error" style={{ marginTop: "1rem" }}>
          <i className="fas fa-exclamation-circle" /> {error}
        </div>
      )}

      {preview && (
        <div style={{ marginTop: "1rem" }}>
          <div className="alert alert-info">
            {preview.validCount} row(s) ready to import, {preview.errorCount} row(s) will be skipped.
          </div>
          <div className="table-wrap" style={{ marginTop: "1rem", maxHeight: 400, overflowY: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Title</th>
                  <th>Slug</th>
                  <th>Category</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.rowNumber} style={row.errors.length > 0 ? { opacity: 0.6 } : undefined}>
                    <td>{row.rowNumber}</td>
                    <td>
                      {row.title || <em>(missing)</em>}
                      {row.errors.length > 0 && (
                        <div style={{ color: "var(--danger)", fontSize: "0.75rem" }}>{row.errors.join("; ")}</div>
                      )}
                    </td>
                    <td>{row.slug}</td>
                    <td>{row.category}</td>
                    <td>{row.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ marginTop: "1rem" }}
            onClick={handleCommit}
            disabled={loading || preview.validCount === 0}
          >
            {loading ? "Importing…" : `Import ${preview.validCount} Post(s)`}
          </button>
        </div>
      )}

      {result && (
        <div className="alert alert-success" style={{ marginTop: "1rem" }}>
          Created {result.created} post(s), skipped {result.skipped}.
          {result.errors.length > 0 && (
            <ul style={{ marginTop: "0.5rem", paddingLeft: "1.25rem" }}>
              {result.errors.map((e, i) => (
                <li key={i} style={{ fontSize: "0.8rem" }}>
                  {e}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
