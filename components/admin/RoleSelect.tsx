"use client";

import { useTransition } from "react";
import type { UserRole } from "@prisma/client";
import { changeUserRole } from "@/lib/userAdmin";
import { useAdminDialogs } from "./AdminDialogProvider";

export function RoleSelect({ userId, currentRole }: { userId: number; currentRole: UserRole }) {
  const [isPending, startTransition] = useTransition();
  const { confirm } = useAdminDialogs();

  return (
    <select
      className="form-control"
      style={{ width: "auto", padding: "0.35rem 0.6rem" }}
      defaultValue={currentRole}
      disabled={isPending}
      onChange={async (e) => {
        const role = e.target.value as UserRole;
        const target = e.target;
        if (await confirm(`Change role to "${role}"? Their custom Advance Access permissions (if any) will stay as-is — only the role changes.`)) {
          startTransition(() => changeUserRole(userId, role));
        } else {
          target.value = currentRole;
        }
      }}
    >
      <option value="admin">Admin</option>
      <option value="editor">Editor</option>
      <option value="author">Author</option>
    </select>
  );
}
