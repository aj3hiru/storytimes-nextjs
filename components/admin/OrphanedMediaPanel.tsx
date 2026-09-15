"use client";

import { useState, useTransition } from "react";
import type { OrphanedMedia } from "@/lib/aiKeyAdmin";
import { deleteOrphanedAiMedia } from "@/lib/aiKeyAdmin";
import { useAdminDialogs } from "./AdminDialogProvider";
import { resolveMediaUrl } from "@/lib/urls";

/**
 * Rebuilt to match the reference exactly (item #1): an image grid with a
 * checkbox overlaid on each thumbnail (all checked by default — deleting
 * every orphan is the common case, unchecking a few exceptions is rarer),
 * one "Delete Selected (N)" danger button in the card header, same
 * confirm text and empty-state as the reference. Previously a plain table
 * list with nothing pre-selected.
 */
export function OrphanedMediaPanel({ items }: { items: OrphanedMedia[] }) {
  const [remaining, setRemaining] = useState(items);
  const [selected, setSelected] = useState<Set<number>>(new Set(items.map((m) => m.id)));
  const [isPending, startTransition] = useTransition();
  const { confirm } = useAdminDialogs();

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDeleteSelected() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!(await confirm(`Delete ${ids.length} orphaned image(s)? This cannot be undone.`))) return;
    startTransition(async () => {
      await deleteOrphanedAiMedia(ids);
      setRemaining((prev) => prev.filter((m) => !selected.has(m.id)));
      setSelected(new Set());
    });
  }

  return (
    <div className="card" style={{ padding: "1.25rem" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <h3 style={{ margin: 0 }}>Unused AI Images ({remaining.length})</h3>
        {remaining.length > 0 && (
          <button type="button" className="btn btn-danger" disabled={selected.size === 0 || isPending} onClick={handleDeleteSelected}>
            {isPending ? "Deleting…" : `Delete Selected (${selected.size})`}
          </button>
        )}
      </div>
      <p style={{ color: "var(--gray-500)", fontSize: "0.875rem", marginBottom: "1rem" }}>
        AI-generated images that were never attached to a post&apos;s featured image or content —
        safe to clean up.
      </p>

      {remaining.length === 0 ? (
        <p style={{ color: "var(--gray-500)", fontSize: "0.875rem" }}>
          No orphaned AI-generated images found — nothing to clean up.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "0.75rem" }}>
          {remaining.map((m) => (
            <label
              key={m.id}
              style={{ position: "relative", display: "block", cursor: "pointer", borderRadius: "var(--radius, 8px)", overflow: "hidden", border: "1px solid var(--gray-200)" }}
            >
              <input
                type="checkbox"
                checked={selected.has(m.id)}
                onChange={() => toggle(m.id)}
                style={{ position: "absolute", top: 8, left: 8, width: 18, height: 18, zIndex: 1, cursor: "pointer" }}
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={resolveMediaUrl(m.filePath)}
                alt="Orphaned AI image"
                style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", display: "block", opacity: selected.has(m.id) ? 1 : 0.45 }}
              />
              <div style={{ padding: "0.4rem 0.5rem", fontSize: "0.7rem", color: "var(--gray-500)", display: "flex", justifyContent: "space-between", background: "#fff" }}>
                <span>{m.uploadedByUsername ?? "—"}</span>
                <span>{m.uploadedAt ? new Date(m.uploadedAt).toLocaleDateString("en-US", { month: "short", day: "2-digit" }) : "—"}</span>
              </div>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
