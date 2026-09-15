"use client";

import { useEffect, useRef, useState } from "react";
import { useAdminDialogs } from "./AdminDialogProvider";

interface BackupFileInfo {
  name: string;
  size: number;
  date: string;
}

interface StatsResponse {
  success: boolean;
  tableCounts: Record<string, number>;
  totalPosts: number;
  totalPages: number;
  mediaSize: number;
  backupFiles: BackupFileInfo[];
  message?: string;
}

interface RestoreManifest {
  site_name?: string;
  site_url?: string;
  backup_date?: string;
  total_posts?: number;
  total_pages?: number;
  include_media?: boolean;
  media_files?: number;
}

interface JobStatus {
  status: "running" | "done" | "error";
  percent: number;
  stage: string;
  error?: string;
  result?: { filename?: string; size?: number; mediaRestored?: number; warnings?: string[] };
}

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + " GB";
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(2) + " KB";
  return bytes + " B";
}

const API = "/api/admin/backup-restore";

/** Polls a background job until it's done/errored, calling onTick on
 *  every update so the UI can show a live percent + stage message. */
async function pollJob(jobId: string, onTick: (job: JobStatus) => void): Promise<JobStatus> {
  while (true) {
    const res = await fetch(`${API}?action=progress&jobId=${encodeURIComponent(jobId)}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.message || "Lost track of the job's progress.");
    const job: JobStatus = data;
    onTick(job);
    if (job.status === "done" || job.status === "error") return job;
    await new Promise((r) => setTimeout(r, 900));
  }
}

export function BackupRestorePanel() {
  const { confirm, notice } = useAdminDialogs();
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [label, setLabel] = useState("manual");
  const [includeMedia, setIncludeMedia] = useState(true);
  const [creating, setCreating] = useState(false);

  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [manifest, setManifest] = useState<RestoreManifest | null>(null);
  const [scanning, setScanning] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [backupProgress, setBackupProgress] = useState<{ percent: number; stage: string } | null>(null);
  const [restoreProgress, setRestoreProgress] = useState<{ percent: number; stage: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadStats() {
    const res = await fetch(API);
    const data = await res.json();
    setStats(data);
  }

  useEffect(() => {
    fetch("/api/csrf-token").then((r) => r.json()).then((d) => setCsrfToken(d.token));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadStats();
  }, []);

  async function handleCreateBackup() {
    if (!csrfToken) return;
    setCreating(true);
    setBackupProgress({ percent: 0, stage: "Starting…" });
    try {
      const form = new FormData();
      form.set("action", "create");
      form.set("label", label);
      form.set("include_media", includeMedia ? "1" : "0");
      form.set("csrf_token", csrfToken);
      const res = await fetch(API, { method: "POST", body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Backup failed to start.");

      const job = await pollJob(data.jobId, (j) => setBackupProgress({ percent: j.percent, stage: j.stage }));
      if (job.status === "error") throw new Error(job.error || "Backup failed.");

      notice(`Backup created: ${job.result?.filename} (${formatBytes(job.result?.size ?? 0)})`, { type: "success", title: "Backup Complete" });
      await loadStats();
    } catch (err) {
      notice(err instanceof Error ? err.message : "Backup failed.", { type: "error" });
    } finally {
      setCreating(false);
      setBackupProgress(null);
    }
  }

  async function handleDeleteBackup(name: string) {
    if (!csrfToken) return;
    if (!(await confirm(`Delete backup "${name}"? This cannot be undone.`, { title: "Delete Backup" }))) return;
    const form = new FormData();
    form.set("action", "delete");
    form.set("file", name);
    form.set("csrf_token", csrfToken);
    const res = await fetch(API, { method: "POST", body: form });
    const data = await res.json();
    if (!data.success) {
      notice(data.message || "Delete failed.", { type: "error" });
      return;
    }
    await loadStats();
  }

  function pickFile(file: File | null) {
    setRestoreFile(file);
    setManifest(null);
    setConfirmText("");
    if (file) scanFile(file);
  }

  async function scanFile(file: File) {
    if (!csrfToken) return;
    setScanning(true);
    try {
      const form = new FormData();
      form.set("action", "scan");
      form.set("restore_file", file);
      form.set("csrf_token", csrfToken);
      const res = await fetch(API, { method: "POST", body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "This doesn't look like a valid backup file.");
      setManifest(data.manifest);
    } catch (err) {
      notice(err instanceof Error ? err.message : "Scan failed.", { type: "error" });
      setRestoreFile(null);
    } finally {
      setScanning(false);
    }
  }

  async function handleRestore() {
    if (!csrfToken || !restoreFile) return;
    if (confirmText !== "CONFIRM") return;
    const ok = await confirm(
      "This will PERMANENTLY DELETE all current posts, pages, media and settings, replacing them with the backup's data. Everyone will be logged out. This cannot be undone.",
      { title: "Final Confirmation", confirmText: "Yes, Restore Now", danger: true }
    );
    if (!ok) return;

    setRestoring(true);
    setRestoreProgress({ percent: 0, stage: "Uploading backup…" });
    try {
      const form = new FormData();
      form.set("action", "restore");
      form.set("restore_file", restoreFile);
      form.set("confirm_text", confirmText);
      form.set("csrf_token", csrfToken);
      const res = await fetch(API, { method: "POST", body: form });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Restore failed to start.");

      const job = await pollJob(data.jobId, (j) => setRestoreProgress({ percent: j.percent, stage: j.stage }));
      if (job.status === "error") throw new Error(job.error || "Restore failed.");

      const mediaRestored = job.result?.mediaRestored ?? 0;
      const warnings = job.result?.warnings ?? [];
      notice(
        `Site restored successfully. Media files restored: ${mediaRestored}.${warnings.length ? ` ${warnings.length} warning(s) — see browser console.` : ""} You will now be redirected to log in again.`,
        { type: "success", title: "Restore Complete", autoClose: 0 }
      );
      if (warnings.length) console.warn("Restore warnings:", warnings);
      setTimeout(() => {
        // Deliberately a full page navigation, not router.push() — every
        // bit of client-side React/session state just became stale
        // (the whole DB was replaced), so this needs a hard reload.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/admin-login";
      }, 3500);
    } catch (err) {
      notice(err instanceof Error ? err.message : "Restore failed.", { type: "error" });
      setRestoring(false);
      setRestoreProgress(null);
    }
  }

  if (!stats) {
    return <div className="card" style={{ padding: "1.5rem" }}>Loading backup dashboard…</div>;
  }

  return (
    <div>
      <div className="br-stats-grid">
        <div className="br-stat-item"><div className="br-stat-num">{stats.totalPosts}</div><div className="br-stat-lbl">Posts</div></div>
        <div className="br-stat-item"><div className="br-stat-num">{stats.totalPages}</div><div className="br-stat-lbl">Pages</div></div>
        <div className="br-stat-item"><div className="br-stat-num">{formatBytes(stats.mediaSize)}</div><div className="br-stat-lbl">Media Size</div></div>
        <div className="br-stat-item"><div className="br-stat-num">{stats.backupFiles.length}</div><div className="br-stat-lbl">Saved Backups</div></div>
      </div>

      <div className="br-grid">
        {/* ── Create Backup ── */}
        <div className="br-card">
          <div className="br-card-header">
            <div className="br-card-icon br-icon-backup"><i className="fas fa-download" /></div>
            <div>
              <h3 className="br-card-title">Create Backup</h3>
              <p className="br-card-desc">Full site snapshot — database + media + settings, as a downloadable ZIP.</p>
            </div>
          </div>

          <div className="cm-field-row" style={{ marginBottom: "12px" }}>
            <label className="cm-fl" style={{ minWidth: "120px" }}>Label</label>
            <input type="text" className="form-control" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. before-update" />
          </div>
          <label className="cm-toggle-row" style={{ marginBottom: "16px" }}>
            <div className="cm-toggle-switch">
              <input type="checkbox" checked={includeMedia} onChange={(e) => setIncludeMedia(e.target.checked)} />
              <span className="cm-toggle-slider" />
            </div>
            <span style={{ fontSize: ".85rem" }}>Include media files (uploads folder)</span>
          </label>

          <button type="button" className="btn btn-primary" disabled={creating || !csrfToken} onClick={handleCreateBackup} style={{ width: "100%" }}>
            {creating ? (<><i className="fas fa-spinner fa-spin" /> Creating backup…</>) : (<><i className="fas fa-download" /> Create Backup Now</>)}
          </button>

          {backupProgress && (
            <div className="br-progress-wrap">
              <div className="br-progress-bar-outer">
                <div className="br-progress-bar-inner" style={{ width: `${backupProgress.percent}%` }} />
              </div>
              <div className="br-progress-text">{backupProgress.percent}% — {backupProgress.stage}</div>
            </div>
          )}

          {stats.backupFiles.length > 0 && (
            <div className="br-backup-list">
              {stats.backupFiles.map((f) => (
                <div className="br-backup-item" key={f.name}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="br-backup-item-name">{f.name}</div>
                    <div className="br-backup-item-meta">{formatBytes(f.size)} · {new Date(f.date).toLocaleString()}</div>
                  </div>
                  <a className="btn-action btn-view" href={`${API}?action=download&file=${encodeURIComponent(f.name)}`}>
                    <i className="fas fa-download" />
                  </a>
                  <button type="button" className="btn-action btn-delete" onClick={() => handleDeleteBackup(f.name)}>
                    <i className="fas fa-trash-alt" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Restore ── */}
        <div className="br-card">
          <div className="br-card-header">
            <div className="br-card-icon br-icon-restore"><i className="fas fa-upload" /></div>
            <div>
              <h3 className="br-card-title">Restore from Backup</h3>
              <p className="br-card-desc">Upload a backup ZIP to replace the entire site with it.</p>
            </div>
          </div>

          <div className="br-danger-box">
            <strong>Warning:</strong> Restoring PERMANENTLY replaces all current posts, pages, media and settings.
            This cannot be undone. Everyone will be logged out afterwards.
          </div>

          <div
            className={`br-upload-area${dragOver ? " dragover" : ""}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) pickFile(f);
            }}
          >
            <i className="fas fa-cloud-upload-alt" />
            <div style={{ fontWeight: 600, fontSize: ".9rem" }}>Click or drag a backup .zip here</div>
            {restoreFile && <div className="br-file-chosen"><i className="fas fa-file-archive" /> {restoreFile.name} ({formatBytes(restoreFile.size)})</div>}
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              style={{ display: "none" }}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </div>

          {scanning && <p style={{ fontSize: ".82rem", color: "var(--gray-500)", marginTop: "10px" }}><i className="fas fa-spinner fa-spin" /> Scanning backup…</p>}

          {manifest && !scanning && (
            <div className="br-info-box" style={{ marginTop: "14px" }}>
              <strong>{manifest.site_name || "Backup"}</strong> — {manifest.total_posts ?? 0} posts, {manifest.total_pages ?? 0} pages
              {manifest.include_media ? `, ${manifest.media_files ?? 0} media file(s)` : ", no media"}.
              {manifest.backup_date && <> Taken on {new Date(manifest.backup_date).toLocaleString()}.</>}
            </div>
          )}

          {manifest && !scanning && (
            <div style={{ marginTop: "16px" }}>
              <label className="cm-fl" style={{ display: "block", marginBottom: "6px" }}>
                Type <strong>CONFIRM</strong> to proceed
              </label>
              <input
                type="text"
                className="form-control br-confirm-input"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                placeholder="CONFIRM"
              />
              <button
                type="button"
                className="btn btn-danger"
                style={{ width: "100%", marginTop: "12px" }}
                disabled={confirmText !== "CONFIRM" || restoring}
                onClick={handleRestore}
              >
                {restoring ? (<><i className="fas fa-spinner fa-spin" /> Restoring — do not close this page…</>) : (<><i className="fas fa-exclamation-triangle" /> Restore Site Now</>)}
              </button>

              {restoreProgress && (
                <div className="br-progress-wrap">
                  <div className="br-progress-bar-outer">
                    <div className="br-progress-bar-inner" style={{ width: `${restoreProgress.percent}%` }} />
                  </div>
                  <div className="br-progress-text">{restoreProgress.percent}% — {restoreProgress.stage}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
