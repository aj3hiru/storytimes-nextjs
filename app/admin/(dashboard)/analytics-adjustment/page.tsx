import { prisma } from "@/lib/db";
import { saveAdjustmentRule } from "@/lib/analyticsAdjustmentAdmin";
import { ADJUSTMENT_COUNTRIES, ALLOWED_ADJUSTMENT_PERCENTS } from "@/lib/adjustmentCountries";
import { AdjustmentRuleRow } from "@/components/admin/AdjustmentRuleRow";

export default async function AnalyticsAdjustmentPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; edit?: string }>;
}) {
  const { success, edit } = await searchParams;
  const editId = edit ? parseInt(edit, 10) : 0;

  const [rules, affectedUsers, editing] = await Promise.all([
    prisma.analyticsAdjustmentRule.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: { select: { username: true } } },
    }),
    prisma.user.findMany({ where: { role: { not: "admin" } }, orderBy: { username: "asc" }, select: { id: true, username: true, role: true } }),
    editId ? prisma.analyticsAdjustmentRule.findUnique({ where: { id: editId } }) : Promise.resolve(null),
  ]);

  const countryEntries = Object.entries(ADJUSTMENT_COUNTRIES).sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <div>
      <div className="toolbar">
        <h2 className="toolbar-title">Analytics Adjustment</h2>
      </div>

      <div className="alert alert-info" style={{ marginBottom: "1.5rem" }}>
        <i className="fas fa-info-circle" /> Admins always see real, unadjusted numbers everywhere.
        These rules only reduce what <strong>editors/authors</strong> see on their own analytics
        dashboard, for specific countries — the actual stored view counts are never touched.
      </div>

      {success && (
        <div className="alert alert-success">
          <i className="fas fa-check-circle" /> Rule saved!
        </div>
      )}

      <div className="card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
        <h3 style={{ marginBottom: "1rem" }}>{editing ? "Edit Rule" : "Add New Rule"}</h3>
        <form action={saveAdjustmentRule} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <input type="hidden" name="editId" value={editing?.id ?? 0} />
          <div className="filter-row" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <div className="form-group">
              <label htmlFor="country">Country</label>
              <select id="country" name="country" className="form-control" defaultValue={editing?.country ?? ""} required>
                <option value="">Select a country…</option>
                {countryEntries.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name} ({code})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="reductionPercent">Reduce views by</label>
              <select id="reductionPercent" name="reductionPercent" className="form-control" defaultValue={editing?.reductionPercent ?? 20}>
                {ALLOWED_ADJUSTMENT_PERCENTS.map((p) => (
                  <option key={p} value={p}>
                    {p}%
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="scope">Applies to</label>
              <select id="scope" name="scope" className="form-control" defaultValue={editing?.scope ?? "all"}>
                <option value="all">All editors/authors</option>
                <option value="user">Specific user</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="userId">
              User <span className="form-hint">— only used when scope is &quot;Specific user&quot;</span>
            </label>
            <select id="userId" name="userId" className="form-control" defaultValue={editing?.userId ?? ""}>
              <option value="">— None —</option>
              {affectedUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.username} ({u.role})
                </option>
              ))}
            </select>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input type="checkbox" name="enabled" defaultChecked={editing?.enabled ?? true} />
            Enabled
          </label>
          <div>
            <button type="submit" className="btn btn-primary">
              {editing ? "Save Changes" : "Create Rule"}
            </button>
          </div>
        </form>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Country</th>
              <th>Reduction</th>
              <th>Scope</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <AdjustmentRuleRow
                key={rule.id}
                id={rule.id}
                countryName={ADJUSTMENT_COUNTRIES[rule.country] ?? rule.country}
                countryCode={rule.country}
                reductionPercent={rule.reductionPercent}
                scope={rule.scope}
                username={rule.user?.username ?? null}
                enabled={rule.enabled}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
