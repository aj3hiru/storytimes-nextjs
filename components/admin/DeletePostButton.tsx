"use client";

import { useTransition } from "react";
import { useAdminDialogs } from "./AdminDialogProvider";

export function DeletePostButton({
  postId,
  title,
  onDelete,
}: {
  postId: number;
  title: string;
  onDelete: (postId: number) => Promise<void>;
}) {
  const [isPending, startTransition] = useTransition();
  const { confirm } = useAdminDialogs();

  async function handleClick() {
    if (!(await confirm(`Delete "${title}"? This cannot be undone.`))) return;
    startTransition(() => {
      onDelete(postId);
    });
  }

  return (
    <button type="button" className="btn-action btn-delete" onClick={handleClick} disabled={isPending}>
      <i className="fas fa-trash" /> {isPending ? "Deleting…" : "Delete"}
    </button>
  );
}
