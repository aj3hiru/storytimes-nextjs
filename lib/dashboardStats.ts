import { prisma } from "./db";
import { ADJUSTMENT_COUNTRIES } from "./adjustmentCountries";
import { istToday, istAddDays, istDateKey } from "./istDate";

export interface TrafficPeriod {
  views: number;
  uniqueVisitors: number;
}

export interface DashboardTraffic {
  today: TrafficPeriod;
  yesterday: TrafficPeriod;
  last7Days: TrafficPeriod;
  /** One entry per of the last 7 days, oldest first — feeds the trend chart. */
  dailyTrend: { date: string; views: number }[];
  /** Top 7 countries by views over the last 7 days, rest bucketed as "Other". */
  topCountries: { code: string; name: string; views: number; pct: number; color: string }[];
}

// flagEmoji() moved to lib/flagEmoji.ts (zero server-only dependencies,
// so Client Components can import it directly) — re-exported here so
// any existing `from "@/lib/dashboardStats"` imports keep working.
export { flagEmoji } from "./flagEmoji";
const COUNTRY_BAR_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777"];

export interface DashboardScope {
  /** True for an admin (or an editor/author who happens to hold the
   *  explicit analytics.view_advanced permission) — sees everything. */
  canViewAll: boolean;
  /** Whose dashboard is actually being computed — normally the viewer
   *  themselves, but can be a different user when an admin/editor picks
   *  one from the dashboard's own user filter. */
  targetUserId: number;
  /** The target's own managed set (their assigned authors), so the
   *  target's dashboard shows their own scope correctly regardless of
   *  who's currently looking at it. */
  managedUserIds: number[];
}

/**
 * Resolves whose dashboard is being viewed and what scope it should use.
 *
 * Real bug fixed here: `dashboard/page.tsx` computed
 * `canViewAll = role === "admin" || role === "editor" || ...` — the exact
 * same over-permissioning mistake fixed for the Analytics page in Phase
 * 120, independently present here too. Every editor was seeing the
 * WHOLE SITE'S dashboard traffic, not just their own + their assigned
 * authors'.
 *
 * Also resolves the new dashboard user-filter (admin: any user; editor:
 * themselves + their assigned authors; author: no filter at all, always
 * just their own). `requestedUserId` is a URL parameter and is NEVER
 * trusted directly — it's validated against exactly who the viewer is
 * allowed to view before being used, the same pattern used for the
 * author filter on the Analytics page.
 */
export async function resolveDashboardScope(
  viewer: { id: number; role: string },
  viewerPermissions: { analytics: { view_advanced: boolean } },
  requestedUserId: number | null
): Promise<DashboardScope> {
  const viewerCanViewAll = viewer.role === "admin" || Boolean(viewerPermissions.analytics.view_advanced);

  // Who the viewer is even allowed to pick in the filter — computed once,
  // reused both to validate `requestedUserId` and to build the dropdown.
  const viewerManagedUsers = viewerCanViewAll
    ? []
    : await prisma.user.findMany({ where: { createdById: viewer.id }, select: { id: true } });
  const viewerManagedIds = viewerManagedUsers.map((u) => u.id);
  const allowedTargets = viewerCanViewAll ? null : new Set([viewer.id, ...viewerManagedIds]);

  const targetUserId =
    requestedUserId !== null && (allowedTargets === null || allowedTargets.has(requestedUserId))
      ? requestedUserId
      : viewer.id;

  if (targetUserId === viewer.id) {
    return { canViewAll: viewerCanViewAll, targetUserId, managedUserIds: viewerManagedIds };
  }

  // Viewing someone ELSE's dashboard (an admin picked another user, or an
  // editor picked one of their own authors) — resolve THAT target's own
  // scope, so their dashboard reflects what they'd see themselves rather
  // than the viewer's scope.
  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { role: true } });
  if (!target) return { canViewAll: viewerCanViewAll, targetUserId: viewer.id, managedUserIds: viewerManagedIds };
  if (target.role === "admin") return { canViewAll: true, targetUserId, managedUserIds: [] };

  const targetManaged = await prisma.user.findMany({ where: { createdById: targetUserId }, select: { id: true } });
  return { canViewAll: false, targetUserId, managedUserIds: targetManaged.map((u) => u.id) };
}

/** Mirrors dashboard.php's "Traffic Overview" / "Traffic Trend" / "Traffic
 *  by Country" widgets — Today/Yesterday/Last-7-Days cards (views + unique
 *  visitors), a 7-day daily trend, and a top-7-countries breakdown. Was
 *  entirely missing from this port; the underlying post_stats_daily/
 *  ChapterVisitorLog data has existed since the analytics-adjustment work,
 *  just never surfaced on the dashboard itself. */
