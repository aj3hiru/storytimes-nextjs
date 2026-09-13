"use client";

import { useState } from "react";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { Portal } from "./Portal";

/**
 * Ports the real #asset-view-modal from post-manager.php exactly — a
 * full-page overlay modal with a readonly textarea and a Copy button.
 *
 * Real UX gap fixed here (explicit request): the Copy button is now
 * compact/minimal instead of a full-width secondary button, shows
 * "Copied!" the moment the copy succeeds, and auto-closes the modal
 * right after — copy-and-done in one click, matching how the chip's
 * own inline copy button already behaves, instead of requiring a
 * separate manual close afterward.
 */
export function AssetViewModal({
  open,
  onClose,
  title,
  value,
  onCopy,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  value: string;
  /** Performs the actual clipboard write and returns whether it
   *  succeeded — the modal only shows "Copied!" and auto-closes on a
   *  genuine success, matching the same real-success-only feedback
   *  rule used elsewhere (lib/clipboard.ts). */
  onCopy: () => Promise<boolean>;
}) {
  const [copied, setCopied] = useState(false);
  useBodyScrollLock(open);
  if (!open) return null;

  async function handleCopy() {
    const ok = await onCopy();
    if (ok) {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        onClose();
      }, 600);
    }
  }

  return (
    <Portal>
    <div className="wp-modal-overlay open" onClick={onClose}>
      <div className="wp-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="wp-modal-head">
          <h2>{title}</h2>
          <button type="button" className="wp-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="wp-modal-body">
          <textarea
            readOnly
            value={value || `No ${title.toLowerCase()} yet — generate with AI.`}
            style={{
              width: "100%",
              boxSizing: "border-box",
              minHeight: 260,
              resize: "vertical",
              padding: "0.7rem 0.85rem",
              border: "1px solid var(--gray-200)",
              borderRadius: "var(--radius)",
              fontSize: "0.875rem",
              fontFamily: "inherit",
              color: "var(--gray-800)",
              outline: "none",
            }}
          />
        </div>
        <div
          style={{
            padding: "10px 18px",
            borderTop: "1px solid var(--gray-200)",
            background: "var(--gray-50)",
            textAlign: "right",
            borderRadius: "0 0 var(--radius-lg) var(--radius-lg)",
          }}
        >
          <button
            type="button"
            className={`ai-asset-mini-btn${copied ? " is-copied" : ""}`}
            style={{ width: "auto", height: "auto", padding: "0.3rem 0.7rem", border: "1px solid var(--gray-200)", borderRadius: 6, fontSize: "0.75rem", fontWeight: 600 }}
            onClick={handleCopy}
          >
            <i className={`fas ${copied ? "fa-check" : "fa-copy"}`} style={{ fontSize: "10px", marginRight: 4 }} />
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
}
