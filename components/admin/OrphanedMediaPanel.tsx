"use client";

import { useState, useTransition } from "react";
import type { OrphanedMedia } from "@/lib/aiKeyAdmin";
import { deleteOrphanedAiMedia } from "@/lib/aiKeyAdmin";
import { useAdminDialogs } from "./AdminDialogProvider";

export function OrphanedMediaPanel({ items }: { items: OrphanedMedia[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [remaining, setRemaining] = useState(items);
  const [message, setMessage] = useState<string | null>(null);
  const { confirm } = useAdminDialogs();

  if (remaining.length === 0) {
    return (
      <div className="card" style={{ padding: "1.25rem" }}>
        <h3 style={{ marginBottom: "0.5rem" }}>Orphaned AI Media</h3>
        <p style={{ color: "var(--gray-500)", fontSize: "0.875rem" }}>
          No orphaned AI-generated images found — nothing to clean up.
        </p>
      </div>
    );
  }

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleDelete() {
    if (selected.size === 0) return;
    if (!(await confirm(`Delete ${selected.size} orphaned image(s)? This cannot be undone.`))) return;
    startTransition(async () => {
      const result = await deleteOrphanedAiMedia(Array.from(selected));
      setMessage(`Deleted ${result.deleted} image(s).`);
      setRemaining((prev) => prev.filter((m) => !selected.has(m.id)));
      setSelected(new Set());
    });
  }

  return (
    <div className="card" style={{ padding: "1.25rem" }}>
      <h3 style={{ marginBottom: "0.5rem" }}>Orphaned AI Media ({remaining.length})</h3>
      <p style={{ color: "var(--gray-500)", fontSize: "0.875rem", marginBottom: "1rem" }}>
        AI-generated images that were never attached to a post&apos;s featured image or content —
        safe to clean up.
      </p>
      {message && (
        <div className="alert alert-success" style={{ marginBottom: "1rem" }}>
          {message}
        </div>
      )}
      <div className="table-wrap" style={{ marginBottom: "1rem" }}>
        <table>
          <thead>
            <tr>
              <th></th>
              <th>File</th>
              <th>Uploaded By</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {remaining.map((m) => (
              <tr key={m.id}>
                <td>
                  <input type="checkbox" checked={selected.has(m.id)} onChange={() => toggle(m.id)} />
                </td>
                <td style={{ fontSize: "0.8rem" }}>{m.filePath.split("/").pop()}</td>
                <td>{m.uploadedByUsername ?? "—"}</td>
                <td>{m.uploadedAt ? new Date(m.uploadedAt).toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn btn-primary" disabled={selected.size === 0 || isPending} onClick={handleDelete}>
        {isPending ? "Deleting…" : `Delete Selected (${selected.size})`}
      </button>
    </div>
  );
}
