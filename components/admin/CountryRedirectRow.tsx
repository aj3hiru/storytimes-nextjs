"use client";

import { useTransition } from "react";
import { toggleCountryRedirect, deleteCountryRedirect } from "@/lib/countryRedirectionAdmin";
import { useAdminDialogs } from "./AdminDialogProvider";

export function CountryRedirectRow({
  id,
  countryCode,
  targetUrl,
  status,
}: {
  id: number;
  countryCode: string;
  targetUrl: string;
  status: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const { confirm } = useAdminDialogs();

  return (
    <tr>
      <td>{countryCode}</td>
      <td>{targetUrl}</td>
      <td>
        <span className={`badge ${status ? "badge-active" : "badge-inactive"}`}>{status ? "Active" : "Disabled"}</span>
      </td>
      <td>
        <div className="row-actions">
          <button
            type="button"
            className="btn-action btn-edit"
            disabled={isPending}
            onClick={() => startTransition(() => toggleCountryRedirect(id, !status))}
          >
            {status ? "Disable" : "Enable"}
          </button>
          <button
            type="button"
            className="btn-action btn-delete"
            disabled={isPending}
            onClick={async () => {
              if (await confirm(`Delete redirect rule for ${countryCode}?`)) {
                startTransition(() => deleteCountryRedirect(id));
              }
            }}
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
