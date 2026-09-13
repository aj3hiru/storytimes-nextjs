"use client";

import { useEffect, useRef, useState } from "react";
import { uploadImageFast } from "@/lib/clientUpload";
import { resolveMediaUrl } from "@/lib/urls";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { useAdminDialogs } from "./AdminDialogProvider";
import { Portal } from "./Portal";

export interface MediaLibraryItem {
  id: number;
  path: string;
}

interface MediaImage {
  id: number;
  file_path: string;
}

export function MediaLibraryModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (item: MediaLibraryItem) => void;
}) {
  const [images, setImages] = useState<MediaImage[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const { confirm, notice } = useAdminDialogs();
  const [detail, setDetail] = useState({ title: "", alt_text: "", caption: "", description: "" });
  const [saveStatus, setSaveStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadPage(p: number, q: string) {
    setLoading(true);
    try {
      const res = await fetch(`/api/media/list?page=${p}&q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setImages(data.images ?? []);
      setPages(data.pages ?? 1);
      setPage(p);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open) {
      // Fetching fresh data when the modal opens is exactly the sanctioned
      // "synchronize with an external system" effect pattern — not a
      // derived-state anti-pattern.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadPage(1, "");
      setSelectedId(null);
      setSelectedPath(null);
    }
  }, [open]);

  async function handleSelect(item: MediaImage) {
    setSelectedId(item.id);
    setSelectedPath(item.file_path);
    setSaveStatus("");
    setDetail({ title: "", alt_text: "", caption: "", description: "" });
    try {
      const res = await fetch(`/api/media/${item.id}`);
      const d = await res.json();
      if (!d.error) {
        setDetail({ title: d.title ?? "", alt_text: d.alt_text ?? "", caption: d.caption ?? "", description: d.description ?? "" });
      }
    } catch {
      // best-effort — leave fields blank if the detail fetch fails
    }
  }

  function updateDetail(patch: Partial<typeof detail>) {
    setDetail((prev) => ({ ...prev, ...patch }));
    setSaveStatus("Saving…");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persistDetail({ ...detail, ...patch }), 600);
  }

  async function persistDetail(data: typeof detail) {
    if (!selectedId) return;
    const fd = new FormData();
    fd.set("title", data.title);
    fd.set("alt_text", data.alt_text);
    fd.set("caption", data.caption);
    fd.set("description", data.description);
    try {
      const res = await fetch(`/api/media/${selectedId}`, { method: "PATCH", body: fd });
      const d = await res.json();
      setSaveStatus(d.success ? "Saved" : d.error || "Save failed");
      setTimeout(() => setSaveStatus((s) => (s === "Saved" ? "" : s)), 1500);
    } catch {
      setSaveStatus("Save failed");
    }
  }

  async function handleDelete() {
    if (!selectedId) return;
    if (!(await confirm("Delete this image permanently?"))) return;
    try {
      const res = await fetch(`/api/media/${selectedId}`, { method: "DELETE" });
      const d = await res.json();
      if (d.success) {
        setSelectedId(null);
        setSelectedPath(null);
        loadPage(page, search);
      } else {
        notice(d.error ?? "Delete failed", { type: "error" });
      }
    } catch {
      notice("Delete failed", { type: "error" });
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      for (let i = 0; i < files.length; i++) {
        await uploadImageFast(files[i], "post");
        setUploadProgress(Math.round(((i + 1) / files.length) * 100));
      }
      await loadPage(1, search);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleCopyUrl() {
    if (!selectedPath) return;
    const url = `${window.location.origin}${resolveMediaUrl(selectedPath)}`;
    navigator.clipboard.writeText(url).catch(() => {});
  }

  useBodyScrollLock(open);
  if (!open) return null;

  return (
    <Portal>
    <div className="mlb-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mlb-box">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem 1.25rem", borderBottom: "1px solid var(--gray-200)" }}>
          <h3 style={{ margin: 0, fontSize: "1.05rem" }}>
            <i className="fas fa-images" /> Media Library
          </h3>
          <button type="button" onClick={onClose} style={{ border: "none", background: "none", fontSize: "1.3rem", cursor: "pointer" }}>
            ✕
          </button>
        </div>

        <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <div style={{ flex: 2, display: "flex", flexDirection: "column", padding: "1rem", borderRight: "1px solid var(--gray-200)", minWidth: 0 }}>
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
              <input
                type="text"
                placeholder="Search images…"
                className="form-control"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  loadPage(1, e.target.value);
                }}
                style={{ flex: 1 }}
              />
              <label className="btn btn-secondary" style={{ cursor: "pointer", margin: 0 }}>
                <i className="fas fa-upload" /> Upload
                <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(e) => handleUpload(e.target.files)} />
              </label>
            </div>

            {uploading && (
              <div style={{ marginBottom: "0.75rem", fontSize: "0.8rem", color: "var(--gray-600)" }}>Uploading… {uploadProgress}%</div>
            )}

            <div style={{ flex: 1, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: "0.5rem", alignContent: "start" }}>
              {loading ? (
                <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "2rem", color: "var(--gray-400)" }}>
                  <i className="fas fa-spinner fa-spin" />
                </div>
              ) : images.length === 0 ? (
                <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "2rem", color: "var(--gray-400)" }}>
                  <i className="fas fa-image" style={{ fontSize: "2rem", display: "block", marginBottom: "0.5rem" }} />
                  No images found
                </div>
              ) : (
                images.map((img) => (
                  <div
                    key={img.id}
                    onClick={() => handleSelect(img)}
                    style={{
                      aspectRatio: "1",
                      borderRadius: 6,
                      overflow: "hidden",
                      cursor: "pointer",
                      border: selectedId === img.id ? "2px solid var(--primary)" : "2px solid transparent",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={resolveMediaUrl(img.file_path)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                ))
              )}
            </div>

            {pages > 1 && (
              <div style={{ display: "flex", justifyContent: "center", gap: "0.75rem", marginTop: "0.75rem", fontSize: "0.85rem" }}>
                <button type="button" className="btn-action btn-edit" disabled={page <= 1} onClick={() => loadPage(page - 1, search)}>
                  « Prev
                </button>
                <span>
                  Page {page} of {pages}
                </span>
                <button type="button" className="btn-action btn-edit" disabled={page >= pages} onClick={() => loadPage(page + 1, search)}>
                  Next »
                </button>
              </div>
            )}
          </div>

          <div style={{ flex: 1, padding: "1rem", overflowY: "auto", minWidth: 260 }}>
            {!selectedId ? (
              <div style={{ textAlign: "center", color: "var(--gray-400)", paddingTop: "3rem" }}>
                <i className="fas fa-hand-pointer" style={{ fontSize: "1.5rem", display: "block", marginBottom: "0.5rem" }} />
                Select an image to view &amp; edit details
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resolveMediaUrl(selectedPath ?? "")} alt="" style={{ width: "100%", borderRadius: 8, maxHeight: 140, objectFit: "cover" }} />
                <div className="form-group">
                  <label>Title</label>
                  <input className="form-control" value={detail.title} onChange={(e) => updateDetail({ title: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Alt Text</label>
                  <input className="form-control" value={detail.alt_text} onChange={(e) => updateDetail({ alt_text: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Caption</label>
                  <textarea className="form-control" rows={2} value={detail.caption} onChange={(e) => updateDetail({ caption: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <textarea className="form-control" rows={2} value={detail.description} onChange={(e) => updateDetail({ description: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>File URL</label>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <input className="form-control" readOnly value={selectedPath ? `${typeof window !== "undefined" ? window.location.origin : ""}${resolveMediaUrl(selectedPath)}` : ""} />
                    <button type="button" className="btn-action btn-edit" onClick={handleCopyUrl}>
                      <i className="fas fa-copy" />
                    </button>
                  </div>
                </div>
                <span style={{ fontSize: "0.75rem", color: "var(--gray-500)" }}>{saveStatus}</span>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.5rem" }}>
                  <a href={selectedPath ? resolveMediaUrl(selectedPath) : "#"} download className="btn-action btn-view">
                    <i className="fas fa-download" /> Download
                  </a>
                  <button type="button" className="btn-action btn-delete" onClick={handleDelete}>
                    <i className="fas fa-trash" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.85rem 1.25rem", borderTop: "1px solid var(--gray-200)" }}>
          <span style={{ fontSize: "0.85rem", color: "var(--gray-500)" }}>
            {selectedPath ? `Selected: ${selectedPath.split("/").pop()}` : "No image selected"}
          </span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!selectedId || !selectedPath}
              onClick={() => {
                if (selectedId && selectedPath) {
                  onSelect({ id: selectedId, path: selectedPath });
                  onClose();
                }
              }}
            >
              <i className="fas fa-check" /> Use This Image
            </button>
          </div>
        </div>
      </div>
    </div>
    </Portal>
  );
}