export async function getDashboardTraffic(scope: DashboardScope): Promise<DashboardTraffic> {
  const { targetUserId: userId, canViewAll } = scope;
  // Own posts PLUS posts of every author this target manages — not
  // own-only, which was the "too little" half of the same bug class (an
  // editor couldn't see their own team's traffic on the dashboard even
  // after Phase 120 fixed the identical gap on the Analytics page). The
  // managed-author relationship is resolved at the DB level via
  // createdById, so scope.managedUserIds itself isn't needed here.
  const scopeAuthorWhere = { user: { OR: [{ id: userId }, { createdById: userId }] } };
  const postFilter = canViewAll ? {} : { post: { author: scopeAuthorWhere } };
  const visitorPostFilter = canViewAll ? {} : { post: { author: scopeAuthorWhere } };

  // Real bug fixed here — see lib/istDate.ts for the full explanation.
  // This used to compute "today" via setHours(0,0,0,0), which is midnight
  // in the server PROCESS'S LOCAL timezone — inconsistent with the write
  // side (track-view/route.ts), which always wrote the UTC calendar date.
  // Real traffic silently split across the wrong date buckets as a
  // result. Now goes through the same explicit IST calculation
  // everywhere "what day is it" matters for this site's audience.
  const today = istToday();
  const yesterday = istAddDays(today, -1);
  const sevenDaysAgo = istAddDays(today, -6);

  const [todayViews, yesterdayViews, weekRows, todayVisitors, yesterdayVisitors, weekVisitorRows, countryRows] = await Promise.all([
    prisma.postStatsDaily.aggregate({ _sum: { views: true }, where: { statDate: today, ...postFilter } }),
    prisma.postStatsDaily.aggregate({ _sum: { views: true }, where: { statDate: yesterday, ...postFilter } }),
    prisma.postStatsDaily.groupBy({ by: ["statDate"], _sum: { views: true }, where: { statDate: { gte: sevenDaysAgo }, ...postFilter } }),
    prisma.chapterVisitorLog.findMany({ where: { visitDate: today, ...visitorPostFilter }, select: { visitorId: true }, distinct: ["visitorId"] }),
    prisma.chapterVisitorLog.findMany({ where: { visitDate: yesterday, ...visitorPostFilter }, select: { visitorId: true }, distinct: ["visitorId"] }),
    prisma.chapterVisitorLog.findMany({ where: { visitDate: { gte: sevenDaysAgo }, ...visitorPostFilter }, select: { visitorId: true }, distinct: ["visitorId"] }),
    prisma.postStatsDaily.groupBy({ by: ["country"], _sum: { views: true }, where: { statDate: { gte: sevenDaysAgo }, ...postFilter } }),
  ]);

  const week7Views = weekRows.reduce((sum, r) => sum + (r._sum.views ?? 0), 0);

  const dailyByDate = new Map<string, number>(weekRows.map((r) => [r.statDate.toISOString().slice(0, 10), r._sum.views ?? 0]));
  const dailyTrend: { date: string; views: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    // Real bug fixed here too: setDate()/getDate() operate in the server
    // PROCESS'S LOCAL timezone, which could shift an already-correct
    // IST-anchored `today` by a day on a server whose local timezone
    // isn't UTC. istAddDays() stays on the same UTC-anchored arithmetic
    // used everywhere else in this fix.
    const key = istDateKey(istAddDays(today, -i));
    dailyTrend.push({ date: key, views: dailyByDate.get(key) ?? 0 });
  }

  const totalCountryViews = countryRows.reduce((sum, r) => sum + (r._sum.views ?? 0), 0) || 1;
  const sortedCountries = countryRows
    .map((r) => ({ code: r.country, views: r._sum.views ?? 0 }))
    .sort((a, b) => b.views - a.views);
  const top7 = sortedCountries.slice(0, 7);
  const otherViews = sortedCountries.slice(7).reduce((sum, r) => sum + r.views, 0);
  const topCountries = top7.map((c, i) => ({
    code: c.code,
    name: ADJUSTMENT_COUNTRIES[c.code] ?? c.code,
    views: c.views,
    pct: Math.round((c.views / totalCountryViews) * 1000) / 10,
    color: COUNTRY_BAR_COLORS[i % COUNTRY_BAR_COLORS.length],
  }));
  if (otherViews > 0) {
    topCountries.push({ code: "XX", name: "Other", views: otherViews, pct: Math.round((otherViews / totalCountryViews) * 1000) / 10, color: "#94a3b8" });
  }

  return {
    today: { views: todayViews._sum.views ?? 0, uniqueVisitors: todayVisitors.length },
    yesterday: { views: yesterdayViews._sum.views ?? 0, uniqueVisitors: yesterdayVisitors.length },
    last7Days: { views: week7Views, uniqueVisitors: weekVisitorRows.length },
    dailyTrend,
    topCountries,
  };
}

/**
 * "Today's Posts" card data — Posted Today / Posted Yesterday counts.
 * Real gap fixed here: an earlier pass invented an entirely different
 * "Total Posts / Published / Drafts / Pending Comments / Views (7 days)"
 * stat grid plus a "Recent Posts" table — NEITHER of which exist in the
 * actual PHP dashboard at all — while never building this card, which
 * genuinely is on the original dashboard. Mirrors the same
 * `$db_can_view_all` / owned-post gating as the rest of this file: admins
 * and editors see site-wide counts, authors only see their own posts.
 */
export async function getTodaysPosts(scope: DashboardScope): Promise<{ postedToday: number; postedYesterday: number }> {
  const { targetUserId: userId, canViewAll } = scope;
  // Same own+managed scoping as getDashboardTraffic above.
  const postWhere = canViewAll ? {} : { author: { user: { OR: [{ id: userId }, { createdById: userId }] } } };

  // Same IST-consistency fix as above.
  const today = istToday();
  const yesterday = istAddDays(today, -1);
  const tomorrow = istAddDays(today, 1);

  const [postedToday, postedYesterday] = await Promise.all([
    prisma.post.count({ where: { ...postWhere, date: { gte: today, lt: tomorrow } } }),
    prisma.post.count({ where: { ...postWhere, date: { gte: yesterday, lt: today } } }),
  ]);

  return { postedToday, postedYesterday };
}
