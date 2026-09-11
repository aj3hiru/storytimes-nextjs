"use client";

import { useState } from "react";
import { restoreFromBackup, type RestoreResult } from "@/lib/backupRestoreAdmin";
import { useAdminDialogs } from "./AdminDialogProvider";

export function RestorePanel() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RestoreResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { confirm } = useAdminDialogs();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setJsonText(await file.text());
    setResult(null);
    setError(null);
  }

  async function handleRestore() {
    if (!jsonText) return;
    if (!(await confirm("Restore categories, tags, and pages from this backup? Existing ones with matching slugs will be updated."))) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await restoreFromBackup(jsonText);
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card" style={{ padding: "1.5rem" }}>
      <h3 style={{ marginBottom: "0.5rem" }}>Restore</h3>
      <p style={{ color: "var(--gray-600)", fontSize: "0.875rem", marginBottom: "1rem" }}>
        Merges categories, tags, and pages from a JSON backup (upserted by slug — safe to re-run).
        Posts are intentionally <strong>not</strong> restored this way — author/category ids don&apos;t
        reliably map between databases; use CSV import for posts instead.
      </p>

      <input type="file" accept=".json,application/json" onChange={handleFile} className="form-control" style={{ marginBottom: "1rem" }} />

      {fileName && !result && (
        <button type="button" className="btn btn-primary" onClick={handleRestore} disabled={loading}>
          {loading ? "Restoring…" : `Restore from "${fileName}"`}
        </button>
      )}

      {error && (
        <div className="alert alert-error" style={{ marginTop: "1rem" }}>
          <i className="fas fa-exclamation-circle" /> {error}
        </div>
      )}

      {result && (
        <div className="alert alert-success" style={{ marginTop: "1rem" }}>
          Restored {result.categoriesRestored} categories, {result.tagsRestored} tags, {result.pagesRestored} pages.
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
