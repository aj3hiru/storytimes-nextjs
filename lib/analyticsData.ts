import "server-only";
import { prisma } from "./db";
import { ADJUSTMENT_COUNTRIES } from "./adjustmentCountries";
import { istCalendarDate, istAddDays, istHourOfDay, istDayToUtcRange } from "./istDate";

/**
 * Ports admin/analytics.php's data functions as closely as practical —
 * range bounds/growth/series/sources/countries/top-posts/unique-visitors
 * /avg-chapters-read — using Prisma aggregate queries instead of the
 * original's raw SQL with a country-adjustment CASE-expression multiplier
 * baked into the SQL itself. Applying the adjustment fraction in JS
 * after grouping (rather than inside the SQL SUM(), as the original
 * does) produces IDENTICAL final numbers — country-level adjustment is
 * a simple per-row multiply-then-sum either way — while staying
 * portable across Prisma's query builder instead of raw SQL.
 */

export type RangeKey = "today" | "yesterday" | "7d" | "30d" | "prev_month" | "6m" | "1y";
export const RANGE_LABELS: Record<RangeKey, string> = {
  today: "Today",
  yesterday: "Yesterday",
  "7d": "7 Days",
  "30d": "30 Days",
  prev_month: "Previous Month",
  "6m": "6 Months",
  "1y": "1 Year",
};
const ALLOWED_RANGES: RangeKey[] = ["today", "yesterday", "7d", "30d", "prev_month", "6m", "1y"];

