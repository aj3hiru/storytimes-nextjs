import { prisma } from "./db";
import { ADJUSTMENT_COUNTRIES } from "./adjustmentCountries";
import { istToday, istAddDays, istDayToUtcRange, istHourOfDay } from "./istDate";
import { deductionsForDays, releaseSoon, sumBy, type Deduction } from "./viewAdjust";

export interface TrafficPeriod {
  views: number;
  uniqueVisitors: number;
}

export interface DashboardTraffic {
  /** Today (IST): views and unique visitors. */
  today: TrafficPeriod;
  /** Posts that got at least one view today. */
  postsViewed: number;
  /** Today hour by hour, up to the current hour — feeds the trend chart. */
  hourlyTrend: { date: string; label: string; views: number }[];
  /** Today's top 7 countries by views, rest bucketed as "Other". */
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
  /** Traffic-adjustment rules apply (anyone but an admin is looking) — see lib/viewAdjust.ts. */
  adjust: boolean;
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

  // Real bug fixed here — a real editor could switch this dashboard into
  // ANY other user's, including another editor's or an admin's, if that
  // editor happened to also hold `analytics.view_advanced`. That
  // permission is meant to grant a broader AGGREGATE view of THEIR OWN
  // dashboard's totals — it was never meant to also expand which
  // INDIVIDUAL users they're allowed to switch into via this filter.
  // Those are two different capabilities and must be gated separately:
  // `viewerCanViewAll` still governs the totals shown on the viewer's
  // OWN dashboard below; `canSwitchToAnyUser` — strictly the real role,
  // never widened by any permission — governs who they're allowed to
  // pick here. Only a genuine admin gets an unrestricted target set.
  const canSwitchToAnyUser = viewer.role === "admin";
  // Admins always see the true numbers; anyone else sees them after the traffic-adjustment rules.
  const adjust = viewer.role !== "admin";
  releaseSoon();

  // Who the viewer is even allowed to pick in the filter — computed once,
  // reused both to validate `requestedUserId` and to build the dropdown.
  const viewerManagedUsers = canSwitchToAnyUser
    ? []
    : await prisma.user.findMany({ where: { createdById: viewer.id }, select: { id: true } });
  const viewerManagedIds = viewerManagedUsers.map((u) => u.id);
  const allowedTargets = canSwitchToAnyUser ? null : new Set([viewer.id, ...viewerManagedIds]);

  const targetUserId =
    requestedUserId !== null && (allowedTargets === null || allowedTargets.has(requestedUserId))
      ? requestedUserId
      : viewer.id;

  if (targetUserId === viewer.id) {
    return { canViewAll: viewerCanViewAll, targetUserId, managedUserIds: viewerManagedIds, adjust };
  }

  // Viewing someone ELSE's dashboard (an admin picked another user, or an
  // editor picked one of their own authors) — resolve THAT target's own
  // scope, so their dashboard reflects what they'd see themselves rather
  // than the viewer's scope.
  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { role: true } });
  if (!target) return { canViewAll: viewerCanViewAll, targetUserId: viewer.id, managedUserIds: viewerManagedIds, adjust };
  if (target.role === "admin") return { canViewAll: true, targetUserId, managedUserIds: [], adjust };

  const targetManaged = await prisma.user.findMany({ where: { createdById: targetUserId }, select: { id: true } });
  return { canViewAll: false, targetUserId, managedUserIds: targetManaged.map((u) => u.id), adjust };
}

/** The dashboard's "Traffic Overview" / "Traffic Trend" / "Traffic by Country" — all for TODAY (IST): views,
 *  unique visitors and posts that got views; an hour-by-hour curve; today's top 7 countries. For a non-admin
 *  viewer the traffic-adjustment rules apply (lib/viewAdjust.ts); admins see the raw numbers. */
export async function getDashboardTraffic(scope: DashboardScope): Promise<DashboardTraffic> {
  const { targetUserId: userId, canViewAll } = scope;
  // Own posts PLUS posts of every author this target manages (createdById).
  const scopeAuthorWhere = { user: { OR: [{ id: userId }, { createdById: userId }] } };
  const postFilter = canViewAll ? {} : { post: { author: scopeAuthorWhere } };

  const today = istToday();
  const { start: dayStart, end: dayEnd } = istDayToUtcRange(today);
  const postIds = canViewAll ? null : (await prisma.post.findMany({ where: { author: scopeAuthorWhere }, select: { id: true } })).map((p) => p.id);

  const [todayViews, todayVisitors, countryRows, hourRows, postRows, ded] = await Promise.all([
    prisma.postStatsDaily.aggregate({ _sum: { views: true }, where: { statDate: today, ...postFilter } }),
    prisma.chapterVisitorLog.findMany({ where: { visitDate: today, ...postFilter }, select: { visitorId: true }, distinct: ["visitorId"] }),
    prisma.postStatsDaily.groupBy({ by: ["country"], _sum: { views: true }, where: { statDate: today, ...postFilter } }),
    prisma.postStatsHourly.groupBy({ by: ["statHour"], _sum: { views: true }, where: { statHour: { gte: dayStart, lte: dayEnd }, ...postFilter } }),
    prisma.postStatsDaily.groupBy({ by: ["postId"], _sum: { views: true }, where: { statDate: today, ...postFilter } }),
    scope.adjust ? deductionsForDays(postIds, today, today) : Promise.resolve([] as Deduction[]),
  ]);
  const minus = (raw: number, off: number) => Math.max(0, raw - off);

  const offTotal = ded.reduce((a, d) => a + d.views, 0);
  const offByHour = sumBy(ded, (d) => istHourOfDay(d.statHour));
  const offByCountry = sumBy(ded, (d) => d.country);
  const offByPost = sumBy(ded, (d) => d.postId);

  const hours = Array<number>(24).fill(0);
  for (const r of hourRows) hours[istHourOfDay(r.statHour)] += r._sum.views ?? 0;
  const nowHour = istHourOfDay(new Date());
  const hourlyTrend = hours.slice(0, nowHour + 1).map((v, h) => ({
    date: today.toISOString(),
    label: `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`,
    views: minus(v, offByHour.get(h) ?? 0),
  }));

  const sortedCountries = countryRows
    .map((r) => ({ code: r.country, views: minus(r._sum.views ?? 0, offByCountry.get(r.country) ?? 0) }))
    .filter((c) => c.views > 0)
    .sort((a, b) => b.views - a.views);
  const totalCountryViews = sortedCountries.reduce((sum, r) => sum + r.views, 0) || 1;
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

  const postsViewed = postRows.filter((r) => minus(r._sum.views ?? 0, offByPost.get(r.postId) ?? 0) > 0).length;

  return {
    today: { views: minus(todayViews._sum.views ?? 0, offTotal), uniqueVisitors: todayVisitors.length },
    postsViewed,
    hourlyTrend,
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
export async function getTodaysPosts(scope: DashboardScope): Promise<{ publishedToday: number; publishedYesterday: number }> {
  const { targetUserId: userId, canViewAll } = scope;
  const postWhere = canViewAll ? {} : { author: { user: { OR: [{ id: userId }, { createdById: userId }] } } };
  const today = istToday();
  const tomorrow = istAddDays(today, 1);
  const yesterday = istAddDays(today, -1);
  const [publishedToday, publishedYesterday] = await Promise.all([
    prisma.post.count({ where: { ...postWhere, status: "published", date: { gte: today, lt: tomorrow } } }),
    prisma.post.count({ where: { ...postWhere, status: "published", date: { gte: yesterday, lt: today } } }),
  ]);
  return { publishedToday, publishedYesterday };
}
