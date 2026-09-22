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

// Matches the parallel pipeline in /api/ai/generate/route.ts: plan first,
// then every piece of the article written at the same time.
const STEP_ORDER = ["checking-keys", "planning", "writing", "verifying"] as const;
const STEP_LABELS: Record<(typeof STEP_ORDER)[number], string> = {
  "checking-keys": "Checking API keys",
  planning: "Planning the story, SEO & thumbnail",
  writing: "Writing the chapters in parallel",
  verifying: "Putting it all together",
};

type PartStatus = "active" | "done" | "failed";

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
  // The individual pieces written in parallel (intro, each chapter, SEO),
  // each reported as it finishes — drives both the list shown under the
  // "writing" step and the real percentage in the progress bar.
  const [parts, setParts] = useState<{ key: string; label: string; status: PartStatus }[]>([]);
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
    setParts([]);
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
      // Whether the server sent a final "complete" or "error". If the
      // stream ends without one, the connection was cut somewhere between
      // this app's server and the browser — that used to leave the modal
      // silently stuck with no message at all.
      let finished = false;

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
          if (event.type === "complete" || event.type === "error") finished = true;
          handleEvent(event);
        }
      }
      if (!finished) {
        setError(
          "The connection to the server closed before the article finished. This is a server/proxy timeout, not your internet — please try again."
        );
      }
    } catch {
      // Reached when the stream is cut mid-generation, not only on a real
      // offline connection — the old "Network error" wording pointed people
      // at their own internet when the drop was almost always server-side.
      setError(
        "Lost the connection to the server while generating. If your internet is working, the server or its proxy dropped the connection — please try again."
      );
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
            // The thumbnail starts at the same moment planning does.
            if (step === "planning" || step === "writing") setThumbnailStatus((s) => (s === "idle" ? "pending" : s));
            return next;
          });
          break;
        }
        case "parts": {
          const list = (event.parts as { key: string; label: string }[]) ?? [];
          setParts(list.map((p) => ({ ...p, status: "active" as PartStatus })));
          break;
        }
        case "part": {
          const key = event.key as string;
          const status = event.status === "done" ? "done" : "failed";
          // A part that failed can be retried by the server and then
          // succeed, so a later "done" always replaces an earlier "failed".
          setParts((prev) => prev.map((p) => (p.key === key ? { ...p, status } : p)));
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
                Plans the story (with SEO and thumbnail), then writes every chapter at the same time across your API keys.
              </p>
            </>
          ) : (
            <div className="ai-progress-list">
              {/* Real percentage, not a fake animated one — per explicit
                  request, brought back alongside the step list (see the
                  comment on generate/route.ts for why a hardcoded fake
                  percentage was removed before). Derived from actual
                  completed/active steps: each fully-done step counts as a
                  whole step, the currently-active one counts as half —
                  genuine progress through real, known phases, not a timer
                  guessing at how long generation might take. */}
              <ProgressBar
                steps={steps}
                isComplete={Boolean(completed)}
                writingFraction={parts.length > 0 ? parts.filter((p) => p.status === "done").length / parts.length : 0}
              />
              {STEP_ORDER.map((step) => (
                <div className="ai-progress-row" key={step}>
                  <ProgressIcon status={steps[step] ?? "pending"} />
                  <span>{STEP_LABELS[step]}</span>
                  {step === "writing" &&
                    parts.map((p) => (
                      <span className="ai-progress-sub" key={p.key}>
                        <ProgressIcon status={p.status} small />
                        {p.label}
                        {p.status === "failed" ? " — retrying…" : ""}
                      </span>
                    ))}
                  {step === "writing" && thumbnailStatus !== "idle" && (
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
            <div className="alert alert-warning" style={{ marginTop: "0.75rem", flexWrap: "wrap" }}>
              <i className="fas fa-triangle-exclamation" />
              <span style={{ minWidth: 0, wordBreak: "break-word" }}>{warning}</span>
            </div>
          )}
          {error && (
            // Real bug fixed here — this used class "alert-danger", which
            // has no matching CSS rule anywhere in this project (only
            // .alert-error/.alert-success/.alert-warning are defined).
            // The error rendered with no background/border/text-color at
            // all — and separately, .alert has no flex-wrap, so a long
            // Gemini error message (these can run to a full sentence or
            // more) could overflow past the modal's edge on a narrow
            // mobile screen instead of wrapping. Both fixed: the correct
            // class name, and an inline wrap override scoped to just
            // this alert rather than changing .alert's shared behavior
            // for every other place it's used across the admin panel.
            <div className="alert alert-error" style={{ marginTop: "0.5rem", flexWrap: "wrap" }}>
              <i className="fas fa-circle-exclamation" />
              <span style={{ minWidth: 0, wordBreak: "break-word" }}>{error}</span>
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

/**
 * Real, step-derived percentage — per explicit request, added back
 * alongside the honest step-by-step list rather than replacing it (see
 * the comment on generate/route.ts explaining why a fake, hardcoded
 * percentage was removed in an earlier pass). Each fully-completed step
 * in STEP_ORDER counts as one whole unit; the currently-active step
 * counts as half, since it's genuinely in progress but not done — this
 * is computed purely from real server-reported step transitions, never
 * a timer or animation guessing at how long generation might take.
 */
function ProgressBar({
  steps,
  isComplete,
  writingFraction,
}: {
  steps: Record<string, ProgressStep["status"]>;
  isComplete: boolean;
  /** Share of the parallel pieces (intro, chapters, SEO) already finished. */
  writingFraction: number;
}) {
  // Weighted by how much of the real work each step is. Writing is most of
  // it, and moves forward piece by piece as each part actually finishes —
  // still derived only from real server events, never a timer.
  const WEIGHTS: Record<(typeof STEP_ORDER)[number], number> = {
    "checking-keys": 5,
    planning: 15,
    writing: 70,
    verifying: 10,
  };
  const units = STEP_ORDER.reduce((sum, step) => {
    const status = steps[step] ?? "pending";
    if (status === "done") return sum + WEIGHTS[step];
    if (status === "active") return sum + WEIGHTS[step] * (step === "writing" ? writingFraction : 0.5);
    return sum;
  }, 0);
  const pct = isComplete ? 100 : Math.min(99, Math.round(units));

  return (
    <div className="ai-progress-bar-wrap">
      <div className="ai-progress-bar-track">
        <div className="ai-progress-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="ai-progress-bar-pct">{pct}%</span>
    </div>
  );
}

function ProgressIcon({ status, small }: { status: ProgressStep["status"]; small?: boolean }) {
  const size = small ? "0.7rem" : "0.85rem";
  if (status === "done") return <i className="fas fa-circle-check" style={{ color: "var(--success)", fontSize: size }} />;
  if (status === "failed") return <i className="fas fa-circle-xmark" style={{ color: "var(--danger)", fontSize: size }} />;
  if (status === "active") return <i className="fas fa-spinner fa-spin" style={{ color: "var(--primary)", fontSize: size }} />;
  return <i className="fas fa-circle" style={{ color: "var(--gray-300)", fontSize: size }} />;
}
