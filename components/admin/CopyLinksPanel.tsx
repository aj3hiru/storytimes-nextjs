"use client";

import { useState } from "react";

/** Ported to use the exact .post-url-row/.copy-link-btn/.fbc-row/
 *  .fbc-copy-btn classes from admin/post-manager.php's actual rendered
 *  output — an earlier pass used generic .btn-action styling here. */
export function CopyLinksPanel({
  postUrl,
  isPublished,
  fbCommentEnabled,
  fbCommentText,
}: {
  postUrl: string;
  isPublished: boolean;
  fbCommentEnabled: boolean;
  fbCommentText: string;
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
    <div className="post-url-row">
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
