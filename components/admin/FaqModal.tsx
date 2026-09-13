"use client";

import { useState } from "react";

export interface FaqItem {
  q: string;
  a: string;
}

/**
 * Ports the real #faq-modal from post-manager.php exactly — a row-by-row
 * Question/Answer builder with "+ Add Another Question" and "Save FAQs" —
 * replacing an earlier pass's raw "FAQ (JSON)" textarea, which had no
 * equivalent in the actual reference at all.
 */
export function FaqModal({
  open,
  onClose,
  initial,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  initial: FaqItem[];
  onSave: (items: FaqItem[]) => void;
}) {
  const [rows, setRows] = useState<FaqItem[]>(initial.length > 0 ? initial : [{ q: "", a: "" }]);

  if (!open) return null;

  function updateRow(i: number, field: "q" | "a", value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }
  function addRow() {
    setRows((prev) => [...prev, { q: "", a: "" }]);
  }
  function handleSave() {
    onSave(rows.filter((r) => r.q.trim() || r.a.trim()));
    onClose();
  }

  return (
    <div className="wp-modal-overlay open" onClick={onClose}>
      <div className="wp-modal" style={{ maxWidth: 580 }} onClick={(e) => e.stopPropagation()}>
        <div className="wp-modal-head">
          <h2>Manage FAQs</h2>
          <button type="button" className="wp-modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="wp-modal-body">
          <div id="faq-rows">
            {rows.map((row, i) => (
              <div className="faq-row" key={i}>
                <div className="faq-row-head">
                  <span className="faq-row-num">FAQ #{i + 1}</span>
                  <button type="button" className="faq-rm" onClick={() => removeRow(i)}>
                    <i className="fas fa-trash-alt" /> Remove
                  </button>
                </div>
                <label>Question</label>
                <input
                  type="text"
                  className="faq-q"
                  value={row.q}
                  onChange={(e) => updateRow(i, "q", e.target.value)}
                  placeholder="e.g. What is the last date?"
                />
                <label style={{ marginTop: 7 }}>Answer</label>
                <textarea className="faq-a" value={row.a} onChange={(e) => updateRow(i, "a", e.target.value)} placeholder="Detailed answer…" />
              </div>
            ))}
          </div>
          <button type="button" id="add-faq-btn" onClick={addRow}>
            + Add Another Question
          </button>
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
          <button type="button" className="btn btn-primary" onClick={handleSave}>
            Save FAQs
          </button>
        </div>
      </div>
    </div>
  );
}
