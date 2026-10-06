import { guardPage } from "@/lib/pageGuard";
import { prisma } from "@/lib/db";
import { getCloudflareDetectionInfo } from "@/lib/countryRedirectionAdmin";
import { COUNTRY_OPTIONS } from "@/lib/countryOptions";
import { flagEmoji } from "@/lib/flag";
import { CountryRedirectForm } from "@/components/admin/CountryRedirectForm";
import { CountryRedirectRow } from "@/components/admin/CountryRedirectRow";

/**
 * Country redirection: visitors from a chosen country who open a post or
 * page are sent to another URL (enforced in middleware.ts from Cloudflare's
 * cf-ipcountry header). Homepage, categories, tags, search and the admin
 * are never redirected.
 */
export default async function CountryRedirectionPage({ searchParams }: { searchParams: Promise<{ success?: string; edit?: string }> }) {
  const denied = await guardPage((p) => p.settings.general, "Only users with Settings access can manage country redirection.");
  if (denied) return denied;

  const { success, edit } = await searchParams;
  const editId = edit ? parseInt(edit, 10) : 0;

  const [redirects, editing, cf] = await Promise.all([
    prisma.countryRedirection.findMany({ orderBy: { countryCode: "asc" } }),
    editId ? prisma.countryRedirection.findUnique({ where: { id: editId } }) : Promise.resolve(null),
    getCloudflareDetectionInfo(),
  ]);

  const successMessages: Record<string, string> = {
    created: "Redirection rule created.",
    updated: "Redirection rule updated.",
    deleted: "Redirection rule deleted.",
  };
  const active = redirects.filter((r) => r.status ?? true).length;

  return (
    <div className="cr-wrap">
      {success && successMessages[success] && (
        <div className="alert alert-success" style={{ marginBottom: "1rem" }}>
          <i className="fas fa-check-circle" /> {successMessages[success]} Visitors see the change within a minute.
        </div>
      )}

      <div className="cr-stats">
        <div className="cr-stat">
          <span className="cr-stat-ico" style={{ background: "#ede9fe", color: "#7c3aed" }}>
            <i className="fas fa-route" />
          </span>
          <div>
            <strong>{redirects.length}</strong>
            <span>Total rules</span>
          </div>
        </div>
        <div className="cr-stat">
          <span className="cr-stat-ico" style={{ background: "#d1fae5", color: "#059669" }}>
            <i className="fas fa-circle-check" />
          </span>
          <div>
            <strong>{active}</strong>
            <span>Active</span>
          </div>
        </div>
        <div className="cr-stat">
          <span className="cr-stat-ico" style={{ background: "#f3f4f6", color: "#6b7280" }}>
            <i className="fas fa-circle-pause" />
          </span>
          <div>
            <strong>{redirects.length - active}</strong>
            <span>Paused</span>
          </div>
        </div>
        <div className={`cr-stat cr-cf ${cf.isBehindCloudflare ? "ok" : "bad"}`}>
          <span className="cr-stat-ico">
            <i className="fas fa-shield-halved" />
          </span>
          <div>
            <strong>{cf.isBehindCloudflare ? "Cloudflare connected" : "Cloudflare not detected"}</strong>
            <span>
              Your country: {cf.cfIpCountry ? `${flagEmoji(cf.cfIpCountry)} ${cf.cfIpCountry}` : "unknown"}
            </span>
          </div>
        </div>
      </div>

      {!cf.isBehindCloudflare && (
        <div className="cr-alert">
          <i className="fas fa-triangle-exclamation" />
          <span>
            <strong>Redirects need Cloudflare.</strong> Turn on the orange cloud (Proxied) for this domain&apos;s DNS record, otherwise the
            visitor&apos;s country is unknown and nobody is redirected.
          </span>
        </div>
      )}

      <div className="cr-grid">
        <section className="cr-card cr-form-card">
          <div className="cr-card-hd">
            <h3>
              <i className={`fas ${editing ? "fa-pen" : "fa-plus"}`} /> {editing ? "Edit redirection" : "Add redirection"}
            </h3>
            <p>Applies to post and page links only.</p>
          </div>
          <CountryRedirectForm editing={editing ? { id: editing.id, countryCode: editing.countryCode, targetUrl: editing.targetUrl } : null} />
        </section>

        <section className="cr-card">
          <div className="cr-card-hd">
            <h3>
              <i className="fas fa-list" /> Redirection rules
            </h3>
            <p>One rule per country. Paused rules are kept but not applied.</p>
          </div>
          {redirects.length === 0 ? (
            <div className="cr-empty">
              <i className="fas fa-earth-asia" />
              <strong>No redirections yet</strong>
              <span>Add a rule on the left to send visitors from a country to another site.</span>
            </div>
          ) : (
            <ul className="cr-list">
              {redirects.map((r) => (
                <CountryRedirectRow
                  key={r.id}
                  id={r.id}
                  countryCode={r.countryCode}
                  countryName={COUNTRY_OPTIONS[r.countryCode] ?? r.countryCode}
                  flag={flagEmoji(r.countryCode)}
                  targetUrl={r.targetUrl}
                  status={r.status ?? true}
                  editing={editId === r.id}
                  createdAt={r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : ""}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      <details className="cr-card cr-diag">
        <summary>
          <i className="fas fa-stethoscope" /> Cloudflare diagnostics for this request
        </summary>
        <div className="cr-diag-grid">
          {[
            { label: "CF-IPCountry", value: cf.cfIpCountry },
            { label: "CF-Ray", value: cf.cfRay },
            { label: "CF-Connecting-IP", value: cf.cfConnectingIp },
          ].map((item) => (
            <div key={item.label}>
              <span>{item.label}</span>
              <code>{item.value ?? "Not present"}</code>
            </div>
          ))}
        </div>
        <p>To test as a visitor, open a public post or page with a VPN set to the target country. Admins are never redirected inside the admin panel.</p>
      </details>
    </div>
  );
}
