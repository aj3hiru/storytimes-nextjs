"use client";

import { useRef, useState } from "react";
import { MediaLibraryModal, type MediaLibraryItem } from "./MediaLibraryModal";
import { uploadImageFast } from "@/lib/clientUpload";

export function ImageUploadField({
  name,
  purpose,
  label,
  defaultValue,
  mediaIdFieldName,
  showLibraryButton = true,
}: {
  name: string;
  purpose: "logo" | "favicon" | "author" | "post";
  label: string;
  defaultValue?: string;
  /** Optional — if given, also renders a hidden field with the uploaded
   *  media row's id (needed when the form wants to link a post to a
   *  specific `media` row, not just store a URL). */
  mediaIdFieldName?: string;
  /** Shows a "Browse Library" button that opens the shared Media Library
   *  modal to pick an existing image instead of uploading a new one. */
  showLibraryButton?: boolean;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [mediaId, setMediaId] = useState<number | "">("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const result = await uploadImageFast(file, purpose);
      setValue(result.url);
      setMediaId(result.mediaId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleLibrarySelect(item: MediaLibraryItem) {
    setValue(`/${item.path.replace(/^\/+/, "")}`);
    setMediaId(item.id);
  }

  return (
    <div className="form-group">
      <label>{label}</label>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        {value && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, border: "1px solid var(--gray-200)" }} />
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={uploading}
          className="form-control"
          style={{ maxWidth: 260 }}
        />
        {showLibraryButton && (
          <button type="button" className="btn-action btn-edit" onClick={() => setLibraryOpen(true)}>
            <i className="fas fa-images" /> Browse Library
          </button>
        )}
        {uploading && <span style={{ fontSize: "0.8rem", color: "var(--gray-500)" }}>Uploading…</span>}
      </div>
      {error && <div style={{ color: "var(--danger)", fontSize: "0.75rem", marginTop: "0.25rem" }}>{error}</div>}
      {/* The path this form actually submits — the file input above never
          submits its raw contents; only the already-uploaded URL does. */}
      <input type="hidden" name={name} value={value} />
      {mediaIdFieldName && <input type="hidden" name={mediaIdFieldName} value={mediaId} />}

      <MediaLibraryModal open={libraryOpen} onClose={() => setLibraryOpen(false)} onSelect={handleLibrarySelect} />
    </div>
  );
}
