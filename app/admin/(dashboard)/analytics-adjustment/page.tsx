import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ADJUSTMENT_COUNTRIES, ALLOWED_ADJUSTMENT_PERCENTS } from "@/lib/adjustmentCountries";
import { TrafficAdjustmentPanel } from "@/components/admin/TrafficAdjustmentPanel";

export default async function AnalyticsAdjustmentPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  // Real access-control bug fixed here (found by a different AI session
  // working directly from the reference PHP, which hard-exits non-admins
  // before rendering anything with the comment "Only admins can see or
  // change these rules"): this page had no gate at all — any logged-in
  // editor/author (anyone with dashboard_access) could open it directly
  // by URL and see every existing rule (which countries/users get their
  // own analytics numbers adjusted, by how much, by whom). The mutating
  // server actions in analyticsAdjustmentAdmin.ts already required admin
  // — this just closes the read-only viewing gap, matching the
  // activity-logs page's own admin-only pattern.
  const user = await requireUser();
  if (!user || user.role !== "admin") {
    return (
      <div className="empty-state">
        <h3>Access denied</h3>
        <p>Only admins can view traffic adjustment rules.</p>
      </div>
    );
  }

  const { success } = await searchParams;

  const [rules, affectedUsers] = await Promise.all([
    prisma.analyticsAdjustmentRule.findMany({
      orderBy: { createdAt: "desc" },
      include: { user: { select: { username: true } } },
    }),
    prisma.user.findMany({ where: { role: { not: "admin" } }, orderBy: { username: "asc" }, select: { id: true, username: true, role: true } }),
  ]);

  const countryEntries = Object.entries(ADJUSTMENT_COUNTRIES).sort((a, b) => a[0].localeCompare(b[0]));

  const totalRulesCount = rules.length;
  const activeRulesCount = rules.filter((r) => r.enabled).length;
  const allUsersRulesCount = rules.filter((r) => r.scope === "all").length;
  const countriesCoveredCount = new Set(rules.map((r) => r.country)).size;

  const rulesForPanel = rules.map((r) => ({
    id: r.id,
    country: r.country,
    countryName: ADJUSTMENT_COUNTRIES[r.country] ?? r.country,
    reductionPercent: r.reductionPercent,
    scope: r.scope,
    userId: r.userId,
    username: r.user?.username ?? null,
    enabled: r.enabled,
  }));

  return (
    <div>

      {success && (
        <div className="alert alert-success">
          <i className="fas fa-check-circle" /> Rule saved!
        </div>
      )}

      <div className="ta-stats-row">
        <div className="ta-stat">
          <div className="ta-stat-label">Total Rules</div>
          <div className="ta-stat-val">{totalRulesCount}</div>
        </div>
        <div className="ta-stat">
          <div className="ta-stat-label">Active</div>
          <div className="ta-stat-val" style={{ color: "var(--success)" }}>
            {activeRulesCount}
          </div>
        </div>
        <div className="ta-stat">
          <div className="ta-stat-label">Countries Covered</div>
          <div className="ta-stat-val">{countriesCoveredCount}</div>
        </div>
        <div className="ta-stat">
          <div className="ta-stat-label">All-users Rules</div>
          <div className="ta-stat-val">{allUsersRulesCount}</div>
        </div>
      </div>

      <TrafficAdjustmentPanel
        rules={rulesForPanel}
        countryEntries={countryEntries as [string, string][]}
        affectedUsers={affectedUsers}
        allowedPercents={ALLOWED_ADJUSTMENT_PERCENTS}
      />
    </div>
  );
}
