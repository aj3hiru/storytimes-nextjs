"use client";

import { useTransition } from "react";
import { deleteTag } from "@/lib/tagAdmin";
import { useAdminDialogs } from "./AdminDialogProvider";

export function DeleteTagButton({ tagId, name }: { tagId: number; name: string }) {
  const [isPending, startTransition] = useTransition();
  const { confirm } = useAdminDialogs();

  async function handleClick() {
    if (!(await confirm(`Delete tag "${name}"?`))) return;
    startTransition(() => {
      deleteTag(tagId);
    });
  }

  return (
    <button type="button" className="btn-action btn-delete" onClick={handleClick} disabled={isPending}>
      {isPending ? "Deleting…" : "Delete"}
    </button>
  );
}
