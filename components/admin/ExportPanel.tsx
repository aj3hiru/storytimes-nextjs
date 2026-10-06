"use client";

import { useEffect, useState } from "react";
import { getCategoryExportStats } from "@/lib/postExportImportActions";
import type { CategoryExportStat } from "@/lib/postExportImport";
import { xhrRequest, xhrError } from "@/lib/xhr";
import { ProgressLog, useProgressLog, formatMB } from "./ProgressLog";

/**
 * Export posts (optionally by category) or all pages as a ZIP: JSON + media
 * + manifest.json, importable here or on another StoryTimes site. Shows the
 * download as a live log with a real percentage.
 */
export function ExportPanel() {
  const [categories, setCategories] = useState<CategoryExportStat[] | null>(null);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<"posts" | "pages" | null>(null);
  const [title, setTitle] = useState("Export");
  const log = useProgressLog();

  useEffect(() => {
    getCategoryExportStats()
      .then((r) => {
        setCategories(r.categories);
        setTotal(r.total);
      })
      .catch(() => setCategories([]));
  }, []);

  const chosenCount = selected.size === 0 ? total : (categories ?? []).filter((c) => selected.has(c.id)).reduce((n, c) => n + c.totalPosts, 0);

  function toggle(id: number) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function run(kind: "posts" | "pages") {
    setBusy(kind);
    setTitle(kind === "posts" ? "Exporting posts" : "Exporting pages");
    log.start(kind === "posts" ? `Collecting ${selected.size ? "posts from the chosen categories" : "all published posts"}…` : "Collecting all pages…");
    let estimate = 0;
    try {
      const xhr = await xhrRequest(kind === "posts" ? "/api/admin/export-posts-zip" : "/api/admin/export-pages-zip", {
        method: kind === "posts" ? "POST" : "GET",
        body: kind === "posts" ? JSON.stringify({ categoryIds: Array.from(selected) }) : null,
        responseType: "blob",
        onHeaders: (x) => {
          if (x.status !== 200) return;
          const items = Number(x.getResponseHeader("X-Export-Items") || 0);
          const media = Number(x.getResponseHeader("X-Export-Media") || 0);
          estimate = Number(x.getResponseHeader("X-Export-Bytes") || 0);
          log.step(`Found ${items} ${kind === "posts" ? "post" : "page"}${items === 1 ? "" : "s"} and ${media} media file${media === 1 ? "" : "s"} (about ${formatMB(estimate)})`);
          log.step("Packing and downloading the ZIP…");
          log.setPercent(5);
        },
        onDownload: (loaded) => {
          if (!estimate) return;
          const pct = Math.min(98, 5 + (loaded / estimate) * 93);
          log.setPercent(pct);
          log.update(loaded <= estimate ? `Packing and downloading… ${formatMB(loaded)} of about ${formatMB(estimate)}` : `Packing and downloading… ${formatMB(loaded)}`);
        },
      });
      if (xhr.status !== 200) throw new Error(await xhrError(xhr, "Export failed."));
      const disposition = xhr.getResponseHeader("Content-Disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `${kind}_export.zip`;
      const blob = xhr.response as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      log.finish(`Saved ${filename} (${formatMB(blob.size)})`);
    } catch (err) {
      log.fail(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="ie-card">
      <div className="ie-card-hd">
        <span className="ie-ico" style={{ background: "#ede9fe", color: "#7c3aed" }}>
          <i className="fas fa-file-export" />
        </span>
        <div>
          <h3>Export</h3>
          <p>Download posts or pages as a ZIP — content, SEO, tags, categories and every image inside.</p>
        </div>
      </div>
      <div className="ie-card-bd">
        <div className="ie-label">
          Posts by category
          <span>{selected.size === 0 ? "None ticked = every published post" : `${selected.size} selected`}</span>
        </div>
        {!categories ? (
          <p className="ie-muted">
            <i className="fas fa-spinner fa-spin" /> Loading categories…
          </p>
        ) : categories.length === 0 ? (
          <p className="ie-muted">No categories yet.</p>
        ) : (
          <div className="ie-chips">
            {categories.map((c) => (
              <label key={c.id} className={`ie-chip${selected.has(c.id) ? " on" : ""}`}>
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                {c.name}
                <span>{c.totalPosts}</span>
              </label>
            ))}
          </div>
        )}
        <div className="ie-actions">
          <button type="button" className="ie-btn primary" onClick={() => run("posts")} disabled={busy !== null || chosenCount === 0}>
            <i className={`fas ${busy === "posts" ? "fa-spinner fa-spin" : "fa-download"}`} /> Export {chosenCount.toLocaleString("en-IN")} post{chosenCount === 1 ? "" : "s"}
          </button>
          <button type="button" className="ie-btn" onClick={() => run("pages")} disabled={busy !== null}>
            <i className={`fas ${busy === "pages" ? "fa-spinner fa-spin" : "fa-file-lines"}`} /> Export all pages
          </button>
        </div>
        <ProgressLog title={title} lines={log.lines} percent={log.percent} status={log.status} />
      </div>
    </section>
  );
}
