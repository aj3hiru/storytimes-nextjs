"use client";

import { useState } from "react";

export interface AiGenerateResult {
  title: string;
  content: string;
  metaDescription: string;
  metaKeywords: string;
  fbDescription: string;
  thumbnailPrompt: string;
  thumbnailBase64: string | null;
}

/**
 * Rebuilt to match the actual newbase.fast2tricks.com reference exactly —
 * an earlier pass replaced this whole feature with a plain `<Link
 * href="/admin/ai-features">` (a dead-end link to a different page,
 * doing nothing on this one) instead of the real in-page modal. The
 * backend (/api/ai/generate) already did everything needed; only the
 * UI to actually call it was missing.
 */
export function AiGenerateModal({
  open,
  onClose,
  onGenerated,
}: {
  open: boolean;
  onClose: () => void;
  onGenerated: (result: AiGenerateResult) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function runGenerate(text: string) {
    if (!text.trim()) {
      setError("Please paste a video shot-list / prompt first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message ?? "Generation failed");
        return;
      }
      onGenerated({
        title: data.title ?? "",
        content: data.content ?? "",
        metaDescription: data.metaDescription ?? "",
        metaKeywords: data.metaKeywords ?? "",
        fbDescription: data.fbDescription ?? "",
        thumbnailPrompt: data.thumbnailPrompt ?? "",
        thumbnailBase64: data.thumbnailBase64 ?? null,
      });
      onClose();
      setPrompt("");
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePasteAndGenerate() {
    try {
      const clipboardText = await navigator.clipboard.readText();
      setPrompt(clipboardText);
      await runGenerate(clipboardText);
    } catch {
      setError("Couldn't read clipboard — paste manually into the box and click Generate instead.");
    }
  }

  return (
    <div className="wp-modal-overlay open" onClick={onClose}>
      <div className="wp-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="wp-modal-head">
          <h2>
            <i className="fas fa-wand-magic-sparkles" style={{ marginRight: "0.5rem", color: "var(--primary)" }} />
            AI Generate Article
          </h2>
          <button type="button" className="wp-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="wp-modal-body">
          <label htmlFor="ai-shotlist" style={{ fontWeight: 600, fontSize: "0.875rem", display: "block", marginBottom: "0.5rem" }}>
            Paste your video shot-list (scene | shot type | camera move | dialogue/SFX | visual)
          </label>
          <textarea
            id="ai-shotlist"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder={'Paste your scene-by-scene shot list — e.g. | 1 | Medium Shot | Static | Voice (...): "..." | visual description | duration |'}
            rows={5}
            style={{ width: "100%", resize: "vertical" }}
            autoFocus
          />
          <p style={{ fontSize: "0.8125rem", color: "var(--gray-500)", marginTop: "0.5rem" }}>
            Generates the full story (title + chapters), SEO fields, a thumbnail image, a Facebook description, and a
            thumbnail prompt — all from this one shot list. You can edit everything after it&apos;s generated. This
            takes 1-2 minutes.
          </p>
          {error && (
            <div className="alert alert-danger" style={{ marginTop: "0.5rem" }}>
              {error}
            </div>
          )}
        </div>
        <div className="wp-modal-foot" style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="button" className="btn btn-secondary" onClick={handlePasteAndGenerate} disabled={loading}>
            <i className="fas fa-clipboard" /> Paste &amp; Generate
          </button>
          <button type="button" className="btn btn-primary" onClick={() => runGenerate(prompt)} disabled={loading}>
            <i className={`fas ${loading ? "fa-spinner fa-spin" : "fa-wand-magic-sparkles"}`} />{" "}
            {loading ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