export interface RangeBounds {
  range: RangeKey;
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
  granularity: "hour" | "day" | "week" | "month";
  label: string;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
// Real bug fixed here — see lib/istDate.ts for the full explanation.
// `startOfDay` used to compute midnight in the server PROCESS'S LOCAL
// timezone via setHours(0,0,0,0), while the write side
// (track-view/route.ts) always wrote the UTC calendar date. On a server
// whose local timezone isn't UTC, those don't agree — a visit could get
// written under one calendar date and looked up under a different one,
// so "Yesterday" (and other ranges) silently missed real traffic. Both
// sides now go through the same explicit, deployment-independent IST
// calculation.
const addDays = istAddDays;
const startOfDay = istCalendarDate;

export function parseRange(input: string | undefined): RangeKey {
  return ALLOWED_RANGES.includes(input as RangeKey) ? (input as RangeKey) : "today";
}

/** Mirrors getRangeBounds() from admin/analytics.php exactly, including
 *  each range's specific granularity and "previous period" comparison
 *  window (used for the growth % stat). */
export function getRangeBounds(range: RangeKey): RangeBounds {
  const today = startOfDay(new Date());
  switch (range) {
    case "yesterday": {
      const d = addDays(today, -1);
      return { range, start: d, end: d, prevStart: addDays(today, -2), prevEnd: addDays(today, -2), granularity: "hour", label: "Yesterday" };
    }
    case "7d":
      return {
        range,
        start: addDays(today, -6),
        end: today,
        prevEnd: addDays(today, -7),
        prevStart: addDays(today, -13),
        granularity: "day",
        label: "Last 7 Days",
      };
    case "30d":
      return {
        range,
        start: addDays(today, -29),
        end: today,
        prevEnd: addDays(today, -30),
        prevStart: addDays(today, -59),
        granularity: "day",
        label: "Last 30 Days",
      };
    case "prev_month": {
      const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const start = new Date(firstOfThisMonth.getFullYear(), firstOfThisMonth.getMonth() - 1, 1);
      const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
      const prevStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
      const prevEnd = new Date(prevStart.getFullYear(), prevStart.getMonth() + 1, 0);
      return { range, start, end, prevStart, prevEnd, granularity: "day", label: "Previous Month" };
    }
    case "6m": {
      const start = new Date(today);
      start.setMonth(start.getMonth() - 6);
      start.setDate(start.getDate() + 1);
      const prevEnd = addDays(start, -1);
      const prevStart = new Date(prevEnd);
      prevStart.setMonth(prevStart.getMonth() - 6);
      prevStart.setDate(prevStart.getDate() + 1);
      return { range, start, end: today, prevStart, prevEnd, granularity: "week", label: "Last 6 Months" };
    }
    case "1y": {
      const start = new Date(today);
      start.setFullYear(start.getFullYear() - 1);
      start.setDate(start.getDate() + 1);
      const prevEnd = addDays(start, -1);
      const prevStart = new Date(prevEnd);
      prevStart.setFullYear(prevStart.getFullYear() - 1);
      prevStart.setDate(prevStart.getDate() + 1);
      return { range, start, end: today, prevStart, prevEnd, granularity: "month", label: "Last 1 Year" };
    }
    case "today":
    default:
      return { range: "today", start: today, end: today, prevStart: addDays(today, -1), prevEnd: addDays(today, -1), granularity: "hour", label: "Today" };
  }
}

export function calculateGrowth(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

export function formatViews(views: number): string {
  if (views >= 1000) return `${(views / 1000).toFixed(2)}K`;
  return String(Math.round(views));
}

/** New feature, no PHP equivalent — per explicit request: a rule must
 *  only affect views recorded from the moment it's created onward, never
 *  retroactively reducing past traffic that already happened before the
 *  rule existed. A flat list (not a pre-merged per-country map) because
 *  resolving "does this rule apply" now depends on the SPECIFIC DATE of
 *  the row being adjusted, not just its country — that can only be
 *  decided per-row, at the point each row's own date is known. */
export interface AdjustmentRuleData {
  /** null = a global ("All Countries") rule. */
  country: string | null;
  excludedCountries: Set<string>;
  fraction: number;
  createdAt: Date;
}
export type CountryAdjustments = AdjustmentRuleData[];

/** Mirrors countryAdjustmentSqlCase()'s multiplier logic, applied in JS
 *  per-row instead of inside a raw SQL CASE expression.
 *
 *  Real bug fixed here, reported live ("100+ new views came in after the
 *  rule was created and none of them were reduced"): the comparison used
 *  to be `date < rule.createdAt` against raw values. But `statDate` is a
 *  MySQL DATE column — every row for a given day carries that day's
 *  MIDNIGHT, not the moment the view actually happened. A rule created
 *  at 07:57 today therefore looked "newer" than today's own 00:00 rows,
 *  so the ENTIRE current day was skipped as if it were in the past —
 *  including views arriving minutes after the rule was made. The rule
 *  only appeared to start working the following day.
 *
 *  Fixed by comparing at DAY granularity on both sides: the rule's
 *  creation day vs. the row's day. A rule created at any time today now
 *  applies to all of today's rows (which is what "from now on" means to
 *  someone who just created a rule and expects to see it working), while
 *  genuinely past days stay untouched exactly as intended. */
function keepFraction(country: string, date: Date, adjustments: CountryAdjustments): number {
  const rowDay = istCalendarDate(date).getTime();
  let strongest = 0;
  for (const rule of adjustments) {
    if (rowDay < istCalendarDate(rule.createdAt).getTime()) continue;
    const matches = rule.country === null ? !rule.excludedCountries.has(country) : rule.country === country;
    if (matches && rule.fraction > strongest) strongest = rule.fraction;
  }
  return Math.round((1 - strongest) * 10000) / 10000;
}

export async function getCountryAdjustments(userId: number, isAdminViewer: boolean): Promise<CountryAdjustments> {
  if (isAdminViewer) return [];
  const rules = await prisma.analyticsAdjustmentRule.findMany({
    where: { enabled: true, OR: [{ scope: "all" }, { scope: "user", userId }] },
  });
  return rules.map((rule) => ({
    country: rule.isGlobal ? null : rule.country,
    excludedCountries: new Set(
      (rule.excludedCountries ?? "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
    ),
    fraction: Math.max(0, Math.min(100, rule.reductionPercent)) / 100,
    createdAt: rule.createdAt,
  }));
}

type PostScope = number[] | null; // null = all posts (canViewAll); array (possibly empty) = restricted to these ids

/**
 * Resolves which posts an analytics view may include.
 *
 * `managedUserIds` is the third scope level, added because an editor is
 * neither "sees only their own posts" nor "sees everything": an editor
 * should see the posts of the authors THEY manage, and nobody else's.
 * Previously `canViewAll` was true for any editor, so every editor saw
 * traffic for the entire site including other editors' authors — on a
 * site with multiple editors that's a real data-visibility leak, not just
 * a UX detail.
 *
 * - `null` returned  → unrestricted (admins, and anyone with the explicit
 *   view-advanced permission).
 * - array returned   → restricted to exactly these post ids (an empty
 *   array legitimately means "no posts", which callers already handle).
 */
async function scopedPostIds(
  userId: number,
  canViewAll: boolean,
  filterAuthorUserId: number | null,
  managedUserIds?: number[] | null
): Promise<PostScope> {
  if (canViewAll && filterAuthorUserId === null) return null;

  // Editor scope: their own posts plus those of every author they manage.
  // Applied whenever a managed set is supplied and this isn't an
  // unrestricted viewer.
  let targetUserIds: number[];
  if (filterAuthorUserId !== null) {
    targetUserIds = [filterAuthorUserId];
  } else if (managedUserIds && managedUserIds.length >= 0) {
    targetUserIds = [userId, ...managedUserIds];
  } else {
    targetUserIds = [userId];
  }

  const authors = await prisma.author.findMany({
    where: { userId: { in: targetUserIds } },
    select: { id: true },
  });
  if (authors.length === 0) return [];
  const posts = await prisma.post.findMany({ where: { authorId: { in: authors.map((a) => a.id) } }, select: { id: true } });
  return posts.map((p) => p.id);
}

export async function getTotalViews(ownedPostIds: PostScope): Promise<number> {
  const where = ownedPostIds !== null ? { postId: { in: ownedPostIds } } : {};
  if (ownedPostIds !== null && ownedPostIds.length === 0) return 0;
  const agg = await prisma.postView.aggregate({ _sum: { views: true }, where });
  return agg._sum.views ?? 0;
}

export async function getRangeTotal(start: Date, end: Date, ownedPostIds: PostScope, adjustments: CountryAdjustments): Promise<number> {
  if (ownedPostIds !== null && ownedPostIds.length === 0) return 0;
  const rows = await prisma.postStatsDaily.groupBy({
    by: ["country", "statDate"],
    where: { statDate: { gte: start, lte: end }, ...(ownedPostIds !== null ? { postId: { in: ownedPostIds } } : {}) },
    _sum: { views: true },
  });
  let total = 0;
  for (const r of rows) total += (r._sum.views ?? 0) * keepFraction(r.country, r.statDate, adjustments);
  return Math.round(total);
}

export async function getUniqueVisitors(start: Date, end: Date, ownedPostIds: PostScope): Promise<number> {
  if (ownedPostIds !== null && ownedPostIds.length === 0) return 0;
  const rows = await prisma.visitorLog.findMany({
    where: { visitDate: { gte: start, lte: end }, ...(ownedPostIds !== null ? { postId: { in: ownedPostIds } } : {}) },
    select: { visitorId: true },
    distinct: ["visitorId"],
  });
  return rows.length;
}

// Removed getAvgChaptersRead() and the "Avg. Chapters Read" Analytics
// stat card it fed — per explicit request, ChapterViewTracker.tsx now
// only sends a tracking request for the FIRST page of a post a visitor
// opens in a session (chapter 2+ never fire), so chapterVisitorLog no
// longer receives real per-chapter data to average across sessions. A
// stat computed from data that no longer exists would just be
// misleadingly wrong rather than "tracking just started", so it was
// removed rather than left showing a number with no honest meaning.

export interface SourceBreakdownRow {
  source: string;
  views: number;
  pct: number;
}
export async function getRangeSources(start: Date, end: Date, ownedPostIds: PostScope, adjustments: CountryAdjustments): Promise<SourceBreakdownRow[]> {
  if (ownedPostIds !== null && ownedPostIds.length === 0) return [];
  const rows = await prisma.postStatsDaily.groupBy({
    by: ["source", "country", "statDate"],
    where: { statDate: { gte: start, lte: end }, ...(ownedPostIds !== null ? { postId: { in: ownedPostIds } } : {}) },
    _sum: { views: true },
  });
  const bySource = new Map<string, number>();
  for (const r of rows) {
    const v = (r._sum.views ?? 0) * keepFraction(r.country, r.statDate, adjustments);
    bySource.set(r.source, (bySource.get(r.source) ?? 0) + v);
  }
  const total = Array.from(bySource.values()).reduce((a, b) => a + b, 0);
  return Array.from(bySource.entries())
    .map(([source, views]) => ({ source, views: Math.round(views), pct: total > 0 ? Math.round((views / total) * 1000) / 10 : 0 }))
    .sort((a, b) => b.views - a.views);
}

export interface CountryBreakdownRow {
  country: string;
  views: number;
  pct: number;
}
export async function getRangeCountries(
  start: Date,
  end: Date,
  ownedPostIds: PostScope,
  adjustments: CountryAdjustments,
  topN = 7
): Promise<CountryBreakdownRow[]> {
  if (ownedPostIds !== null && ownedPostIds.length === 0) return [];
  const rows = await prisma.postStatsDaily.groupBy({
    by: ["country", "statDate"],
    where: { statDate: { gte: start, lte: end }, ...(ownedPostIds !== null ? { postId: { in: ownedPostIds } } : {}) },
    _sum: { views: true },
  });
  const byCountry = new Map<string, number>();
  for (const r of rows) {
    const v = (r._sum.views ?? 0) * keepFraction(r.country, r.statDate, adjustments);
    byCountry.set(r.country, (byCountry.get(r.country) ?? 0) + v);
  }
  const adjusted = Array.from(byCountry.entries())
    .map(([country, views]) => ({ country: country.toUpperCase(), views: Math.round(views) }))
    .filter((r) => r.views > 0)
    .sort((a, b) => b.views - a.views);
  const total = adjusted.reduce((a, b) => a + b.views, 0);
  if (total <= 0) return [];
  const top = adjusted.slice(0, topN);
  const rest = adjusted.slice(topN);
  const out: CountryBreakdownRow[] = top.map((r) => ({ country: r.country, views: r.views, pct: Math.round((r.views / total) * 1000) / 10 }));
  const otherViews = rest.reduce((a, b) => a + b.views, 0);
  if (otherViews > 0) out.push({ country: "OTHER", views: otherViews, pct: Math.round((otherViews / total) * 1000) / 10 });
  return out;
}

export interface TopPost {
  id: number;
  title: string;
  bannerImage: string | null;
  rangeViews: number;
  percentage: number;
}
export async function getTopPostsForRange(
  start: Date,
  end: Date,
  ownedPostIds: PostScope,
  adjustments: CountryAdjustments,
  limit: number,
  offset: number
): Promise<{ posts: TopPost[]; total: number }> {
  if (ownedPostIds !== null && ownedPostIds.length === 0) return { posts: [], total: 0 };
  const rows = await prisma.postStatsDaily.groupBy({
    by: ["postId", "country", "statDate"],
    where: { statDate: { gte: start, lte: end }, ...(ownedPostIds !== null ? { postId: { in: ownedPostIds } } : {}) },
    _sum: { views: true },
  });
  const byPost = new Map<number, number>();
  for (const r of rows) {
    const v = (r._sum.views ?? 0) * keepFraction(r.country, r.statDate, adjustments);
    byPost.set(r.postId, (byPost.get(r.postId) ?? 0) + v);
  }
  const total = byPost.size;
  if (total === 0) return { posts: [], total: 0 };
  const sorted = Array.from(byPost.entries()).sort((a, b) => b[1] - a[1]);
  const page = sorted.slice(offset, offset + limit);
  if (page.length === 0) return { posts: [], total };

  const ids = page.map(([id]) => id);
  const details = await prisma.post.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true, featuredImage: { select: { filePath: true } } },
  });
  const detailById = new Map<number, (typeof details)[number]>(details.map((d) => [d.id, d]));
  const maxRaw = Math.max(...page.map(([, v]) => v), 1);

