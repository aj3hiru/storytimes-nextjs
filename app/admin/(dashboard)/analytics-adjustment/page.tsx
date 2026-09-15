import { prisma } from "@/lib/db";
import { ADJUSTMENT_COUNTRIES, ALLOWED_ADJUSTMENT_PERCENTS } from "@/lib/adjustmentCountries";
import { TrafficAdjustmentPanel } from "@/components/admin/TrafficAdjustmentPanel";

/** Ported 1:1 from admin/analytics-adjustment.php: info banner, a 4-up
 *  summary stat row (Total Rules / Active / Countries Covered / All-users
 *  Rules), then the sticky-form + rules-table two-column layout. */
export default async function AnalyticsAdjustmentPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
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
