import { prisma } from "@/lib/db";
import { getCloudflareDetectionInfo } from "@/lib/countryRedirectionAdmin";
import { CountryRedirectForm } from "@/components/admin/CountryRedirectForm";
import { CountryRedirectRow } from "@/components/admin/CountryRedirectRow";

/**
 * Full parity rebuild of admin/country-redirection.php:
 *  - scope note (Post & Page URLs only)
 *  - live Cloudflare Detector diagnostic panel (CF-IPCountry / CF-Ray /
 *    CF-Connecting-IP for THIS admin request)
 *  - sticky create/edit form (country dropdown + manual "OTHER" entry)
 *  - list table with edit/enable-disable/delete
 *
 * The actual redirect enforcement now lives in middleware.ts, reading
 * `cf-ipcountry` (this site is behind Cloudflare, not Vercel) and scoped to
 * Post/Page URLs only — see the comments there for the full explanation.
 */
export default async function CountryRedirectionPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; edit?: string }>;
}) {
  const { success, edit } = await searchParams;
  const editId = edit ? parseInt(edit, 10) : 0;

  const [redirects, editing, cf] = await Promise.all([
    prisma.countryRedirection.findMany({ orderBy: { countryCode: "asc" } }),
    editId ? prisma.countryRedirection.findUnique({ where: { id: editId } }) : Promise.resolve(null),
    getCloudflareDetectionInfo(),
  ]);

  const successMessages: Record<string, string> = {
    created: "Redirection rule created successfully!",
    updated: "Redirection rule updated successfully!",
    deleted: "Redirection rule deleted successfully!",
  };

  return (
    <div>
      <div className="toolbar">
        <h2 className="toolbar-title">Country Redirection</h2>
        <p className="toolbar-subtitle">Manage country-based traffic redirection</p>
      </div>

      {success && successMessages[success] && (
        <div className="alert alert-success" style={{ marginBottom: "1.5rem" }}>
          <i className="fas fa-check-circle" /> {successMessages[success]}
        </div>
      )}

      <div className="alert alert-info" style={{ marginBottom: "1.5rem" }}>
        <i className="fas fa-info-circle" /> <strong>Scope:</strong> applies to Post &amp; Page URLs
        only. Homepage, category/tag listings, search, RSS, sitemap, author pages and cron are
        excluded — same as the original.
      </div>

      <div
        className="card"
        style={{
          marginBottom: "1.5rem",
          borderTop: `3px solid ${cf.isBehindCloudflare ? "var(--success)" : "var(--danger)"}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "1rem 1.25rem", flexWrap: "wrap", gap: "1rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 9,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: cf.isBehindCloudflare ? "var(--success-light)" : "var(--danger-light)",
                color: cf.isBehindCloudflare ? "var(--success)" : "var(--danger)",
              }}
            >
              <i className={`fas ${cf.isBehindCloudflare ? "fa-shield-alt" : "fa-shield-alt"}`} />
            </div>
            <div>
              <span style={{ fontWeight: 700, fontSize: "0.9375rem", display: "block" }}>Cloudflare Detector</span>
              <span style={{ fontSize: "0.75rem", color: "var(--gray-500)" }}>Country-header diagnostics for this request</span>
            </div>
          </div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.375rem 0.875rem",
              borderRadius: 9999,
              fontSize: "0.8125rem",
              fontWeight: 700,
              background: cf.isBehindCloudflare ? "var(--success-light)" : "var(--danger-light)",
              color: cf.isBehindCloudflare ? "#047857" : "#b91c1c",
            }}
          >
            {cf.isBehindCloudflare ? "Connected" : "Not detected"}
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 1,
            background: "var(--gray-200)",
            borderTop: "1px solid var(--gray-100)",
          }}
        >
          {[
            { label: "CF-IPCountry", value: cf.cfIpCountry },
            { label: "CF-Ray", value: cf.cfRay },
            { label: "CF-Connecting-IP", value: cf.cfConnectingIp },
          ].map((item) => (
            <div key={item.label} style={{ background: "#fff", padding: "1rem 1.25rem" }}>
              <div style={{ fontSize: "0.6875rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--gray-500)", marginBottom: "0.3rem" }}>
                {item.label}
              </div>
              <div
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                  color: item.value ? "var(--gray-900)" : "var(--gray-400)",
                  wordBreak: "break-all",
                }}
              >
                {item.value ?? "Not present"}
              </div>
            </div>
          ))}
        </div>

        {!cf.isBehindCloudflare && (
          <div style={{ display: "flex", gap: "0.625rem", padding: "0.875rem 1.25rem", fontSize: "0.8125rem", color: "#991b1b", background: "var(--danger-light)" }}>
            <i className="fas fa-exclamation-triangle" style={{ marginTop: 2 }} />
            <span>
              <strong>Cloudflare not detected.</strong> Redirects won&apos;t work until this domain&apos;s DNS
              record is Proxied (orange cloud) in Cloudflare.
            </span>
          </div>
        )}

        <div style={{ display: "flex", gap: "0.625rem", padding: "0.875rem 1.25rem", fontSize: "0.8125rem", color: "var(--gray-600)", borderTop: "1px solid var(--gray-100)" }}>
          <i className="fas fa-circle-info" style={{ marginTop: 2, color: "var(--gray-400)" }} />
          <span>Shown for this admin request only. To test as a real visitor, open a public post/page with a VPN set to the target country.</span>
        </div>
      </div>

      <div className="layout-grid" style={{ display: "grid", gap: "1.5rem", gridTemplateColumns: "400px 1fr" }}>
        <div className="form-card" style={{ position: "sticky", top: 80, alignSelf: "start" }}>
          <h3>{editing ? "Edit Redirection" : "Add New Redirection"}</h3>
          <div style={{ marginTop: "1rem" }}>
            <CountryRedirectForm
              editing={editing ? { id: editing.id, countryCode: editing.countryCode, targetUrl: editing.targetUrl } : null}
            />
          </div>
        </div>

        <div className="list-card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Country</th>
                  <th>Target URL</th>
                  <th>Created</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {redirects.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: "center" }}>
                      No redirections found.
                    </td>
                  </tr>
                ) : (
                  redirects.map((r) => (
                    <CountryRedirectRow
                      key={r.id}
                      id={r.id}
                      countryCode={r.countryCode}
                      targetUrl={r.targetUrl}
                      status={r.status ?? true}
                      createdAt={r.createdAt ? new Date(r.createdAt).toISOString().slice(0, 10) : ""}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
