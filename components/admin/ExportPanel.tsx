"use client";

import { useEffect, useState } from "react";
import { getCategoryExportStats, type CategoryExportStat } from "@/lib/postExportImportActions";

/**
 * Export panel — replaces the old plain "Download CSV" link with the real
 * newsbase behaviour: category checkboxes (with live published-post
 * counts, same as admin/import-export.php's get_category_stats AJAX call)
 * for a filtered Posts export, plus a separate one-click Pages export.
 * Both download a ZIP (JSON + bundled media + manifest.json).
 */
export function ExportPanel() {
  const [categories, setCategories] = useState<CategoryExportStat[] | null>(null);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [exportingPosts, setExportingPosts] = useState(false);
  const [exportingPages, setExportingPages] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getCategoryExportStats()
      .then((r) => {
        setCategories(r.categories);
        setTotal(r.total);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load categories."));
  }, []);

  function toggle(id: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function downloadBlob(response: Response, fallbackName: string) {
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message || "Export failed.");
    }
    const disposition = response.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename="([^"]+)"/);
    const filename = match?.[1] ?? fallbackName;
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleExportPosts() {
    setExportingPosts(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/export-posts-zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryIds: Array.from(selected) }),
      });
      await downloadBlob(res, "posts_export.zip");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExportingPosts(false);
    }
  }

  async function handleExportPages() {
    setExportingPages(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/export-pages-zip");
      await downloadBlob(res, "pages_export.zip");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExportingPages(false);
    }
  }

  return (
    <div className="card" style={{ padding: "1.5rem" }}>
      <h3 style={{ marginBottom: "0.5rem" }}>Export Content (ZIP)</h3>
      <p style={{ color: "var(--gray-600)", fontSize: "0.875rem", marginBottom: "1rem" }}>
        Bundles full post/page content, SEO meta, tags and referenced media into a ZIP you can back up
        or import into another StoryTimes site.
      </p>

      {error && (
        <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
          <i className="fas fa-exclamation-circle" /> {error}
        </div>
      )}

      <div style={{ marginBottom: "1rem" }}>
        <label style={{ fontWeight: 600, fontSize: "0.875rem", display: "block", marginBottom: "0.5rem" }}>
          Posts — filter by category (leave all unchecked to export every published post
          {categories ? `, ${total} total` : ""})
        </label>
        {!categories ? (
          <p style={{ fontSize: "0.8125rem", color: "var(--gray-500)" }}>Loading categories…</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.5rem", maxHeight: 220, overflowY: "auto", padding: "0.75rem", border: "1px solid var(--gray-200)", borderRadius: 8 }}>
            {categories.map((c) => (
              <label key={c.id} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8125rem" }}>
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                {c.name} <span style={{ color: "var(--gray-400)" }}>({c.totalPosts})</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary" onClick={handleExportPosts} disabled={exportingPosts}>
          <i className="fas fa-file-archive" /> {exportingPosts ? "Exporting…" : "Export Posts"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={handleExportPages} disabled={exportingPages}>
          <i className="fas fa-file-archive" /> {exportingPages ? "Exporting…" : "Export All Pages"}
        </button>
      </div>
    </div>
  );
}
