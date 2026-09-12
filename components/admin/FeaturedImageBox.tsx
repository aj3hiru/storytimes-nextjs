"use client";

import { useRef, useState } from "react";
import { MediaLibraryModal, type MediaLibraryItem } from "./MediaLibraryModal";
import { uploadImageFast } from "@/lib/clientUpload";

/**
 * Rebuilt to match the newbase.fast2tricks.com reference: a placeholder
 * box ("Set featured image"), a "+ Set Featured Image" button, and a
 * "Regenerate Thumbnail (AI)" button that calls the existing Cloudflare-
 * backed /api/ai/regenerate-thumbnail endpoint — an earlier pass had
 * only a plain file input with no regenerate capability wired into the
 * UI at all, even though the backend for it already existed.
 */
export function FeaturedImageBox({
  name,
  mediaIdFieldName,
  defaultValue,
  title,
  thumbnailPrompt,
  externalValue,
}: {
  name: string;
  mediaIdFieldName: string;
  defaultValue?: string;
  /** Current post title — used as the regenerate prompt fallback if no
   *  thumbnail prompt is set yet. */
  title: string;
  /** Current thumbnail prompt — preferred regenerate prompt. */
  thumbnailPrompt: string;
  /** Lets a parent (AI Generate) push a freshly-generated image in from
   *  outside, overriding whatever the user picked manually. */
  externalValue?: { url: string; mediaId: number } | null;
}) {
  const [value, setValue] = useState(externalValue?.url ?? defaultValue ?? "");
  const [mediaId, setMediaId] = useState<number | "">(externalValue?.mediaId ?? "");
  const [uploading, setUploading] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [lastExternalUrl, setLastExternalUrl] = useState(externalValue?.url);

  // Sync when the parent pushes a new AI-generated image (e.g. right
  // after AI Generate completes) — compares against the last value seen
  // (tracked in state, not a ref, so this stays a valid "derive state
  // during render" pattern rather than a disallowed render-time ref
  // read/write) rather than running unconditionally, so it doesn't
  // fight with the user's own later manual upload/library pick.
  if (externalValue && externalValue.url !== lastExternalUrl) {
    setLastExternalUrl(externalValue.url);
    if (value !== externalValue.url) {
      setValue(externalValue.url);
      setMediaId(externalValue.mediaId);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const result = await uploadImageFast(file, "post");
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

  async function handleRegenerate() {
    setRegenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/regenerate-thumbnail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thumbnailPrompt, title }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error ?? "Thumbnail generation failed");
        return;
      }
      setValue(data.imageUrl);
      setMediaId(data.mediaId);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div>
      <div className="featured-image-preview">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="" style={{ width: "100%", height: "auto", borderRadius: 8, display: "block" }} />
        ) : (
          <div className="featured-image-placeholder">
            <i className="fas fa-image" />
            <span>Set featured image</span>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={uploading || regenerating}
        style={{ display: "none" }}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.75rem" }}>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ width: "100%" }}
          onClick={() => inputRef.current?.click()}
          disabled={uploading || regenerating}
        >
          <i className="fas fa-plus" /> {uploading ? "Uploading…" : value ? "Change Featured Image" : "Set Featured Image"}
        </button>
        <button type="button" className="btn-action btn-edit" style={{ width: "100%", justifyContent: "center" }} onClick={() => setLibraryOpen(true)}>
          <i className="fas fa-images" /> Browse Library
        </button>
        <button
          type="button"
          className="btn btn-ai-generate"
          style={{ width: "100%", justifyContent: "center" }}
          onClick={handleRegenerate}
          disabled={regenerating || uploading}
        >
          <i className={`fas ${regenerating ? "fa-spinner fa-spin" : "fa-wand-magic-sparkles"}`} />{" "}
          {regenerating ? "Generating…" : "Regenerate Thumbnail (AI)"}
        </button>
      </div>

      {error && <div style={{ color: "var(--danger)", fontSize: "0.75rem", marginTop: "0.5rem" }}>{error}</div>}

      <span className="field-hint" style={{ display: "block", marginTop: "0.5rem" }}>
        Recommended 1280×720px. Automatic WebP conversion to ~50KB.
      </span>

      <input type="hidden" name={name} value={value} />
      <input type="hidden" name={mediaIdFieldName} value={mediaId} />

      <MediaLibraryModal open={libraryOpen} onClose={() => setLibraryOpen(false)} onSelect={handleLibrarySelect} />
    </div>
  );
}
