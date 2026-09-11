"use client";

import { useState, useTransition } from "react";
import { deleteMedia } from "@/lib/mediaAdmin";
import { useAdminDialogs } from "./AdminDialogProvider";

export function DeleteMediaButton({ mediaId }: { mediaId: number }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { confirm } = useAdminDialogs();

  async function handleClick() {
    if (!(await confirm("Delete this file?"))) return;
    startTransition(async () => {
      const result = await deleteMedia(mediaId);
      setError(result.error ?? null);
    });
  }

  return (
    <div>
      <button type="button" className="btn-action btn-delete" onClick={handleClick} disabled={isPending} style={{ width: "100%" }}>
        {isPending ? "Deleting…" : "Delete"}
      </button>
      {error && <div style={{ color: "var(--danger)", fontSize: "0.7rem", marginTop: "0.25rem" }}>{error}</div>}
    </div>
  );
}
