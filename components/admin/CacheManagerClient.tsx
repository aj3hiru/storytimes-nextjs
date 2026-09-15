"use client";

import { useEffect, useState, useTransition } from "react";
import {
  getCacheDashboardData,
  getCacheFilesList,
  deleteOneCacheFile,
  clearEntireCache,
  setCacheEnabled,
  updateCacheSettings,
  runPreloadNow,
} from "@/lib/cacheManagerAdmin";
import type { CacheOverviewStats } from "@/lib/cache/pageCache";
import type { CacheSettings } from "@/lib/cache/cacheSettings";
import { useAdminDialogs } from "./AdminDialogProvider";

type Tab = "overview" | "settings" | "diagnostics" | "files";

interface FileRow {
  name: string;
  size: number;
  date: string;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + " GB";
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(2) + " KB";
  return bytes + " B";
}

function formatTtl(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} hr`;
  const days = Math.round(seconds / 86400);
  return `${days} day${days >= 2 ? "s" : ""}`;
}

const HOMEPAGE_TTL_OPTIONS = [60, 300, 600, 1800, 3600];
const POST_TTL_OPTIONS = [3600, 21600, 43200, 86400, 604800];

export function CacheManagerClient() {
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<CacheOverviewStats | null>(null);
  const [settings, setSettings] = useState<CacheSettings | null>(null);
  const [files, setFiles] = useState<FileRow[] | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { confirm } = useAdminDialogs();

  async function refresh() {
    // Real bug fixed here — the likely cause of "Cache Manager stuck on
    // Loading cache dashboard… forever": this call had no error
    // handling at all. If getCacheDashboardData() ever rejects for ANY
    // reason (a genuine permission failure, a transient network blip
    // during/right after a deploy, or anything else), the promise
    // rejection was silently swallowed by the browser, overview/settings
    // stayed null forever, and the component had no way to ever leave
    // its initial "Loading…" render — no error message, no retry
    // button, nothing a person could act on.
    try {
      setLoadError(null);
      const data = await getCacheDashboardData();
      setOverview(data.overview);
      setSettings(data.settings);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load the cache dashboard.");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, []);

  useEffect(() => {
    if (tab === "files" && files === null) {
      getCacheFilesList().then(setFiles);
    }
  }, [tab, files]);

  function notify(type: "success" | "error", text: string) {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  }

  function handleToggleCache() {
    if (!overview) return;
    startTransition(async () => {
      try {
        await setCacheEnabled(!overview.enabled);
        await refresh();
        notify("success", overview.enabled ? "Cache system stopped." : "Cache system started.");
      } catch (err) {
        notify("error", err instanceof Error ? err.message : "Failed to toggle cache.");
      }
    });
  }

  function handleClearAll() {
    startTransition(async () => {
      try {
        const { deleted } = await clearEntireCache();
        setFiles(null);
        await refresh();
        notify("success", `Cache cleared! Deleted ${deleted} file(s).`);
      } catch (err) {
        notify("error", err instanceof Error ? err.message : "Failed to clear cache.");
      }
    });
  }

  function handlePreload() {
    startTransition(async () => {
      try {
        const { count } = await runPreloadNow();
        notify("success", count > 0 ? `Preload triggered for ${count} page(s) — homepage + recent posts.` : "Preload could not reach any pages.");
      } catch (err) {
        notify("error", err instanceof Error ? err.message : "Preload failed.");
      }
    });
  }

  function handleDeleteFile(name: string) {
    startTransition(async () => {
      try {
        await deleteOneCacheFile(name);
        setFiles((prev) => prev?.filter((f) => f.name !== name) ?? null);
        await refresh();
      } catch (err) {
        notify("error", err instanceof Error ? err.message : "Failed to delete file.");
      }
    });
  }

  async function handleSaveSettings(partial: Partial<CacheSettings>) {
    startTransition(async () => {
      try {
        await updateCacheSettings(partial);
        await refresh();
        notify("success", "Cache settings saved.");
      } catch (err) {
        notify("error", err instanceof Error ? err.message : "Failed to save settings.");
      }
    });
  }

  if (!overview || !settings) {
    if (loadError) {
      return (
        <div className="card" style={{ padding: "1.5rem" }}>
          <div className="alert alert-error" style={{ marginBottom: "1rem" }}>
            <i className="fas fa-triangle-exclamation" /> {loadError}
          </div>
          <button type="button" className="btn btn-primary" onClick={() => refresh()}>
            <i className="fas fa-rotate-right" /> Retry
          </button>
        </div>
      );
    }
    return <div className="card" style={{ padding: "1.5rem" }}>Loading cache dashboard…</div>;
  }

  const locked = !overview.enabled;

  return (
    <div>
      <div className="cm-banner">
        <div className="cm-banner-left">
          <div className={`cm-banner-icon ${overview.enabled ? "on" : "off"}`}>
            <i className={`fas ${overview.enabled ? "fa-bolt" : "fa-power-off"}`} />
          </div>
          <div>
            <div className="cm-banner-title">Cache System — {overview.enabled ? "ON" : "OFF"}</div>
            <div className="cm-banner-sub">
              {overview.enabled
                ? "Homepage and post pages are served from a warmed data cache, TTL-controlled below."
                : "Every page renders live from the database — nothing is cached anywhere. Turn it back on below."}
            </div>
          </div>
        </div>
        <button type="button" className={`btn ${overview.enabled ? "btn-danger" : "btn-primary"}`} onClick={handleToggleCache} disabled={isPending}>
          <i className={`fas ${overview.enabled ? "fa-stop" : "fa-play"}`} />{" "}
          {overview.enabled ? "Stop Cache System" : "Start Cache System"}
        </button>
      </div>

      {message && (
        <div className={`alert ${message.type === "success" ? "alert-success" : "alert-error"}`}>
          <i className={`fas ${message.type === "success" ? "fa-check-circle" : "fa-exclamation-circle"}`} /> {message.text}
        </div>
      )}

      <div className={locked ? "cm-locked" : undefined} title={locked ? "Cache system is OFF — start it from the toggle above first" : undefined}>
        <div className="cm-tabs">
          <button type="button" className={`cm-tab ${tab === "overview" ? "active" : ""}`} onClick={() => setTab("overview")}>Overview</button>
          <button type="button" className={`cm-tab ${tab === "settings" ? "active" : ""}`} onClick={() => setTab("settings")}>Settings</button>
          <button type="button" className={`cm-tab ${tab === "diagnostics" ? "active" : ""}`} onClick={() => setTab("diagnostics")}>Diagnostics</button>
          <button type="button" className={`cm-tab ${tab === "files" ? "active" : ""}`} onClick={() => setTab("files")}>Cached Files ({overview.totalFiles})</button>
        </div>

        {tab === "overview" && (
          <div className="cm-panel active">
            <div className="cm-stats-bar">
              <div className="cm-stat-card primary">
                <div className="cm-stat-icon"><i className="fas fa-file-alt" /></div>
                <div className="cm-label">Total Files</div>
                <div className="cm-value">{overview.totalFiles}</div>
              </div>
              <div className="cm-stat-card">
                <div className="cm-stat-icon"><i className="fas fa-hdd" /></div>
                <div className="cm-label">Total Size</div>
                <div className="cm-value">{formatBytes(overview.totalSize)}</div>
              </div>
              <div className="cm-stat-card">
                <div className="cm-stat-icon"><i className="fas fa-microchip" /></div>
                <div className="cm-label">Object Cache</div>
                <div className="cm-value" style={{ fontSize: ".9rem", color: overview.objectCacheActive ? "var(--success)" : "var(--gray-500)" }}>
                  {overview.objectCacheActive ? "Redis Active" : overview.objectCacheAvailable ? "Configured, unreachable" : "Not configured"}
                </div>
              </div>
              <div className="cm-stat-card">
                <div className="cm-stat-icon"><i className="fas fa-clock" /></div>
                <div className="cm-label">Homepage TTL</div>
                <div className="cm-value" style={{ fontSize: ".9rem" }}>{formatTtl(overview.ttlHomepageSeconds)}</div>
              </div>
              <div className="cm-stat-card">
                <div className="cm-stat-icon"><i className="fas fa-clock" /></div>
                <div className="cm-label">Post TTL</div>
                <div className="cm-value" style={{ fontSize: ".9rem" }}>{formatTtl(overview.ttlPostSeconds)}</div>
              </div>
            </div>

            <div className="cm-actions-row">
              {overview.totalFiles > 0 ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={isPending || locked}
                  onClick={async () => {
                    if (await confirm(`Clear the ENTIRE cache — ${overview.totalFiles} file(s)?`, { title: "Clear Cache", confirmText: "Clear Cache" })) {
                      handleClearAll();
                    }
                  }}
                >
                  <i className="fas fa-trash-alt" /> Clear Cache ({overview.totalFiles} files)
                </button>
              ) : (
                <span style={{ fontSize: ".875rem", color: "var(--gray-500)", display: "inline-flex", alignItems: "center", gap: ".4rem" }}>
                  <i className="fas fa-check-circle" style={{ color: "var(--success)" }} /> Cache is clean — no files to clear.
                </span>
              )}
              <button type="button" className="btn btn-secondary" disabled={isPending || locked} onClick={handlePreload}>
                <i className="fas fa-fire" /> Preload Cache Now
              </button>
            </div>

            {overview.lastClearedAt && (
              <p style={{ fontSize: ".78rem", color: "var(--gray-500)", marginTop: "-0.75rem" }}>
                Last cleared: {new Date(overview.lastClearedAt).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {tab === "settings" && (
          <SettingsPanel settings={settings} onSave={handleSaveSettings} disabled={isPending || locked} />
        )}

        {tab === "diagnostics" && <DiagnosticsPanel overview={overview} settings={settings} />}

        {tab === "files" && (
          <FilesPanel files={files} onDelete={handleDeleteFile} disabled={isPending || locked} />
        )}
      </div>
    </div>
  );
}

function SettingsPanel({
  settings,
  onSave,
  disabled,
}: {
  settings: CacheSettings;
  onSave: (partial: Partial<CacheSettings>) => void;
  disabled: boolean;
}) {
  const [ttlHomepage, setTtlHomepage] = useState(settings.ttlHomepageSeconds);
  const [ttlPost, setTtlPost] = useState(settings.ttlPostSeconds);
  const [autoPreload, setAutoPreload] = useState(settings.autoPreload);
  const [excludeUrls, setExcludeUrls] = useState(settings.excludeUrls);
  const [autoClearEnabled, setAutoClearEnabled] = useState(settings.autoClearEnabled);
  const [autoClearInterval, setAutoClearInterval] = useState(settings.autoClearIntervalHours);

  return (
    <div className="cm-panel active">
      <div className="cm-card">
        <h3><i className="fas fa-hourglass-half" style={{ color: "var(--primary)" }} /> Page Cache Lifespan</h3>
        <p className="cm-hint">
          How long a cached page is served before it&apos;s regenerated fresh. Any edit from the admin panel
          (post, page) invalidates the relevant cache immediately regardless of this setting.
        </p>
        <div className="cm-field-row">
          <label className="cm-fl">Homepage refresh interval</label>
          <select className="cm-select" value={ttlHomepage} onChange={(e) => setTtlHomepage(Number(e.target.value))} disabled={disabled}>
            {HOMEPAGE_TTL_OPTIONS.map((sec) => (
              <option key={sec} value={sec}>{formatTtl(sec)}</option>
            ))}
          </select>
        </div>
        <div className="cm-field-row">
          <label className="cm-fl">Post page lifespan</label>
          <select className="cm-select" value={ttlPost} onChange={(e) => setTtlPost(Number(e.target.value))} disabled={disabled}>
            {POST_TTL_OPTIONS.map((sec) => (
              <option key={sec} value={sec}>{formatTtl(sec)}</option>
            ))}
          </select>
        </div>
        <div className="cm-field-row" style={{ marginTop: "1.25rem", paddingTop: "1rem", borderTop: "1px solid var(--gray-100)" }}>
          <label className="cm-toggle-row" style={{ minWidth: "170px" }}>
            <div className="cm-toggle-switch">
              <input type="checkbox" checked={autoPreload} onChange={(e) => setAutoPreload(e.target.checked)} disabled={disabled} />
              <span className="cm-toggle-slider" />
            </div>
            <span>Auto-preload after clear</span>
          </label>
        </div>
        <div className="cm-field-row" style={{ alignItems: "flex-start" }}>
          <label className="cm-fl">Exclude URLs (one per line)</label>
          <textarea className="cm-textarea" value={excludeUrls} onChange={(e) => setExcludeUrls(e.target.value)} disabled={disabled} placeholder="/contact-us&#10;/search" />
        </div>
        <div className="cm-actions-row" style={{ marginTop: "1rem", marginBottom: 0 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={disabled}
            onClick={() => onSave({ ttlHomepageSeconds: ttlHomepage, ttlPostSeconds: ttlPost, autoPreload, excludeUrls })}
          >
            <i className="fas fa-save" /> Save Cache Settings
          </button>
        </div>
      </div>

      <div className="cm-card">
        <h3><i className="fas fa-broom" style={{ color: "var(--primary)" }} /> Auto-Clear Schedule</h3>
        <p className="cm-hint">Automatically clears the whole cache on an interval — checked whenever this dashboard loads (no separate cron needed).</p>
        <div className="cm-field-row">
          <label className="cm-toggle-row" style={{ minWidth: "170px" }}>
            <div className="cm-toggle-switch">
              <input type="checkbox" checked={autoClearEnabled} onChange={(e) => setAutoClearEnabled(e.target.checked)} disabled={disabled} />
              <span className="cm-toggle-slider" />
            </div>
            <span>Enable auto-clear</span>
          </label>
          <select className="cm-select" value={autoClearInterval} onChange={(e) => setAutoClearInterval(Number(e.target.value))} disabled={disabled || !autoClearEnabled}>
            {[1, 6, 12, 24, 72, 168].map((h) => (
              <option key={h} value={h}>{h < 24 ? `${h} hour${h > 1 ? "s" : ""}` : `${h / 24} day${h / 24 > 1 ? "s" : ""}`}</option>
            ))}
          </select>
        </div>
        <div className="cm-actions-row" style={{ marginTop: "1rem", marginBottom: 0 }}>
          <button type="button" className="btn btn-primary" disabled={disabled} onClick={() => onSave({ autoClearEnabled, autoClearIntervalHours: autoClearInterval })}>
            <i className="fas fa-save" /> Save Auto-Clear Settings
          </button>
        </div>
      </div>
    </div>
  );
}

function DiagnosticsPanel({ overview, settings }: { overview: CacheOverviewStats; settings: CacheSettings }) {
  const chips = [
    {
      ok: overview.enabled,
      title: overview.enabled ? "Cache system running" : "Cache system stopped",
      desc: overview.enabled ? "Pages are being served from cache where fresh." : "Every request hits the database directly.",
    },
    {
      ok: overview.objectCacheAvailable ? overview.objectCacheActive : true,
      title: overview.objectCacheAvailable ? (overview.objectCacheActive ? "Redis object cache reachable" : "Redis configured but unreachable") : "Redis not configured",
      desc: overview.objectCacheAvailable
        ? "REDIS_URL is set — used as an optional extra object cache layer."
        : "Set REDIS_URL in the environment to enable it. Not required for the page cache to work.",
    },
    {
      ok: true,
      title: "Data cache directory",
      desc: process.env.NODE_ENV === "production" ? "Backed by .next/cache/fetch-cache on this self-hosted server." : "Running in dev mode — Next disables persistent caching here.",
    },
    {
      ok: settings.autoClearEnabled ? !!overview.nextAutoClearAt : true,
      title: settings.autoClearEnabled ? "Auto-clear scheduled" : "Auto-clear disabled",
      desc: overview.nextAutoClearAt ? `Next auto-clear around ${new Date(overview.nextAutoClearAt).toLocaleString()}.` : "Turn it on in Settings to clear the cache automatically on an interval.",
    },
  ];

  return (
    <div className="cm-panel active">
      <div className="cm-diag-grid">
        {chips.map((c, i) => (
          <div className="cm-diag-chip" key={i}>
            <span className={`cm-dot ${c.ok ? "ok" : "warn"}`} />
            <div>
              <div className="cm-diag-title">{c.title}</div>
              <div className="cm-diag-desc">{c.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilesPanel({
  files,
  onDelete,
  disabled,
}: {
  files: FileRow[] | null;
  onDelete: (name: string) => void;
  disabled: boolean;
}) {
  const { confirm } = useAdminDialogs();

  if (files === null) return <div className="cm-panel active">Loading files…</div>;

  return (
    <div className="cm-panel active">
      {files.length === 0 ? (
        <p style={{ fontSize: ".875rem", color: "var(--gray-500)" }}>No cache files on disk right now.</p>
      ) : (
        <div className="table-wrap">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: ".75rem 1rem" }}>File</th>
                <th style={{ textAlign: "left", padding: ".75rem 1rem" }}>Size</th>
                <th style={{ textAlign: "left", padding: ".75rem 1rem" }}>Modified</th>
                <th style={{ textAlign: "right", padding: ".75rem 1rem" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.name}>
                  <td style={{ padding: ".75rem 1rem" }}><span className="cm-file-name" title={f.name}>{f.name}</span></td>
                  <td style={{ padding: ".75rem 1rem" }}>{formatBytes(f.size)}</td>
                  <td style={{ padding: ".75rem 1rem" }}>{new Date(f.date).toLocaleString()}</td>
                  <td style={{ padding: ".75rem 1rem", textAlign: "right" }}>
                    <button
                      type="button"
                      className="btn-action btn-delete"
                      disabled={disabled}
                      onClick={async () => {
                        if (await confirm(`Delete cache file "${f.name}"?`, { title: "Delete Cache File" })) onDelete(f.name);
                      }}
                    >
                      <i className="fas fa-trash-alt" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
