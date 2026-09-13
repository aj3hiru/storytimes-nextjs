"use client";

import { useState } from "react";
import { MediaLibraryModal, type MediaLibraryItem } from "./MediaLibraryModal";

/**
 * Rebuilt to match the real post-manager.php exactly, fixing two real
 * bugs found by comparing against it directly:
 * 1. Clicking "Set Featured Image" went straight to the device's native
 *    file picker, with a SEPARATE "Browse Library" button alongside it
 *    for picking an existing image — the actual reference has ONE
 *    unified picker for both (`openFeaturedImageModal()` → the shared
 *    media-picker modal, which itself supports uploading AND browsing
 *    existing files) triggered by the button OR by clicking the
 *    preview image/placeholder itself. Removed the separate "Browse
 *    Library" button; the existing `MediaLibraryModal` component
 *    already supports upload-or-browse in one place, so both the
 *    button and the image/placeholder now open that same modal.
 * 2. The preview image/placeholder didn't already do anything when
 *    clicked — the reference makes the whole visual clickable
 *    (title="Click to replace image"), not just the text button below.
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
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lastExternalUrl, setLastExternalUrl] = useState(externalValue?.url);

  if (externalValue && externalValue.url !== lastExternalUrl) {
    setLastExternalUrl(externalValue.url);
    if (value !== externalValue.url) {
      setValue(externalValue.url);
      setMediaId(externalValue.mediaId);
    }
  }

  function handlePicked(item: MediaLibraryItem) {
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
      <div className="feat-img-visual">
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="feat-img-preview" src={value} alt="Featured image" title="Click to replace image" onClick={() => setPickerOpen(true)} />
        ) : (
          <div className="feat-img-placeholder" onClick={() => setPickerOpen(true)}>
            <i className="fas fa-image" />
            <span>Set featured image</span>
          </div>
        )}
        <div className={`feat-img-overlay${regenerating ? " show" : ""}`}>
          <span className="spin2" />
          <span className="feat-img-overlay-text">Generating thumbnail…</span>
        </div>
      </div>

      <div className="feat-img-actions">
        <button type="button" className="upload-label" onClick={() => setPickerOpen(true)} disabled={regenerating}>
          {value ? "\u21BB Replace Image" : "+ Set Featured Image"}
        </button>
        <button type="button" className="upload-label" onClick={handleRegenerate} disabled={regenerating} style={{ color: "#8b5cf6", borderColor: "#8b5cf6" }}>
          <i className={`fas ${regenerating ? "fa-spinner fa-spin" : "fa-wand-magic-sparkles"}`} /> {regenerating ? "Generating…" : "Regenerate Thumbnail (AI)"}
        </button>
      </div>

      {error && <div style={{ color: "var(--danger)", fontSize: "0.75rem", marginTop: "0.5rem" }}>{error}</div>}

      <span className="field-hint" style={{ display: "block", marginTop: "0.5rem" }}>
        Recommended 1280×720px. Automatic WebP conversion to ~50KB.
      </span>

      <input type="hidden" name={name} value={value} />
      <input type="hidden" name={mediaIdFieldName} value={mediaId} />

      <MediaLibraryModal open={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={handlePicked} />
    </div>
  );
}
