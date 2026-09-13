"use client";

import { useState } from "react";
import { AssetViewModal } from "./AssetViewModal";
import { useBodyScrollLock } from "@/lib/useBodyScrollLock";
import { copyToClipboard } from "@/lib/clipboard";
import { useAdminDialogs } from "./AdminDialogProvider";
import { Portal } from "./Portal";

/** Ports withFbDescLink() from the actual newbase live source exactly:
 *  the AI writes an opening line like "Part 2 👉" with no URL after it
 *  (it has no way to know the post's real URL at generation time) — the
 *  real post link is inserted here, from the live post URL (same value
 *  "Copy FB Comment" uses), so the description always shows/copies with
 *  the actual link right after the first 👉, and the rest stays below
 *  it. An earlier pass here blindly inserted after ANY first line
 *  (not checking for 👉) with no guard against inserting the link
 *  twice if it was somehow already present — both fixed to match the
 *  reference's exact guard conditions. */
function withFbDescLink(text: string, link: string): string {
  if (!text) return text;
  const trimmedLink = link.trim();
  if (!trimmedLink) return text;
  const lines = text.split("\n");
  if (lines.length && lines[0].includes("👉") && !lines[0].includes(trimmedLink)) {
    lines[0] = lines[0].replace(/\s+$/, "") + " " + trimmedLink;
  }
  return lines.join("\n");
}

/** Ports the exact .ai-asset-chip structure from the reference: a label
 *  plus two separate mini-buttons — an eye icon that opens the full
 *  AssetViewModal, and a copy icon that copies directly without opening
 *  anything. Real gap fixed here: an earlier pass used one clickable
 *  chip that only opened the modal, with no direct-copy affordance at
 *  all — matches "and thumbnail aur description button bhi empty aa
 *  raha hai" (both buttons existed but only one actually did anything
 *  useful; the other silently did the same thing instead of its own,
 *  distinct copy action). */
function AiAssetChip({
  label,
  value,
  disabled,
  onView,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onView: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const { notice } = useAdminDialogs();

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    if (!value) return;
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } else {
      notice("Couldn't copy automatically — select the text and copy it manually.", { type: "error" });
    }
  }

  return (
    <div className={`ai-asset-chip${disabled ? " is-disabled" : ""}`}>
      <span className="ai-asset-label">{label}</span>
      <button type="button" className="ai-asset-mini-btn" title="View" onClick={onView} disabled={disabled}>
        <i className="fas fa-eye" style={{ fontSize: "11px" }} />
      </button>
      <button type="button" className={`ai-asset-mini-btn${copied ? " is-copied" : ""}`} title="Copy" onClick={handleCopy} disabled={disabled}>
        <i className={`fas ${copied ? "fa-check" : "fa-copy"}`} style={{ fontSize: "11px" }} />
      </button>
    </div>
  );
}

/** Ported to use the exact .post-url-row/.copy-link-btn/.fbc-row/
 *  .fbc-copy-btn/.ai-asset-chip classes from the actual newbase live
 *  source, verified directly (not approximated) — including its exact
 *  withFbDescLink() logic and two-button chip structure.
 *
 *  Real bug fixed here: this whole row used to be hidden entirely for a
 *  brand-new, unsaved post (no real URL exists yet) — the reference
 *  always shows all five (Copy Post URL / Copy Chapter 1 / Copy FB
 *  Comment / FB Description / Thumbnail Prompt), just visually inert
 *  (low opacity, non-interactive) until the post has a real saved URL.
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
  /** AI-generated (Gemini) — view + copy only, never user-editable,
   *  matching the reference's readonly #asset-view-modal exactly. */
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
  const displayFbDescription = withFbDescLink(fbDescription, postUrl);

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
    const value = assetModal === "fb" ? displayFbDescription : thumbnailPrompt;
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

      <AiAssetChip label="FB Description" value={displayFbDescription} disabled={!fbDescription} onView={() => setAssetModal("fb")} />
      <AiAssetChip label="Thumbnail Prompt" value={thumbnailPrompt} disabled={!thumbnailPrompt} onView={() => setAssetModal("thumb")} />

      {modalOpen && (
        <Portal>
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
        </Portal>
      )}

      <AssetViewModal open={assetModal === "fb"} onClose={() => setAssetModal(null)} title="FB Description" value={displayFbDescription} onCopy={copyAssetModal} />
      <AssetViewModal open={assetModal === "thumb"} onClose={() => setAssetModal(null)} title="Thumbnail Prompt" value={thumbnailPrompt} onCopy={copyAssetModal} />
    </div>
  );
}
