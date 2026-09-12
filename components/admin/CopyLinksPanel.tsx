"use client";

import { useState } from "react";

/** A single "reveal + edit + copy" chip — matches the newbase reference's
 *  FB Description / Thumbnail Prompt pills exactly: an eye icon toggles
 *  an inline textarea open for viewing/editing the AI-generated value,
 *  a copy icon copies the current value to the clipboard. Real bug fixed
 *  here: an earlier pass rendered these as large, always-visible
 *  textareas inside "SEO & Meta" instead of this compact reveal pattern
 *  the original actually uses. */
function AiFieldChip({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // best-effort only
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className={`copy-link-btn${disabled ? " is-disabled" : ""}`}
        onClick={() => setRevealed((v) => !v)}
      >
        <span className="copy-link-label">{label}</span>
        <i className="fas fa-eye" style={{ fontSize: "11px" }} />
        <i
          className={`fas fa-copy${copied ? " is-copied" : ""}`}
          style={{ fontSize: "11px" }}
          onClick={(e) => {
            e.stopPropagation();
            handleCopy();
          }}
        />
      </button>
      {revealed && (
        <div className="ai-field-popover">
          <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={`No ${label.toLowerCase()} yet — generate with AI or type your own.`} />
        </div>
      )}
    </div>
  );
}

/** Ported to use the exact .post-url-row/.copy-link-btn/.fbc-row/
 *  .fbc-copy-btn classes from admin/post-manager.php's actual rendered
 *  output — an earlier pass used generic .btn-action styling here.
 *
 *  Real bug fixed here: fbDescription/thumbnailPrompt now live in this
 *  same action row as compact reveal+copy chips (matching the actual
 *  newbase reference), instead of as two separate large textareas
 *  permanently shown inside "SEO & Meta" — but the underlying values are
 *  still fully editable (via the reveal popover) and still submit with
 *  the form via hidden inputs, so no capability was lost, only the
 *  visual presentation changed to match the original. */
export function CopyLinksPanel({
  postUrl,
  isPublished,
  fbCommentEnabled,
  fbCommentText,
  fbDescription,
  onFbDescriptionChange,
  thumbnailPrompt,
  onThumbnailPromptChange,
}: {
  postUrl: string;
  isPublished: boolean;
  fbCommentEnabled: boolean;
  fbCommentText: string;
  fbDescription: string;
  onFbDescriptionChange: (v: string) => void;
  thumbnailPrompt: string;
  onThumbnailPromptChange: (v: string) => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const disabled = !postUrl;
  const ch1Url = postUrl ? `${postUrl}/chapter-1` : "";
  const fbWrappedUrl = postUrl ? `https://l.facebook.com/l.php?u=${encodeURIComponent(ch1Url)}` : "";

  const variants = [
    { key: "post", label: "Post Link", value: postUrl ? `${fbCommentText}[${postUrl}/](${ch1Url})` : "" },
    { key: "ch1", label: "Chapter 1 Link", value: postUrl ? `${fbCommentText}${ch1Url}` : "" },
    { key: "fb", label: "Facebook Link", value: postUrl ? `${fbCommentText}${fbWrappedUrl}` : "" },
  ];

  async function copyValue(key: string, value: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // best-effort only
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
  }

  return (
    <div className="post-url-row" style={{ flexWrap: "wrap" }}>
      <button
        type="button"
        className={`copy-link-btn${disabled ? " is-disabled" : ""}${copiedKey === "plain-post" ? " is-copied" : ""}`}
        onClick={() => copyValue("plain-post", postUrl)}
      >
        <i className="fas fa-copy" style={{ fontSize: "11px" }} />
        <span className="copy-link-label">{copiedKey === "plain-post" ? "Copied!" : "Copy Post URL"}</span>
      </button>
      <button
        type="button"
        className={`copy-link-btn${disabled ? " is-disabled" : ""}${copiedKey === "plain-ch1" ? " is-copied" : ""}`}
        onClick={() => copyValue("plain-ch1", ch1Url)}
      >
        <i className="fas fa-copy" style={{ fontSize: "11px" }} />
        <span className="copy-link-label">{copiedKey === "plain-ch1" ? "Copied!" : "Copy Chapter 1"}</span>
      </button>
      {fbCommentEnabled && (
        <button
          type="button"
          className={`copy-link-btn${disabled || !isPublished ? " is-disabled" : ""}`}
          title={!isPublished ? "Publish the post first" : undefined}
          onClick={() => setModalOpen(true)}
        >
          <i className="fas fa-comment" style={{ fontSize: "11px" }} />
          <span className="copy-link-label">Copy FB Comment</span>
        </button>
      )}

      <AiFieldChip label="FB Description" value={fbDescription} onChange={onFbDescriptionChange} disabled={false} />
      <AiFieldChip label="Thumbnail Prompt" value={thumbnailPrompt} onChange={onThumbnailPromptChange} disabled={false} />

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
    </div>
  );
}
