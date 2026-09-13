"use client";

import { useState } from "react";
import { AssetViewModal } from "./AssetViewModal";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { copyToClipboard } from "@/lib/clipboard";
import { useAdminDialogs } from "./AdminDialogProvider";

/** Ported to use the exact .post-url-row/.copy-link-btn/.fbc-row/
 *  .fbc-copy-btn classes from admin/post-manager.php's actual rendered
 *  output.
 *
 *  Real bug fixed here: this whole row used to be hidden entirely for a
 *  brand-new, unsaved post (no real URL exists yet) — the actual
 *  reference always shows all five chips (Copy Post URL / Copy Chapter
 *  1 / Copy FB Comment / FB Description / Thumbnail Prompt), just
 *  visually inert (low opacity, non-interactive via `.is-disabled`)
 *  until the post has a real, saved URL — then they become fully live.
 *  Also: FB Description/Thumbnail Prompt now open the real full
 *  AssetViewModal (matching #asset-view-modal in the reference) instead
 *  of a small inline popover clipped inside the row.
 */
export function CopyLinksPanel({
  postUrl,
  isPublished,
  fbCommentEnabled,
  fbCommentText,
  fbDescription,
  thumbnailPrompt,
}: {
  postUrl: string;
  isPublished: boolean;
  fbCommentEnabled: boolean;
  fbCommentText: string;
  /** AI-generated (Gemini) — view + copy only, matches the reference's
   *  readonly #asset-view-modal exactly. Never user-editable here. */
  fbDescription: string;
  /** The exact prompt Gemini generated and Cloudflare used to make the
   *  thumbnail — kept as a readonly fallback so the admin can take it
   *  elsewhere to generate an image manually if auto-generation fails. */
  thumbnailPrompt: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [assetModal, setAssetModal] = useState<"fb" | "thumb" | null>(null);
  useBodyScrollLock(modalOpen || assetModal !== null);
  const { notice } = useAdminDialogs();

  const hasUrl = Boolean(postUrl);
  const ch1Url = postUrl ? `${postUrl}/chapter-1` : "";
  const fbWrappedUrl = postUrl ? `https://l.facebook.com/l.php?u=${encodeURIComponent(ch1Url)}` : "";

  const variants = [
    { key: "post", label: "Post Link", value: postUrl ? `${fbCommentText}[${postUrl}/](${ch1Url})` : "" },
    { key: "ch1", label: "Chapter 1 Link", value: postUrl ? `${fbCommentText}${ch1Url}` : "" },
    { key: "fb", label: "Facebook Link", value: postUrl ? `${fbCommentText}${fbWrappedUrl}` : "" },
  ];

  async function copyValue(key: string, value: string) {
    if (!value) return;
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    } else {
      notice("Couldn't copy automatically — select the text and copy it manually.", { type: "error" });
    }
  }

  async function copyAssetModal() {
    const value = assetModal === "fb" ? fbDescription : thumbnailPrompt;
    if (!value) return;
    const ok = await copyToClipboard(value);
    if (!ok) notice("Couldn't copy automatically — select the text and copy it manually.", { type: "error" });
  }

  return (
    <div className="post-url-row" style={{ flexWrap: "wrap" }}>
      <button type="button" className={`copy-link-btn${!hasUrl ? " is-disabled" : ""}`} onClick={() => copyValue("plain-post", postUrl)}>
        <i className="fas fa-copy" style={{ fontSize: "11px" }} />
        <span className="copy-link-label">{copiedKey === "plain-post" ? "Copied!" : "Copy Post URL"}</span>
      </button>
      <button type="button" className={`copy-link-btn${!hasUrl ? " is-disabled" : ""}`} onClick={() => copyValue("plain-ch1", ch1Url)}>
        <i className="fas fa-copy" style={{ fontSize: "11px" }} />
        <span className="copy-link-label">{copiedKey === "plain-ch1" ? "Copied!" : "Copy Chapter 1"}</span>
      </button>
      {fbCommentEnabled && (
        <button
          type="button"
          className={`copy-link-btn${!hasUrl || !isPublished ? " is-disabled" : ""}`}
          title={!isPublished ? "Publish the post first" : undefined}
          onClick={() => setModalOpen(true)}
        >
          <i className="fas fa-comment" style={{ fontSize: "11px" }} />
          <span className="copy-link-label">Copy FB Comment</span>
        </button>
      )}

      <button type="button" className={`copy-link-btn${!hasUrl ? " is-disabled" : ""}`} onClick={() => setAssetModal("fb")}>
        <span className="copy-link-label">FB Description</span>
        <i className="fas fa-eye" style={{ fontSize: "11px" }} />
      </button>
      <button type="button" className={`copy-link-btn${!hasUrl ? " is-disabled" : ""}`} onClick={() => setAssetModal("thumb")}>
        <span className="copy-link-label">Thumbnail Prompt</span>
        <i className="fas fa-eye" style={{ fontSize: "11px" }} />
      </button>

      {modalOpen && (
        <div className="wp-modal-overlay open" onClick={() => setModalOpen(false)}>
          <div className="wp-modal" onClick={(e) => e.stopPropagation()}>
            <div className="wp-modal-head">
              <h2>Copy FB Comment</h2>
              <button type="button" className="wp-modal-close" onClick={() => setModalOpen(false)}>
                ✕
              </button>
            </div>
            <div className="wp-modal-body">
              {variants.map((v) => (
                <div className="fbc-row" key={v.key}>
                  <div className="fbc-row-label">{v.label}</div>
                  <textarea className="fbc-row-text" readOnly value={v.value} />
                  <button type="button" className={`fbc-copy-btn${copiedKey === v.key ? " is-copied" : ""}`} onClick={() => copyValue(v.key, v.value)}>
                    {copiedKey === v.key ? "Copied!" : "Copy"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <AssetViewModal
        open={assetModal === "fb"}
        onClose={() => setAssetModal(null)}
        title="FB Description"
        value={fbDescription}
        onCopy={copyAssetModal}
      />
      <AssetViewModal
        open={assetModal === "thumb"}
        onClose={() => setAssetModal(null)}
        title="Thumbnail Prompt"
        value={thumbnailPrompt}
        onCopy={copyAssetModal}
      />
    </div>
  );
}
