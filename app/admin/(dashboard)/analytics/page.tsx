import { requireUser, resolvePermissions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ADJUSTMENT_COUNTRIES } from "@/lib/adjustmentCountries";

/**
 * Builds a country -> "keep fraction" map from enabled rules that apply to
 * this viewer (scope 'all', or scope 'user' targeting them specifically).
 * When both an "all" and a "this user" rule exist for the same country,
 * the stronger (larger) reduction wins rather than stacking — ports the
 * exact logic in admin/analytics.php. Admins always see real numbers, so
 * this is never called for them.
 */
async function getCountryAdjustments(userId: number): Promise<Map<string, number>> {
  const rules = await prisma.analyticsAdjustmentRule.findMany({
    where: { enabled: true, OR: [{ scope: "all" }, { scope: "user", userId }] },
    orderBy: { reductionPercent: "desc" },
  });
  const map = new Map<string, number>();
  for (const rule of rules) {
    const frac = Math.max(0, Math.min(100, rule.reductionPercent)) / 100;
    const existing = map.get(rule.country);
    if (existing === undefined || frac > existing) map.set(rule.country, frac);
  }
  return map;
}

function adjustedViews(views: number, country: string, adjustments: Map<string, number>): number {
  const frac = adjustments.get(country) ?? 0;
  return views * (1 - frac);
}

export default async function AnalyticsPage() {
  const user = await requireUser();
  if (!user) return null;

  const permissions = resolvePermissions(user);
  const canViewAll = user.role === "admin" || user.role === "editor" || Boolean(permissions.analytics.view_advanced);
  const isAdminViewer = user.role === "admin";

  const countryAdjustments = isAdminViewer ? new Map<string, number>() : await getCountryAdjustments(user.id);

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  const postFilter = canViewAll ? {} : { post: { author: { userId: user.id } } };

  const [dailyRows, sourceRows, topPostRows, countryRows] = await Promise.all([
    prisma.postStatsDaily.groupBy({
      by: ["statDate", "country"],
      where: { statDate: { gte: thirtyDaysAgo }, ...postFilter },
      _sum: { views: true },
    }),
    prisma.postStatsDaily.groupBy({
      by: ["source", "country"],
      where: { statDate: { gte: thirtyDaysAgo }, ...postFilter },
      _sum: { views: true },
    }),
    prisma.postStatsDaily.groupBy({
      by: ["postId", "country"],
      where: { statDate: { gte: thirtyDaysAgo }, ...postFilter },
      _sum: { views: true },
    }),
    prisma.postStatsDaily.groupBy({
      by: ["country"],
      where: { statDate: { gte: thirtyDaysAgo }, ...postFilter },
      _sum: { views: true },
    }),
  ]);

  const dailyByDate = new Map<string, number>();
  for (const row of dailyRows) {
    const key = row.statDate.toISOString().slice(0, 10);
    const adj = adjustedViews(row._sum.views ?? 0, row.country, countryAdjustments);
    dailyByDate.set(key, (dailyByDate.get(key) ?? 0) + adj);
  }
  const dailyRowsAdjusted = Array.from(dailyByDate.entries())
    .map(([statDate, views]) => ({ statDate, views: Math.round(views) }))
    .sort((a, b) => a.statDate.localeCompare(b.statDate));

  const sourceByName = new Map<string, number>();
  for (const row of sourceRows) {
    const adj = adjustedViews(row._sum.views ?? 0, row.country, countryAdjustments);
    sourceByName.set(row.source, (sourceByName.get(row.source) ?? 0) + adj);
  }

  const topPostsById = new Map<number, number>();
  for (const row of topPostRows) {
    const adj = adjustedViews(row._sum.views ?? 0, row.country, countryAdjustments);
    topPostsById.set(row.postId, (topPostsById.get(row.postId) ?? 0) + adj);
  }
  const topPosts = Array.from(topPostsById.entries())
    .map(([postId, views]) => ({ postId, views: Math.round(views) }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  const countryTotals = countryRows
    .map((row) => ({ country: row.country, views: Math.round(adjustedViews(row._sum.views ?? 0, row.country, countryAdjustments)) }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  const postIds = topPosts.map((p) => p.postId);
  const posts = await prisma.post.findMany({ where: { id: { in: postIds } }, select: { id: true, title: true, slug: true } });
  const postById = new Map(posts.map((p) => [p.id, p]));

  const totalViews = dailyRowsAdjusted.reduce((sum, r) => sum + r.views, 0);
  const maxDayViews = Math.max(1, ...dailyRowsAdjusted.map((r) => r.views));
  const topSources = Array.from(sourceByName.entries())
    .map(([source, views]) => ({ source, views: Math.round(views) }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 4);

  return (
    <div>
      <div className="toolbar">
        <h2 className="toolbar-title">Analytics (last 30 days)</h2>
      </div>

      {!isAdminViewer && countryAdjustments.size > 0 && (
        <div className="alert alert-info" style={{ marginBottom: "1.5rem" }}>
          <i className="fas fa-info-circle" /> Some numbers on this page are adjusted for specific
          countries per your admin&apos;s settings.
        </div>
      )}

      <div className="stats-grid">
        <div className="stat-card primary">
          <div className="stat-header">
            <span className="stat-label">Total Views</span>
          </div>
          <div className="stat-value">{totalViews.toLocaleString()}</div>
        </div>
        {topSources.map((s) => (
          <div className="stat-card" key={s.source}>
            <div className="stat-header">
              <span className="stat-label" style={{ textTransform: "capitalize" }}>
                {s.source}
              </span>
            </div>
            <div className="stat-value">{s.views.toLocaleString()}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: "1.25rem", marginBottom: "1.5rem" }}>
        <h3 style={{ marginBottom: "1rem" }}>Daily Views</h3>
        {dailyRowsAdjusted.length === 0 ? (
          <p style={{ color: "var(--gray-500)" }}>No view data yet.</p>
        ) : (
          <div style={{ display: "flex", alignItems: "flex-end", gap: "3px", height: 140 }}>
            {dailyRowsAdjusted.map((row) => {
              const heightPct = Math.max(2, (row.views / maxDayViews) * 100);
              return (
                <div
                  key={row.statDate}
                  title={`${new Date(row.statDate).toLocaleDateString()}: ${row.views} views`}
                  style={{ flex: 1, height: `${heightPct}%`, background: "var(--primary)", borderRadius: "3px 3px 0 0", minWidth: 4 }}
                />
              );
            })}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: "1.25rem", marginBottom: "1.5rem" }}>
        <h3 style={{ marginBottom: "1rem" }}>Top Posts</h3>
        {topPosts.length === 0 ? (
          <p style={{ color: "var(--gray-500)" }}>No data yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Post</th>
                  <th>Views</th>
                </tr>
              </thead>
              <tbody>
                {topPosts.map((tp) => {
                  const post = postById.get(tp.postId);
                  return (
                    <tr key={tp.postId}>
                      <td>{post?.title ?? `Post #${tp.postId}`}</td>
                      <td>{tp.views.toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: "1.25rem" }}>
        <h3 style={{ marginBottom: "1rem" }}>Top Countries</h3>
        {countryTotals.length === 0 ? (
          <p style={{ color: "var(--gray-500)" }}>No data yet.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Country</th>
                  <th>Views</th>
                </tr>
              </thead>
              <tbody>
                {countryTotals.map((c) => (
                  <tr key={c.country}>
                    <td>{ADJUSTMENT_COUNTRIES[c.country] ?? c.country}</td>
                    <td>{c.views.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
