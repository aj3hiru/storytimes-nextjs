"use client";

import { useRef, useState } from "react";
import { useAdminDialogs } from "./AdminDialogProvider";
import { resolveMediaUrl } from "@/lib/urls";

export interface MediaItem {
  id: number;
  filePath: string;
  fileType: string;
  url: string;
  fileName: string;
}

const TYPE_ICONS: Record<string, string> = {
  pdf: "fa-file-pdf",
  video: "fa-file-video",
  audio: "fa-file-audio",
  document: "fa-file-lines",
  archive: "fa-file-zipper",
};

function isImageType(t: string) {
  return t === "image" || t === "banner";
}

function showToast(msg: string, type: "success" | "error") {
  const t = document.createElement("div");
  t.style.cssText = `position:fixed;bottom:1.5rem;right:1.5rem;padding:.75rem 1.25rem;border-radius:8px;font-size:.875rem;font-weight:500;z-index:9999;box-shadow:0 4px 16px rgba(0,0,0,.15);color:#fff;background:${type === "success" ? "#059669" : "#dc2626"};`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

/**
 * Rebuilt to match the actual newbase.fast2tricks.com reference exactly:
 * drag-and-drop / click-to-browse upload (any file type up to 50MB, not
 * just images), search + type/uploader filter + per-page (server-side,
 * via GET so results/pagination/filters share one URL that can be
 * bookmarked/shared), multi-select mode with bulk download-as-zip and
 * bulk delete, and a click-to-open detail modal for editing a file's
 * alt text / title / caption / description and copying its URL — none
 * of which existed in an earlier pass here at all.
 */
export function FileManagerClient({
  items: initialItems,
  stats,
  uploaders,
  currentType,
  currentUploader,
  currentSearch,
  currentPerPage,
  page,
  totalPages,
  totalFiltered,
  typeCounts,
}: {
  items: MediaItem[];
  stats: { total: number; images: number; banners: number };
  uploaders: { id: number; username: string }[];
  currentType: string;
  currentUploader: string;
  currentSearch: string;
  currentPerPage: number;
  page: number;
  totalPages: number;
  totalFiltered: number;
  typeCounts: Record<string, number>;
}) {
  const { confirm, notice } = useAdminDialogs();
  const [items, setItems] = useState(initialItems);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState<{ current: number; total: number; name: string } | null>(null);
  const [detailItem, setDetailItem] = useState<MediaItem | null>(null);
  const [detailFields, setDetailFields] = useState({ alt: "", title: "", caption: "", description: "" });
  const [detailSaving, setDetailSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function toggleSelectionMode() {
    setSelectionMode((v) => {
      if (v) setSelectedIds(new Set());
      return !v;
    });
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleItemClick(e: React.MouseEvent, item: MediaItem) {
    if (selectionMode || e.ctrlKey || e.metaKey) {
      toggleSelect(item.id);
    } else {
      openDetail(item);
    }
  }

  function selectAllVisible() {
    if (!selectionMode) setSelectionMode(true);
    setSelectedIds(new Set(items.map((i) => i.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  async function bulkDelete() {
    if (selectedIds.size === 0) return;
    const ok = await confirm(`${selectedIds.size} selected file(s) will be permanently deleted.`, { title: "Delete Files" });
    if (!ok) return;
    try {
      const res = await fetch("/api/media/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      const data = await res.json();
      if (data.success) {
        setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)));
        setSelectedIds(new Set());
        showToast(`Deleted ${data.deleted} file(s) successfully.`, "success");
      } else {
        showToast(`Error: ${data.error ?? "Unknown"}`, "error");
      }
    } catch {
      showToast("Network error.", "error");
    }
  }

  async function bulkDownload() {
    if (selectedIds.size === 0) return;
    showToast("Preparing zip…", "success");
    try {
      const res = await fetch("/api/media/bulk-download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [...selectedIds] }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast(`Error: ${data.error ?? "Download failed"}`, "error");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `files-${Date.now()}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showToast("Network error.", "error");
    }
  }

  async function doUpload(files: FileList | File[]) {
    const arr = Array.from(files);
    if (!arr.length) return;
    for (let i = 0; i < arr.length; i++) {
      const file = arr[i];
      setUploading({ current: i + 1, total: arr.length, name: file.name });
      const fd = new FormData();
      fd.append("file", file);
      try {
        const res = await fetch("/api/media/upload-file", { method: "POST", body: fd });
        const data = await res.json();
        if (data.success) {
          setItems((prev) => [
            { id: data.id, filePath: data.path, fileType: data.file_type, url: resolveMediaUrl(data.path), fileName: file.name },
            ...prev,
          ]);
          showToast(`Uploaded: ${file.name}`, "success");
        } else {
          showToast(`Failed: ${file.name} — ${data.error ?? "Unknown"}`, "error");
        }
      } catch {
        showToast(`Failed: ${file.name} — network error`, "error");
      }
    }
    setUploading(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function openDetail(item: MediaItem) {
    setDetailItem(item);
    setDetailFields({ alt: "", title: "", caption: "", description: "" });
    fetch(`/api/media/${item.id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) return;
        setDetailFields({ alt: d.alt_text ?? "", title: d.title ?? "", caption: d.caption ?? "", description: d.description ?? "" });
      })
      .catch(() => {});
  }

  async function saveDetail() {
    if (!detailItem) return;
    setDetailSaving(true);
    const fd = new FormData();
    fd.append("alt_text", detailFields.alt);
    fd.append("title", detailFields.title);
    fd.append("caption", detailFields.caption);
    fd.append("description", detailFields.description);
    try {
      const res = await fetch(`/api/media/${detailItem.id}`, { method: "PATCH", body: fd });
      const data = await res.json();
      if (data.success) {
        showToast("Details saved.", "success");
      } else {
        showToast(`Error: ${data.error ?? "Unknown"}`, "error");
      }
    } catch {
      showToast("Network error.", "error");
    } finally {
      setDetailSaving(false);
    }
  }

  async function deleteFromModal() {
    if (!detailItem) return;
    const ok = await confirm("This file will be permanently deleted.", { title: "Delete File" });
    if (!ok) return;
    try {
      const res = await fetch(`/api/media/${detailItem.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setItems((prev) => prev.filter((i) => i.id !== detailItem.id));
        setDetailItem(null);
        showToast("File deleted.", "success");
      } else {
        showToast(`Error: ${data.error ?? "Unknown"}`, "error");
      }
    } catch {
      showToast("Network error.", "error");
    }
  }

  function copyDetailUrl() {
    if (!detailItem) return;
    const fullUrl = `${window.location.origin}${detailItem.url}`;
    navigator.clipboard.writeText(fullUrl).then(
      () => showToast("URL copied!", "success"),
      () => notice("Couldn't copy automatically — select and copy manually.", { type: "error" })
    );
  }

  function buildPageUrl(targetPage: number) {
    const params = new URLSearchParams();
    if (currentSearch) params.set("q", currentSearch);
    if (currentType !== "all") params.set("type", currentType);
    if (currentUploader !== "all") params.set("uploader", currentUploader);
    params.set("fm_per_page", String(currentPerPage));
    params.set("fm_page", String(targetPage));
    return `/admin/file-manager?${params.toString()}`;
  }

  return (
    <div>
      <div className="fm-stats">
        <div className="fm-stat">
          Total Files: <strong>{stats.total}</strong>
        </div>
        <div className="fm-stat">
          Images: <strong>{stats.images}</strong>
        </div>
        <div className="fm-stat">
          Banners: <strong>{stats.banners}</strong>
        </div>
      </div>

      <div
        className={`fm-upload-card${dragOver ? " drag-over" : ""}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) doUpload(e.dataTransfer.files);
        }}
      >
        <i className="fas fa-cloud-upload-alt" />
        <p>
          Drag &amp; drop files here or <span>browse to upload</span>
        </p>
        <p style={{ fontSize: ".75rem", marginTop: ".3rem", color: "var(--gray-400)" }}>
          Images, PDFs, Videos, Audio, Docs, ZIPs — max 50MB
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          style={{ display: "none" }}
          accept="image/*,.pdf,.mp4,.webm,.ogg,.mov,.avi,.mkv,.mp3,.wav,.aac,.flac,.m4a,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.tar,.gz,.7z"
          onChange={(e) => {
            if (e.target.files?.length) doUpload(e.target.files);
          }}
          onClick={(e) => e.stopPropagation()}
        />
        {uploading && (
          <div className="upload-progress" style={{ display: "block" }}>
            <div className="upload-progress-bar">
              <div className="upload-progress-fill" style={{ width: `${Math.round((uploading.current / uploading.total) * 100)}%` }} />
            </div>
            <div className="upload-progress-text">
              Uploading: {uploading.name} ({uploading.current}/{uploading.total})
            </div>
          </div>
        )}
      </div>

      <div className="fm-toolbar">
        <div className="fm-toolbar-left">
          <form method="GET" style={{ display: "flex", gap: ".5rem", alignItems: "center", flexWrap: "wrap" }}>
            <input type="hidden" name="type" value={currentType} />
            <input type="hidden" name="fm_page" value="1" />
            <div className="fm-search">
              <i className="fas fa-search" />
              <input type="text" name="q" placeholder="Search files..." defaultValue={currentSearch} />
            </div>
            {uploaders.length > 0 && (
              <select name="uploader" className="btn btn-secondary" style={{ padding: ".4rem .75rem", fontSize: ".8rem" }} defaultValue={currentUploader} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
                <option value="all">All Users</option>
                {uploaders.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username}
                  </option>
                ))}
              </select>
            )}
            <select name="fm_per_page" className="btn btn-secondary" style={{ padding: ".4rem .75rem", fontSize: ".8rem" }} defaultValue={currentPerPage} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
              <option value={20}>20 per page</option>
              <option value={50}>50 per page</option>
              <option value={100}>100 per page</option>
            </select>
            <button type="submit" className="btn btn-secondary" style={{ padding: ".4rem .75rem", fontSize: ".8rem" }}>
              Search
            </button>
          </form>
        </div>
        <div className="fm-toolbar-right">
          <button className="btn btn-secondary" onClick={toggleSelectionMode} title="Enable multi-select mode" type="button">
            <i className={`fas ${selectionMode ? "fa-times" : "fa-check-square"}`} /> {selectionMode ? "Done" : "Select"}
          </button>
          <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()} type="button">
            <i className="fas fa-plus" /> Upload Files
          </button>
        </div>
      </div>

      <div className="fm-filter-tabs">
        {(["all", "image", "banner"] as const).map((t) => (
          <a
            key={t}
            href={`/admin/file-manager?type=${t}${currentUploader !== "all" ? `&uploader=${currentUploader}` : ""}`}
            className={`fm-tab${currentType === t ? " active" : ""}`}
          >
            {t === "all" ? "All Files" : t === "image" ? "Images" : "Banners"}
            <span className="cnt">{typeCounts[t] ?? 0}</span>
          </a>
        ))}
      </div>

      <div className={`fm-bulk-bar${selectionMode || selectedIds.size > 0 ? " visible" : ""}`}>
        <span className="fm-bulk-count">{selectedIds.size} selected</span>
        <button className="btn btn-secondary" onClick={selectAllVisible} type="button">
          Select All
        </button>
        <button className="btn btn-secondary" onClick={bulkDownload} type="button">
          <i className="fas fa-download" /> Download Selected
        </button>
        <button className="btn btn-danger" onClick={bulkDelete} type="button">
          <i className="fas fa-trash" /> Delete Selected
        </button>
        <button className="btn btn-secondary" onClick={clearSelection} type="button">
          Cancel
        </button>
      </div>

      {items.length === 0 ? (
        <div className="fm-empty">
          <i className="fas fa-folder-open" />
          No files found.
        </div>
      ) : (
        <div className={`fm-grid${selectionMode ? " selection-mode-active" : ""}`}>
          {items.map((item) => {
            const ext = item.fileName.split(".").pop()?.toUpperCase() ?? "";
            const isImg = isImageType(item.fileType);
            return (
              <div
                key={item.id}
                className={`fm-item${selectedIds.has(item.id) ? " selected" : ""}`}
                onClick={(e) => handleItemClick(e, item)}
              >
                <div className="fm-item-check">
                  <i className="fas fa-check" />
                </div>
                {isImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="fm-item-thumb" src={item.url} alt={item.fileName} loading="lazy" />
                ) : (
                  <div className={`fm-item-icon ${item.fileType}`}>
                    <i className={`fas ${TYPE_ICONS[item.fileType] ?? "fa-file"}`} />
                  </div>
                )}
                <div className="fm-item-info">
                  <div className="fm-item-name" title={item.fileName}>
                    {item.fileName}
                  </div>
                  <div className="fm-item-type">
                    {ext} &bull; {item.fileType}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="fm-pagination">
        <a href={buildPageUrl(Math.max(1, page - 1))} className={`fm-page-btn${page <= 1 ? " disabled" : ""}`}>
          &laquo; Prev
        </a>
        <span className="fm-page-info">
          Page {page} of {totalPages} &middot; {totalFiltered} files
        </span>
        <a href={buildPageUrl(Math.min(totalPages, page + 1))} className={`fm-page-btn${page >= totalPages ? " disabled" : ""}`}>
          Next &raquo;
        </a>
      </div>

      {detailItem && (
        <div className="fm-modal-overlay open" onClick={() => setDetailItem(null)}>
          <div className="fm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="fm-modal-header">
              <h3>{detailItem.fileName}</h3>
              <button className="fm-modal-close" onClick={() => setDetailItem(null)} type="button">
                &times;
              </button>
            </div>
            <div className="fm-modal-body">
              <div className="fm-modal-preview">
                {isImageType(detailItem.fileType) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={detailItem.url} alt="" />
                ) : (
                  <div className="icon-preview">
                    <i className={`fas ${TYPE_ICONS[detailItem.fileType] ?? "fa-file"}`} />
                  </div>
                )}
                <div className="fm-file-meta">
                  <strong>{detailItem.fileName.split(".").pop()?.toUpperCase()}</strong> file
                  <br />
                  {detailItem.fileName}
                </div>
              </div>
              <div className="fm-modal-fields">
                <div className="fm-field">
                  <label>
                    Alt Text <small style={{ color: "var(--gray-400)" }}>(for images - SEO &amp; accessibility)</small>
                  </label>
                  <input
                    type="text"
                    value={detailFields.alt}
                    onChange={(e) => setDetailFields((f) => ({ ...f, alt: e.target.value }))}
                    placeholder="e.g. Team photo at annual event"
                  />
                </div>
                <div className="fm-field">
                  <label>Title</label>
                  <input
                    type="text"
                    value={detailFields.title}
                    onChange={(e) => setDetailFields((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Image or file title"
                  />
                </div>
                <div className="fm-field">
                  <label>Caption</label>
                  <textarea
                    rows={2}
                    value={detailFields.caption}
                    onChange={(e) => setDetailFields((f) => ({ ...f, caption: e.target.value }))}
                    placeholder="Short caption shown below the image"
                  />
                </div>
                <div className="fm-field">
                  <label>Description</label>
                  <textarea
                    rows={2}
                    value={detailFields.description}
                    onChange={(e) => setDetailFields((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Longer description (optional)"
                  />
                </div>
                <div className="fm-field">
                  <label>File URL</label>
                  <div className="url-row">
                    <input type="text" readOnly value={typeof window !== "undefined" ? `${window.location.origin}${detailItem.url}` : detailItem.url} />
                    <button className="copy-btn" onClick={copyDetailUrl} type="button">
                      <i className="fas fa-copy" /> Copy
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div className="fm-modal-footer">
              <div className="fm-modal-footer-left">
                <button className="btn btn-danger" onClick={deleteFromModal} type="button">
                  <i className="fas fa-trash" /> Delete
                </button>
                <a href={detailItem.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                  <i className="fas fa-external-link-alt" /> Open
                </a>
              </div>
              <div style={{ display: "flex", gap: ".5rem" }}>
                <button className="btn btn-secondary" onClick={() => setDetailItem(null)} type="button">
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={saveDetail} disabled={detailSaving} type="button">
                  <i className={`fas ${detailSaving ? "fa-spinner fa-spin" : "fa-save"}`} /> {detailSaving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
