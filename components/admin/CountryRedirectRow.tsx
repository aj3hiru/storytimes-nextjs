"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toggleCountryRedirect, deleteCountryRedirect } from "@/lib/countryRedirectionAdmin";
import { useAdminDialogs } from "./AdminDialogProvider";

export function CountryRedirectRow({
  id,
  countryCode,
  countryName,
  flag,
  targetUrl,
  status,
  createdAt,
  editing,
}: {
  id: number;
  countryCode: string;
  countryName: string;
  flag: string;
  targetUrl: string;
  status: boolean;
  createdAt: string;
  editing: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const { confirm } = useAdminDialogs();
  let host = targetUrl;
  try {
    host = new URL(targetUrl).host;
  } catch {}

  return (
    <li className={`cr-row${status ? "" : " paused"}${editing ? " editing" : ""}`}>
      <span className="cr-flag" aria-hidden>
        {flag || <i className="fas fa-globe" />}
      </span>
      <div className="cr-row-main">
        <div className="cr-row-top">
          <strong>{countryName}</strong>
          <span className="cr-code">{countryCode}</span>
          <span className={`cr-pill ${status ? "on" : "off"}`}>{status ? "Active" : "Paused"}</span>
        </div>
        <a href={targetUrl} target="_blank" rel="noopener noreferrer" className="cr-target" title={targetUrl}>
          <i className="fas fa-arrow-right-long" /> {host}
          <span className="cr-target-full">{targetUrl}</span>
        </a>
        {createdAt && <span className="cr-date">Added {createdAt}</span>}
      </div>
      <div className="cr-actions">
        <label className="ps-sw" title={status ? "Pause" : "Activate"}>
          <input type="checkbox" checked={status} disabled={isPending} onChange={() => startTransition(() => toggleCountryRedirect(id, !status))} />
          <span className="ps-sl" />
        </label>
        <Link href={`/admin/country-redirection?edit=${id}`} className="cr-icon-btn" title="Edit" aria-label={`Edit ${countryName}`}>
          <i className="fas fa-pen" />
        </Link>
        <button
          type="button"
          className="cr-icon-btn danger"
          title="Delete"
          aria-label={`Delete ${countryName}`}
          disabled={isPending}
          onClick={async () => {
            if (await confirm(`Delete the redirect rule for ${countryName} (${countryCode})?`)) startTransition(() => deleteCountryRedirect(id));
          }}
        >
          <i className={`fas ${isPending ? "fa-spinner fa-spin" : "fa-trash"}`} />
        </button>
      </div>
    </li>
  );
}
