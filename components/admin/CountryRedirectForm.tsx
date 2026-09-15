"use client";

import { useState } from "react";
import Link from "next/link";
import { saveCountryRedirect } from "@/lib/countryRedirectionAdmin";
import { COUNTRY_OPTIONS } from "@/lib/countryOptions";

/**
 * Client half of the create/edit form — only the country-code
 * select <-> manual-input toggle needs JS, same as the inline
 * <script> at the bottom of admin/country-redirection.php.
 */
export function CountryRedirectForm({
  editing,
}: {
  editing: { id: number; countryCode: string; targetUrl: string } | null;
}) {
  const knownCode = editing && editing.countryCode in COUNTRY_OPTIONS ? editing.countryCode : "";
  const [selected, setSelected] = useState<string>(editing ? knownCode || "OTHER" : "");

  return (
    <form action={saveCountryRedirect}>
      <input type="hidden" name="editId" value={editing?.id ?? 0} />

      <div className="form-group">
        <label htmlFor="countryCode">Country Code (ISO 2-letter)</label>
        <select
          id="countryCode"
          name="countryCode"
          className="form-control"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">Select Country</option>
          {Object.entries(COUNTRY_OPTIONS).map(([code, name]) => (
            <option key={code} value={code}>
              {name} ({code})
            </option>
          ))}
          <option value="OTHER">Other (Enter manually below)</option>
        </select>
        {selected === "OTHER" && (
          <input
            type="text"
            name="manualCountry"
            placeholder="Enter code manually (e.g. US)"
            className="form-control"
            style={{ marginTop: "0.5rem" }}
            maxLength={2}
            defaultValue={editing && !knownCode ? editing.countryCode : ""}
            required
          />
        )}
      </div>

      <div className="form-group">
        <label htmlFor="targetUrl">Target URL</label>
        <input
          id="targetUrl"
          type="url"
          name="targetUrl"
          className="form-control"
          placeholder="https://example.com"
          defaultValue={editing?.targetUrl ?? ""}
          required
        />
      </div>

      <div className="form-actions">
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
          {editing ? "Update" : "Create"} Redirection
        </button>
        {editing && (
          <Link href="/admin/country-redirection" className="btn btn-secondary">
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}
