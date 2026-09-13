"use client";

/**
 * Ports the real #asset-view-modal from post-manager.php exactly — a
 * full-page overlay modal with a readonly textarea and a Copy button.
 * Real bug fixed here: an earlier pass showed FB Description/Thumbnail
 * Prompt in a small inline popover clipped INSIDE the action row
 * (easy to accidentally close, cramped on mobile) instead of this
 * proper full modal that opens OUTSIDE/above everything else, matching
 * the actual reference.
 */
export function AssetViewModal({
  open,
  onClose,
  title,
  value,
  onChange,
  onCopy,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  value: string;
  onChange: (v: string) => void;
  onCopy: () => void;
}) {
  if (!open) return null;

  return (
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
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`No ${title.toLowerCase()} yet — generate with AI or type your own.`}
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
          <button type="button" className="btn btn-secondary" onClick={onCopy}>
            Copy
          </button>
        </div>
      </div>
    </div>
  );
}
