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
    <button type="button" className="ra-link ra-delete" onClick={handleClick} disabled={isPending}>
      <i className={`fas ${isPending ? "fa-spinner fa-spin" : "fa-trash"}`} /> {isPending ? "Deleting…" : "Delete"}
    </button>
  );
}
