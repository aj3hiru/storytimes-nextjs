"use client";

import { useState, useTransition } from "react";
import { deleteUser, transferUserContent } from "@/lib/userAdmin";
import { useAdminDialogs } from "./AdminDialogProvider";

export function DeleteUserButton({
  userId,
  username,
  otherUsers,
}: {
  userId: number;
  username: string;
  otherUsers: { id: number; username: string }[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [needsTransfer, setNeedsTransfer] = useState(false);
  const [targetUserId, setTargetUserId] = useState<number | "">("");
  const [status, setStatus] = useState<string | null>(null);
  const { confirm } = useAdminDialogs();

  async function handleDeleteClick() {
    if (!(await confirm(`Delete user "${username}"?`))) return;
    startTransition(async () => {
      const result = await deleteUser(userId);
      if (result.error) {
        setError(result.error);
        setNeedsTransfer(true);
      } else {
        setError(null);
        setNeedsTransfer(false);
      }
    });
  }

  function handleTransferAndDelete() {
    if (!targetUserId) return;
    startTransition(async () => {
      const transferResult = await transferUserContent(userId, targetUserId);
      if (transferResult.error) {
        setError(transferResult.error);
        return;
      }
      setStatus(`Moved ${transferResult.postsMoved ?? 0} post(s), ${transferResult.mediaMoved ?? 0} file(s).`);
      const deleteResult = await deleteUser(userId);
      if (deleteResult.error) {
        setError(deleteResult.error);
      } else {
        setError(null);
        setNeedsTransfer(false);
      }
    });
  }

  return (
    <div>
      <button type="button" className="btn-action btn-delete" onClick={handleDeleteClick} disabled={isPending}>
        {isPending ? "Working…" : "Delete"}
      </button>
      {error && <div style={{ color: "var(--danger)", fontSize: "0.75rem", marginTop: "0.25rem" }}>{error}</div>}
      {status && <div style={{ color: "var(--success)", fontSize: "0.75rem", marginTop: "0.25rem" }}>{status}</div>}
      {needsTransfer && (
        <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.4rem", alignItems: "center" }}>
          <select
            className="form-control"
            style={{ width: "auto", padding: "0.3rem 0.5rem", fontSize: "0.8rem" }}
            value={targetUserId}
            onChange={(e) => setTargetUserId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">Transfer to…</option>
            {otherUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.username}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-action btn-view"
            disabled={!targetUserId || isPending}
            onClick={handleTransferAndDelete}
          >
            Transfer &amp; Delete
          </button>
        </div>
      )}
    </div>
  );
}
