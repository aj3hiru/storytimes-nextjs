"use client";

import { useState } from "react";

export function RegenerateThumbnailButton() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    const titleInput = document.getElementById("title") as HTMLInputElement | null;
    const promptInput = document.getElementById("thumbnailPrompt") as HTMLInputElement | null;
    const title = titleInput?.value?.trim() ?? "";
    const thumbnailPrompt = promptInput?.value?.trim() ?? "";

    if (!title && !thumbnailPrompt) {
      setError("Enter a title or thumbnail prompt first.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/regenerate-thumbnail", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, thumbnailPrompt }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error ?? "Failed to regenerate thumbnail.");
        return;
      }

      const urlInput = document.querySelector('input[name="featuredImageUrl"]') as HTMLInputElement | null;
      const idInput = document.querySelector('input[name="featuredImageId"]') as HTMLInputElement | null;
      if (urlInput) urlInput.value = data.imageUrl;
      if (idInput) idInput.value = String(data.mediaId);
      const preview = urlInput?.closest(".form-group")?.querySelector("img") as HTMLImageElement | null;
      if (preview) preview.src = data.imageUrl;
    } catch {
      setError("Failed to regenerate thumbnail. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      <button type="button" className="btn-action btn-edit" onClick={handleClick} disabled={loading}>
        {loading ? "Generating…" : "Regenerate Thumbnail (AI)"}
      </button>
      {error && <span style={{ color: "var(--danger)", fontSize: "0.75rem" }}>{error}</span>}
    </div>
  );
}