  const posts: TopPost[] = [];
  for (const [id, rawViews] of page) {
    const d = detailById.get(id);
    if (!d) continue;
    posts.push({
      id,
      title: d.title,
      bannerImage: d.featuredImage?.filePath ?? null,
      rangeViews: Math.round(rawViews),
      percentage: (rawViews / maxRaw) * 100,
    });
  }
  return { posts, total };
}

/** Mirrors getRangeSeries()/getHourlySeriesForDate() — a labeled series
 *  bucketed to the range's granularity (hour for today/yesterday, day
 *  for 7d/30d/prev_month, week for 6m, month for 1y). */
export async function getRangeSeries(bounds: RangeBounds, ownedPostIds: PostScope, adjustments: CountryAdjustments): Promise<{ labels: string[]; data: number[] }> {
  if (bounds.granularity === "hour") {
    // Real-time hourly tracking (post_stats_hourly) — each visit
    // increments its own hour's bucket immediately, exactly like
    // post_stats_daily does for days. Previously this showed the day's
    // total as a single fabricated point because no hourly table
    // existed; now genuinely reads a real hour-by-hour curve.
    // The real UTC instant window this IST calendar day actually spans.
    // `bounds.start` is a calendar-date LABEL (a UTC-midnight Date standing
    // in for an IST day, matching how MySQL DATE columns work), whereas
    // `statHour` holds genuine UTC instants — comparing the two directly
    // is exactly what left this chart empty for today. `istDayToUtcRange()`
    // converts between the two spaces explicitly. See lib/istDate.ts.
    const { start: dayStart, end: dayEnd } = istDayToUtcRange(bounds.start);

    const labels = Array.from({ length: 24 }, (_, h) => hourLabel(h));
    const data = Array(24).fill(0);
    if (ownedPostIds !== null && ownedPostIds.length === 0) {
      return { labels, data };
    }
    const rows = await prisma.postStatsHourly.groupBy({
      by: ["statHour", "country"],
      where: { statHour: { gte: dayStart, lte: dayEnd }, ...(ownedPostIds !== null ? { postId: { in: ownedPostIds } } : {}) },
      _sum: { views: true },
    });
    for (const r of rows) {
      // Real bug fixed here: getHours() reads the hour in the server
      // PROCESS'S LOCAL timezone, not IST — see istHourOfDay()'s doc
      // comment in lib/istDate.ts for why a simple offset-shift isn't
      // enough on its own (IST's half-hour offset splits UTC-hour
      // buckets across two IST hours if not handled at write time too).
      const hour = istHourOfDay(r.statHour);
      data[hour] += (r._sum.views ?? 0) * keepFraction(r.country, r.statHour, adjustments);
    }
    return { labels, data: data.map((v) => Math.round(v)) };
  }

  if (ownedPostIds !== null && ownedPostIds.length === 0) {
    return { labels: [], data: [] };
  }
  const rows = await prisma.postStatsDaily.groupBy({
    by: ["statDate", "country"],
    where: { statDate: { gte: bounds.start, lte: bounds.end }, ...(ownedPostIds !== null ? { postId: { in: ownedPostIds } } : {}) },
    _sum: { views: true },
  });
  const byDate = new Map<string, number>();
  for (const r of rows) {
    const key = ymd(r.statDate);
    byDate.set(key, (byDate.get(key) ?? 0) + (r._sum.views ?? 0) * keepFraction(r.country, r.statDate, adjustments));
  }

  const labels: string[] = [];
  const data: number[] = [];
  if (bounds.granularity === "week") {
    let cursor = new Date(bounds.start);
    while (cursor <= bounds.end) {
      const weekEnd = new Date(Math.min(addDays(cursor, 6).getTime(), bounds.end.getTime()));
      let sum = 0;
      for (let d = new Date(cursor); d <= weekEnd; d = addDays(d, 1)) sum += byDate.get(ymd(d)) ?? 0;
      labels.push(cursor.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
      data.push(Math.round(sum));
      cursor = addDays(cursor, 7);
    }
  } else if (bounds.granularity === "month") {
    let cursor = new Date(bounds.start.getFullYear(), bounds.start.getMonth(), 1);
    while (cursor <= bounds.end) {
      const monthKey = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      let sum = 0;
      for (const [d, v] of byDate) if (d.startsWith(monthKey)) sum += v;
      labels.push(cursor.toLocaleDateString("en-US", { month: "short", year: "numeric" }));
      data.push(Math.round(sum));
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
  } else {
    for (let d = new Date(bounds.start); d <= bounds.end; d = addDays(d, 1)) {
      labels.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
      data.push(Math.round(byDate.get(ymd(d)) ?? 0));
    }
  }
  return { labels, data };
}

function hourLabel(h: number): string {
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:00 ${period}`;
}

export const SOURCE_META: Record<string, { label: string; color: string }> = {
  google: { label: "Google", color: "#4285F4" },
  facebook: { label: "Facebook", color: "#1877F2" },
  instagram: { label: "Instagram", color: "#E1306C" },
  twitter: { label: "Twitter / X", color: "#111827" },
  youtube: { label: "YouTube", color: "#FF0000" },
  whatsapp: { label: "WhatsApp", color: "#25D366" },
  telegram: { label: "Telegram", color: "#229ED9" },
  pinterest: { label: "Pinterest", color: "#E60023" },
  linkedin: { label: "LinkedIn", color: "#0A66C2" },
  bing: { label: "Bing", color: "#00809D" },
  yahoo: { label: "Yahoo", color: "#6001D2" },
  reddit: { label: "Reddit", color: "#FF4500" },
  other_search: { label: "Other Search", color: "#8b5cf6" },
  direct: { label: "Direct", color: "#7c3aed" },
  other: { label: "Other", color: "#9ca3af" },
};
export function sourceMetaFor(key: string) {
  return SOURCE_META[key] ?? { label: key.charAt(0).toUpperCase() + key.slice(1), color: "#9ca3af" };
}

export const COUNTRY_COLORS = ["#2563eb", "#dc2626", "#16a34a", "#d97706", "#9333ea", "#0891b2", "#db2777", "#9ca3af"];
export function countryNameFor(code: string): string {
  if (code === "OTHER") return "Other";
  if (code === "XX") return "Unknown";
  return ADJUSTMENT_COUNTRIES[code] ?? code;
}

export { scopedPostIds };
export type { PostScope };
