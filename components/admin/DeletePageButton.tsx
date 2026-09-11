"use client";

import { useTransition } from "react";
import { deletePage } from "@/lib/pageAdmin";
import { useAdminDialogs } from "./AdminDialogProvider";

export function DeletePageButton({ pageId, title }: { pageId: number; title: string }) {
  const [isPending, startTransition] = useTransition();
  const { confirm } = useAdminDialogs();

  async function handleClick() {
    if (!(await confirm(`Delete page "${title}"?`))) return;
    startTransition(() => {
      deletePage(pageId);
    });
  }

  return (
    <button type="button" className="btn-action btn-delete" onClick={handleClick} disabled={isPending}>
      {isPending ? "Deleting…" : "Delete"}
    </button>
  );
}
