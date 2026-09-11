"use client";

import { useTransition } from "react";
import { deleteCategory } from "@/lib/categoryAdmin";
import { useAdminDialogs } from "./AdminDialogProvider";

export function DeleteCategoryButton({ categoryId, name }: { categoryId: number; name: string }) {
  const [isPending, startTransition] = useTransition();
  const { confirm } = useAdminDialogs();

  async function handleClick() {
    if (!(await confirm(`Delete category "${name}"? Its posts will move to the Default category.`))) return;
    startTransition(() => {
      deleteCategory(categoryId);
    });
  }

  return (
    <button type="button" className="btn-action btn-delete" onClick={handleClick} disabled={isPending}>
      {isPending ? "Deleting…" : "Delete"}
    </button>
  );
}
