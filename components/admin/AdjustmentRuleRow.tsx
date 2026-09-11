"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toggleAdjustmentRule, deleteAdjustmentRule } from "@/lib/analyticsAdjustmentAdmin";
import { useAdminDialogs } from "./AdminDialogProvider";

export function AdjustmentRuleRow({
  id,
  countryName,
  countryCode,
  reductionPercent,
  scope,
  username,
  enabled,
}: {
  id: number;
  countryName: string;
  countryCode: string;
  reductionPercent: number;
  scope: string;
  username: string | null;
  enabled: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const { confirm } = useAdminDialogs();

  return (
    <tr>
      <td>
        {countryName} ({countryCode})
      </td>
      <td>-{reductionPercent}%</td>
      <td>{scope === "all" ? "All editors/authors" : username ?? "—"}</td>
      <td>
        <span className={`badge ${enabled ? "badge-active" : "badge-inactive"}`}>{enabled ? "Enabled" : "Disabled"}</span>
      </td>
      <td>
        <div className="row-actions">
          <Link href={`/admin/analytics-adjustment?edit=${id}`} className="btn-action btn-edit">
            Edit
          </Link>
          <button
            type="button"
            className="btn-action btn-edit"
            disabled={isPending}
            onClick={() => startTransition(() => toggleAdjustmentRule(id))}
          >
            {enabled ? "Disable" : "Enable"}
          </button>
          <button
            type="button"
            className="btn-action btn-delete"
            disabled={isPending}
            onClick={async () => {
              if (await confirm("Delete this adjustment rule?")) startTransition(() => deleteAdjustmentRule(id));
            }}
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
