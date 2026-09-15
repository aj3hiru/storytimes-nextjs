"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toggleCountryRedirect, deleteCountryRedirect } from "@/lib/countryRedirectionAdmin";
import { useAdminDialogs } from "./AdminDialogProvider";

export function CountryRedirectRow({
  id,
  countryCode,
  targetUrl,
  status,
  createdAt,
}: {
  id: number;
  countryCode: string;
  targetUrl: string;
  status: boolean;
  createdAt: string;
}) {
  const [isPending, startTransition] = useTransition();
  const { confirm } = useAdminDialogs();

  return (
    <tr>
      <td>
        <span className="badge">{countryCode}</span>
      </td>
      <td style={{ wordBreak: "break-all" }}>{targetUrl}</td>
      <td>{createdAt}</td>
      <td>
        <span className={`badge ${status ? "badge-active" : "badge-inactive"}`}>{status ? "Active" : "Disabled"}</span>
      </td>
      <td>
        <div className="row-actions">
          <Link href={`/admin/country-redirection?edit=${id}`} className="btn-action btn-edit" title="Edit">
            <i className="fas fa-edit" />
          </Link>
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
            <i className="fas fa-trash" />
          </button>
        </div>
      </td>
    </tr>
  );
}
