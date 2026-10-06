"use client";

import { useRef, useState } from "react";
import type { ScanResult, ImportDecision } from "@/lib/postExportImport";
import { xhrRequest, xhrError } from "@/lib/xhr";
import { useAdminDialogs } from "./AdminDialogProvider";
import { ProgressLog, useProgressLog, formatMB } from "./ProgressLog";

type CommitResult = { imported: number; replaced: number; renamed: number; skipped: number; type: string };

const OUTCOME_TEXT: Record<string, string> = { imported: "Imported", replaced: "Replaced", renamed: "Kept both", skipped: "Skipped" };

/**
 * Import a posts/pages ZIP made by Export (here or on another StoryTimes
 * site): 1 choose file → 2 review slug conflicts → 3 import, with upload
 * progress and a line per imported item.
 */
export function BulkImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [decisions, setDecisions] = useState<Record<string, ImportDecision>>({});
  const [result, setResult] = useState<CommitResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [title, setTitle] = useState("Import");
  const inputRef = useRef<HTMLInputElement>(null);
  const { confirm } = useAdminDialogs();
  const log = useProgressLog();

  const stage = result ? 4 : scan ? 2 : 1;

  function pick(f: File | null) {
    if (f && !/\.zip$/i.test(f.name)) {
      log.reset();
      setTitle("Import");
      log.start("Checking file…");
      log.fail("Please choose a .zip file made by Export.");
      return;
    }
    setFile(f);
    setScan(null);
    setResult(null);
    setDecisions({});
    log.reset();
    if (f) void check(f);
  }

  async function upload(f: File, extra: Record<string, string>, onText?: (t: string) => void) {
    const fd = new FormData();
    fd.set("importFile", f);
    for (const [k, v] of Object.entries(extra)) fd.set(k, v);
    return xhrRequest("/api/admin/import-zip", {
      method: "POST",
      body: fd,
      onUpload: (loaded, total) => {
        const t = total || f.size;
        log.setPercent(Math.min(40, (loaded / t) * 40));
        log.update(`Uploading ${f.name}… ${formatMB(loaded)} of ${formatMB(t)}`);
      },
      onText,
    });
  }

  async function check(f: File) {
    setBusy(true);
    setTitle("Checking the archive");
    log.start(`Uploading ${f.name}…`);
    try {
      const xhr = await upload(f, { mode: "scan" });
      if (xhr.status !== 200) throw new Error(await xhrError(xhr, "Failed to read ZIP file."));
      const data = JSON.parse(xhr.responseText) as { scan: ScanResult };
      const s = data.scan;
      log.step(`Read the archive — ${s.type === "posts_export" ? "a posts export" : "a pages export"}`);
      log.finish(s.conflicts.length ? `${s.conflicts.length} item(s) already exist here — choose what to do below.` : "No conflicts — everything will be added as new.");
      setScan(s);
      const initial: Record<string, ImportDecision> = {};
      for (const c of s.conflicts) initial[c.slug] = "keep_both";
      setDecisions(initial);
    } catch (err) {
      log.fail(err instanceof Error ? err.message : "Failed to read ZIP file.");
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!file || !scan) return;
    const label = scan.type === "posts_export" ? "posts" : "pages";
    if (!(await confirm(`Import this ${label} archive now?`))) return;
    setBusy(true);
    setTitle(`Importing ${label}`);
    log.start(`Uploading ${file.name}…`);
    let seen = 0;
    let total = 0;
    let finished: CommitResult | null = null;
    let failed: string | null = null;
    const handle = (text: string) => {
      const lines = text.split("\n");
      for (let i = seen; i < lines.length - 1; i++) {
        let ev: { t: string; total?: number; done?: number; title?: string; outcome?: string; result?: CommitResult; message?: string };
        try {
          ev = JSON.parse(lines[i]);
        } catch {
          continue;
        }
        if (ev.t === "start") {
          total = ev.total ?? 0;
          log.step(`Importing ${total} ${label}…`);
        } else if (ev.t === "item") {
          log.note(`${OUTCOME_TEXT[ev.outcome ?? "imported"]}: ${ev.title}`, ev.outcome === "skipped" ? "info" : "done");
          log.setPercent(40 + ((ev.done ?? 0) / Math.max(1, total)) * 58);
          log.update(`Importing ${label}… ${ev.done} of ${total}`);
        } else if (ev.t === "done") finished = ev.result ?? null;
        else if (ev.t === "error") failed = ev.message ?? "Import failed.";
      }
      seen = Math.max(seen, lines.length - 1);
    };
    try {
      const xhr = await upload(file, { mode: "commit", decisions: JSON.stringify(decisions) }, (t) => {
        if (seen === 0) log.step("Uploaded — reading the archive…");
        handle(t);
      });
      if (xhr.status !== 200) throw new Error(await xhrError(xhr, "Import failed."));
      handle(xhr.responseText + "\n");
      if (failed) throw new Error(failed);
      if (!finished) throw new Error("The import stopped before it finished. Check the list and try again.");
      const r: CommitResult = finished;
      setResult(r);
      log.finish(`Done — ${r.imported} new, ${r.replaced} replaced, ${r.renamed} kept both, ${r.skipped} skipped.`);
    } catch (err) {
      log.fail(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setFile(null);
    setScan(null);
    setResult(null);
    setDecisions({});
    log.reset();
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <section className="ie-card">
      <div className="ie-card-hd">
        <span className="ie-ico" style={{ background: "#d1fae5", color: "#059669" }}>
          <i className="fas fa-file-import" />
        </span>
        <div>
          <h3>Import</h3>
          <p>Add posts or pages from an Export ZIP. Images come along; categories, tags and authors are matched or created.</p>
        </div>
      </div>
      <div className="ie-card-bd">
        <ol className="ie-steps">
          {["Choose file", "Review", "Import"].map((s, i) => (
            <li key={s} className={stage > i + 1 ? "done" : stage === i + 1 ? "on" : ""}>
              <span>{stage > i + 1 ? <i className="fas fa-check" /> : i + 1}</span>
              {s}
            </li>
          ))}
        </ol>

        {!scan && !result && (
          <label
            className={`ie-drop${drag ? " drag" : ""}${busy ? " busy" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              if (!busy) pick(e.dataTransfer.files?.[0] ?? null);
            }}
          >
            <input ref={inputRef} type="file" accept=".zip,application/zip" hidden disabled={busy} onChange={(e) => pick(e.target.files?.[0] ?? null)} />
            <i className="fas fa-cloud-arrow-up" />
            <strong>{file ? file.name : "Drop a ZIP here or click to choose"}</strong>
            <span>{file ? formatMB(file.size) : "posts_export_….zip or pages_export_….zip"}</span>
          </label>
        )}

        {scan && !result && (
          <div className="ie-review">
            <div className="ie-review-hd">
              <span>
                <i className="fas fa-file-zipper" /> {file?.name} · {scan.type === "posts_export" ? "Posts" : "Pages"}
              </span>
              <button type="button" className="ie-link" onClick={restart} disabled={busy}>
                Choose another file
              </button>
            </div>
            {scan.conflicts.length > 0 && (
              <>
                <div className="ie-bulk">
                  Set all to:
                  {(["keep_both", "replace", "skip"] as ImportDecision[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      className="ie-link"
                      onClick={() => setDecisions(Object.fromEntries(scan.conflicts.map((c) => [c.slug, d])))}
                      disabled={busy}
                    >
                      {d === "keep_both" ? "Keep both" : d === "replace" ? "Replace" : "Skip"}
                    </button>
                  ))}
                </div>
                <div className="ie-conflicts">
                  {scan.conflicts.map((c) => (
                    <div key={c.slug} className="ie-conflict">
                      <div className="ie-conflict-txt">
                        <strong>{c.title}</strong>
                        <span>
                          /{c.slug} · already here as &ldquo;{c.existingTitle}&rdquo;
                        </span>
                      </div>
                      <select
                        className="form-control"
                        value={decisions[c.slug] ?? "keep_both"}
                        disabled={busy}
                        onChange={(e) => setDecisions((d) => ({ ...d, [c.slug]: e.target.value as ImportDecision }))}
                      >
                        <option value="keep_both">Keep both</option>
                        <option value="replace">Replace existing</option>
                        <option value="skip">Skip</option>
                      </select>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="ie-actions">
              <button type="button" className="ie-btn primary" onClick={commit} disabled={busy}>
                <i className={`fas ${busy ? "fa-spinner fa-spin" : "fa-file-import"}`} /> {busy ? "Importing…" : "Start import"}
              </button>
            </div>
          </div>
        )}

        {result && (
          <div className="ie-result">
            <div>
              <strong>{result.imported}</strong>
              <span>New</span>
            </div>
            <div>
              <strong>{result.replaced}</strong>
              <span>Replaced</span>
            </div>
            <div>
              <strong>{result.renamed}</strong>
              <span>Kept both</span>
            </div>
            <div>
              <strong>{result.skipped}</strong>
              <span>Skipped</span>
            </div>
            <button type="button" className="ie-btn" onClick={restart}>
              <i className="fas fa-rotate-left" /> Import another file
            </button>
          </div>
        )}

        <ProgressLog title={title} lines={log.lines} percent={log.percent} status={log.status} />
      </div>
    </section>
  );
}
