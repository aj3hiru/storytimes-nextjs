import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ADJUSTMENT_COUNTRIES, ALLOWED_ADJUSTMENT_PERCENTS } from "@/lib/adjustmentCountries";
import { TrafficAdjustmentPanel } from "@/components/admin/TrafficAdjustmentPanel";

export default async function AnalyticsAdjustmentPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  // Admins see every rule. Editors see and manage only rules for the
  // authors assigned to them (and never the all-users rules).
  const user = await requireUser();
  if (!user || (user.role !== "admin" && user.role !== "editor")) {
    return (
      <div className="empty-state">
        <h3>Access denied</h3>
        <p>Only admins and editors can view traffic adjustment rules.</p>
      </div>
    );
  }
  const isAdmin = user.role === "admin";
  const assigned = isAdmin
    ? null
    : await prisma.user.findMany({ where: { createdById: user.id }, orderBy: { username: "asc" }, select: { id: true, username: true, role: true } });
  const assignedIds = assigned?.map((u) => u.id) ?? [];

  const { success } = await searchParams;

  const [rules, affectedUsers] = await Promise.all([
    prisma.analyticsAdjustmentRule.findMany({
      where: isAdmin ? undefined : { scope: "user", userId: { in: assignedIds } },
      orderBy: { createdAt: "desc" },
      include: { user: { select: { username: true } } },
    }),
    assigned ?? prisma.user.findMany({ where: { role: { not: "admin" } }, orderBy: { username: "asc" }, select: { id: true, username: true, role: true } }),
  ]);

  const countryEntries = Object.entries(ADJUSTMENT_COUNTRIES).sort((a, b) => a[0].localeCompare(b[0]));

  const totalRulesCount = rules.length;
  const activeRulesCount = rules.filter((r) => r.enabled).length;
  const allUsersRulesCount = rules.filter((r) => r.scope === "all").length;
  // .filter(Boolean) — a global rule has country === null, and shouldn't
  // count as covering "one more country" the way a real per-country rule does.
  const countriesCoveredCount = new Set(rules.map((r) => r.country).filter(Boolean)).size;

  const rulesForPanel = rules.map((r) => ({
    id: r.id,
    country: r.country,
    countryName: r.country ? (ADJUSTMENT_COUNTRIES[r.country] ?? r.country) : null,
    isGlobal: r.isGlobal,
    excludedCountries: r.excludedCountries,
    reductionPercent: r.reductionPercent,
    scope: r.scope,
    userId: r.userId,
    username: r.user?.username ?? null,
    enabled: r.enabled,
  }));

  return (
    <div>

      {!isAdmin && (
        <div className="alert alert-info">
          <i className="fas fa-circle-info" /> You can add rules for the authors assigned to you
          {assignedIds.length ? ` (${assignedIds.length})` : " — none are assigned yet"}.
        </div>
      )}

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
        onlyAssigned={!isAdmin}
      />
    </div>
  );
}
