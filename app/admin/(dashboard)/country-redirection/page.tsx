import { prisma } from "@/lib/db";
import { addCountryRedirect } from "@/lib/countryRedirectionAdmin";
import { CountryRedirectRow } from "@/components/admin/CountryRedirectRow";

export default async function CountryRedirectionPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const { success } = await searchParams;
  const redirects = await prisma.countryRedirection.findMany({ orderBy: { countryCode: "asc" } });

  return (
    <div>
      <div className="toolbar">
        <h2 className="toolbar-title">Country Redirection</h2>
      </div>

      <div className="alert alert-info" style={{ marginBottom: "1.5rem" }}>
        <i className="fas fa-info-circle" /> This admin CRUD is ready; the actual geo-IP lookup +
        redirect enforcement (the equivalent of{" "}
        <code>includes/country_redirect.php</code>&apos;s <code>runCountryRedirectCheck()</code>)
        isn&apos;t wired into <code>middleware.ts</code> yet — that needs a geo-IP data source
        decision (e.g. Vercel&apos;s built-in <code>request.geo</code>, or a MaxMind lookup).
      </div>

      {success && (
        <div className="alert alert-success">
          <i className="fas fa-check-circle" /> Redirect rule saved!
        </div>
      )}

      <div className="card" style={{ padding: "1.25rem", marginBottom: "1.5rem" }}>
        <h3 style={{ marginBottom: "1rem" }}>Add / Update Rule</h3>
        <form action={addCountryRedirect} style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          <input
            name="countryCode"
            className="form-control"
            placeholder="Country code (e.g. IN, US)"
            maxLength={10}
            required
            style={{ flex: "1 1 150px" }}
          />
          <input name="targetUrl" className="form-control" placeholder="Redirect to URL" required style={{ flex: "2 1 250px" }} />
          <button type="submit" className="btn btn-primary">
            Save Rule
          </button>
        </form>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Country</th>
              <th>Target URL</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {redirects.map((r) => (
              <CountryRedirectRow key={r.id} id={r.id} countryCode={r.countryCode} targetUrl={r.targetUrl} status={r.status ?? true} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
