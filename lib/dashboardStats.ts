import { prisma } from "./db";
import type { UserRole } from "@prisma/client";
import { ADJUSTMENT_COUNTRIES } from "./adjustmentCountries";

export interface DashboardStats {
  totalPosts: number;
  publishedPosts: number;
  draftPosts: number;
  pendingComments: number;
  views7d: number;
  recentPosts: { id: number; title: string; slug: string; status: string; date: Date | null }[];
}

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

const COUNTRY_BAR_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777"];
const FLAG_EMOJI: Record<string, string> = Object.fromEntries(
  Object.keys(ADJUSTMENT_COUNTRIES).map((code) => [
    code,
    String.fromCodePoint(...[...code.toUpperCase()].map((c) => 127397 + c.charCodeAt(0))),
  ])
);

/** Mirrors dashboard.php's "Traffic Overview" / "Traffic Trend" / "Traffic
 *  by Country" widgets — Today/Yesterday/Last-7-Days cards (views + unique
 *  visitors), a 7-day daily trend, and a top-7-countries breakdown. Was
 *  entirely missing from this port; the underlying post_stats_daily/
 *  ChapterVisitorLog data has existed since the analytics-adjustment work,
 *  just never surfaced on the dashboard itself. */
export async function getDashboardTraffic(userId: number, canViewAll: boolean): Promise<DashboardTraffic> {
  const postFilter = canViewAll ? {} : { post: { author: { userId } } };
  const visitorPostFilter = canViewAll ? {} : { post: { author: { userId } } };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

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
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
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

export function flagEmoji(countryCode: string): string {
  return FLAG_EMOJI[countryCode] ?? "🌐";
}

/** Mirrors dashboard.php's `$db_can_view_all` / owned-post-id gating: admins
 *  and editors (or anyone with analytics.view_advanced) see site-wide
 *  numbers; authors only see stats for posts they own. */
export async function getDashboardStats(
  userId: number,
  role: UserRole,
  canViewAll: boolean
): Promise<DashboardStats> {
  const postWhere = canViewAll ? {} : { author: { userId } };

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 6);
  weekAgo.setHours(0, 0, 0, 0);

  const [totalPosts, publishedPosts, draftPosts, pendingComments, viewsAgg, recentPosts] = await Promise.all([
    prisma.post.count({ where: postWhere }),
    prisma.post.count({ where: { ...postWhere, status: "published" } }),
    prisma.post.count({ where: { ...postWhere, status: "draft" } }),
    canViewAll ? prisma.comment.count({ where: { status: "pending" } }) : Promise.resolve(0),
    prisma.postStatsDaily.aggregate({
      _sum: { views: true },
      where: {
        statDate: { gte: weekAgo },
        ...(canViewAll ? {} : { post: { author: { userId } } }),
      },
    }),
    prisma.post.findMany({
      where: postWhere,
      orderBy: { date: "desc" },
      take: 8,
      select: { id: true, title: true, slug: true, status: true, date: true },
    }),
  ]);

  return {
    totalPosts,
    publishedPosts,
    draftPosts,
    pendingComments,
    views7d: viewsAgg._sum.views ?? 0,
    recentPosts,
  };
}
