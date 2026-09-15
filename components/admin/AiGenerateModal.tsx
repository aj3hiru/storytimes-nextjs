"use client";

import { useState } from "react";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { Portal } from "./Portal";

export interface AiGenerateResult {
  title: string;
  content: string;
  metaDescription: string;
  metaKeywords: string;
  fbDescription: string;
  thumbnailPrompt: string;
  thumbnailBase64: string | null;
  thumbnailError: string | null;
  guidelineWarning: string | null;
}

interface ProgressStep {
  label: string;
  status: "pending" | "active" | "done" | "failed";
}

const STEP_ORDER = ["checking-keys", "thumbnail-prompt", "generating", "verifying"] as const;
const STEP_LABELS: Record<(typeof STEP_ORDER)[number], string> = {
  "checking-keys": "Checking API keys",
  "thumbnail-prompt": "Preparing thumbnail prompt",
  generating: "Writing article & generating thumbnail",
  verifying: "Verifying title, content & thumbnail",
};

/**
 * Rebuilt to show REAL step-by-step progress via Server-Sent Events
 * (an earlier pass showed a fake, hardcoded "Reading your shot list...
 * 8%" that never actually reflected what was happening) and to surface
 * two specific, actionable error states that were previously silent or
 * generic: no Gemini key configured at all, and Gemini present but no
 * Cloudflare key (thumbnails silently never generated with no
 * explanation). The thumbnail and article now genuinely run in
 * parallel — see /api/ai/generate/route.ts — and each reports its own
 * status independently as it finishes.
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
  const [warning, setWarning] = useState<string | null>(null);
  const [steps, setSteps] = useState<Record<string, ProgressStep["status"]>>({});
  const [thumbnailStatus, setThumbnailStatus] = useState<"idle" | "pending" | "done" | "failed">("idle");
  // Inline completion state, per explicit request: the success used to be
  // a separate popup fired after this modal had already closed, so the
  // person watched the progress list run and then got an unrelated dialog
  // to dismiss. The confirmation now lands in the same progress area they
  // were already looking at, and the modal closes itself shortly after.
  const [completed, setCompleted] = useState<{ note: string | null; isError: boolean } | null>(null);

  useBodyScrollLock(open);

  if (!open) return null;

  function resetProgress() {
    setSteps({});
    setThumbnailStatus("idle");
    setWarning(null);
    setError(null);
    setCompleted(null);
  }

  async function runGenerate(text: string) {
    if (!text.trim()) {
      setError("Please paste a video shot-list / prompt first.");
      return;
    }
    setLoading(true);
    resetProgress();

    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });

      if (!res.body) {
        setError("Streaming isn't supported by your browser — please try again or use a different browser.");
        setLoading(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith("data:")) continue;
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(line.slice(5).trim());
          } catch {
            continue;
          }
          handleEvent(event);
        }
      }
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }

    function handleEvent(event: Record<string, unknown>) {
      switch (event.type) {
        case "status": {
          const step = event.step as string;
          if (step === "no-cloudflare") {
            setWarning(event.message as string);
            return;
          }
          setSteps((prev) => {
            const next = { ...prev };
            const idx = STEP_ORDER.indexOf(step as (typeof STEP_ORDER)[number]);
            for (let i = 0; i < idx; i++) next[STEP_ORDER[i]] = "done";
            next[step] = "active";
            if (step === "generating") setThumbnailStatus((s) => (s === "idle" ? "pending" : s));
            return next;
          });
          break;
        }
        case "thumbnail": {
          setThumbnailStatus(event.status === "done" ? "done" : "failed");
          break;
        }
        case "complete": {
          setSteps((prev) => {
            const next = { ...prev };
            for (const s of STEP_ORDER) next[s] = "done";
            return next;
          });
          if (event.thumbnailError) setThumbnailStatus("failed");
          // Any caveat (a guideline warning, or a thumbnail that failed
          // while the article itself succeeded) is surfaced here inline
          // rather than as a popup in the parent form.
          const thumbErr = (event.thumbnailError as string | null) ?? null;
          const guideline = (event.guidelineWarning as string | null) ?? null;
          setCompleted({
            note: thumbErr
              ? `Thumbnail failed: ${thumbErr} — use "Regenerate Thumbnail" below.`
              : guideline,
            isError: Boolean(thumbErr),
          });
          onGenerated({
            title: (event.title as string) ?? "",
            content: (event.content as string) ?? "",
            metaDescription: (event.metaDescription as string) ?? "",
            metaKeywords: (event.metaKeywords as string) ?? "",
            fbDescription: (event.fbDescription as string) ?? "",
            thumbnailPrompt: (event.thumbnailPrompt as string) ?? "",
            thumbnailBase64: (event.thumbnailBase64 as string | null) ?? null,
            thumbnailError: (event.thumbnailError as string | null) ?? null,
            guidelineWarning: (event.guidelineWarning as string | null) ?? null,
          });
          // Give the confirmation a moment to actually be read before the
          // modal disappears; a caveat gets longer since it's worth reading.
          setTimeout(() => {
            onClose();
            setPrompt("");
          }, thumbErr || guideline ? 2600 : 1200);
          break;
        }
        case "error": {
          setError(event.message as string);
          break;
        }
      }
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
    <Portal>
    <div className="wp-modal-overlay open" onClick={loading ? undefined : onClose}>
      <div className="wp-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="wp-modal-head">
          <h2>
            <i className="fas fa-wand-magic-sparkles" style={{ marginRight: "0.5rem", color: "var(--primary)" }} />
            AI Generate Article
          </h2>
          <button type="button" className="wp-modal-close" onClick={onClose} disabled={loading}>
            ✕
          </button>
        </div>
        <div className="wp-modal-body">
          {!loading ? (
            <>
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
                Generates the full article, SEO fields, and a thumbnail — usually under a minute.
              </p>
            </>
          ) : (
            <div className="ai-progress-list">
              {STEP_ORDER.map((step) => (
                <div className="ai-progress-row" key={step}>
                  <ProgressIcon status={steps[step] ?? "pending"} />
                  <span>{STEP_LABELS[step]}</span>
                  {step === "generating" && thumbnailStatus !== "idle" && (
                    <span className="ai-progress-sub">
                      <ProgressIcon status={thumbnailStatus === "pending" ? "active" : thumbnailStatus} small />
                      Thumbnail {thumbnailStatus === "pending" ? "generating…" : thumbnailStatus === "done" ? "ready" : "failed"}
                    </span>
                  )}
                </div>
              ))}
              {completed && (
                <div className={`ai-progress-done${completed.isError ? " is-warn" : ""}`}>
                  <i className={`fas ${completed.isError ? "fa-triangle-exclamation" : "fa-circle-check"}`} />
                  <div>
                    <strong>Article generated successfully</strong>
                    {completed.note && <p>{completed.note}</p>}
                  </div>
                </div>
              )}
            </div>
          )}
          {warning && (
            <div className="alert alert-warning" style={{ marginTop: "0.75rem" }}>
              <i className="fas fa-triangle-exclamation" /> {warning}
            </div>
          )}
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
    </Portal>
  );
}

function ProgressIcon({ status, small }: { status: ProgressStep["status"]; small?: boolean }) {
  const size = small ? "0.7rem" : "0.85rem";
  if (status === "done") return <i className="fas fa-circle-check" style={{ color: "var(--success)", fontSize: size }} />;
  if (status === "failed") return <i className="fas fa-circle-xmark" style={{ color: "var(--danger)", fontSize: size }} />;
  if (status === "active") return <i className="fas fa-spinner fa-spin" style={{ color: "var(--primary)", fontSize: size }} />;
  return <i className="fas fa-circle" style={{ color: "var(--gray-300)", fontSize: size }} />;
}
