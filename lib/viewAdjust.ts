import { prisma } from "./db";
import { istCalendarDate, istDayToUtcRange } from "./istDate";

/**
 * Traffic adjustment, done when views are recorded rather than when they are read.
 *
 * - The raw stats tables (post_stats_daily / post_stats_hourly / post_views) are written at once, exactly as
 *   before — that is what admins see, always, everywhere.
 * - A view on a post covered by an active rule (and from a country the rule covers) is also put on hold for
 *   HOLD_MINUTES. Non-admins don't see held views yet.
 * - When the hold ends, the rule's percentage of those views is taken off for good (analytics_hidden_views)
 *   and the rest simply become visible. A small fraction left over (10% of 3 views = 0.3) is carried, so the
 *   exact percentage adds up over time.
 * - Countries a rule excludes (e.g. India) are never held: they count live, like any post without a rule.
 *
 * What a non-admin sees = raw − hidden − still held. The same numbers on the dashboard, Blogs Manager and
 * Analytics, for authors and for the editors who manage them.
 */

export const HOLD_MINUTES = 20;

export interface ActiveRule {
  id: number;
  isGlobal: boolean;
  country: string | null;
  excluded: Set<string>;
  scope: "all" | "user";
  userId: number | null;
  percent: number;
}

let rulesCache: { at: number; rules: ActiveRule[] } | null = null;

/** Enabled rules, kept for 30 seconds (every tracked view asks). */
export async function activeRules(fresh = false): Promise<ActiveRule[]> {
  if (!fresh && rulesCache && Date.now() - rulesCache.at < 30_000) return rulesCache.rules;
  const rows = await prisma.analyticsAdjustmentRule.findMany({ where: { enabled: true } });
  const rules: ActiveRule[] = rows.map((r) => ({
    id: r.id,
    isGlobal: r.isGlobal,
    country: r.country ? r.country.toUpperCase() : null,
    excluded: new Set((r.excludedCountries ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)),
    scope: r.scope === "user" ? "user" : "all",
    userId: r.userId,
    percent: Math.max(0, Math.min(100, r.reductionPercent)),
  }));
  rulesCache = { at: Date.now(), rules };
  return rules;
}

export function forgetRules() {
  rulesCache = null;
}

/** The rule that applies to a view of this author's post from this country (the strongest one), or null. */
export function ruleFor(rules: ActiveRule[], authorUserId: number, country: string): ActiveRule | null {
  const c = (country || "XX").toUpperCase();
  let best: ActiveRule | null = null;
  for (const r of rules) {
    if (r.scope === "user" && r.userId !== authorUserId) continue;
    const covers = r.isGlobal ? !r.excluded.has(c) : r.country === c;
    if (!covers || r.percent <= 0) continue;
    if (!best || r.percent > best.percent) best = r;
  }
  return best;
}

/** Called for every tracked view (after the raw stats are written). Holds it when a rule covers it. */
export async function holdIfRuled(view: {
  postId: number;
  authorUserId: number;
  statHour: Date;
  statDate: Date;
  source: string;
  country: string;
}): Promise<boolean> {
  const rule = ruleFor(await activeRules(), view.authorUserId, view.country);
  if (!rule) return false;
  await prisma.analyticsHeldView.create({
    data: { postId: view.postId, ruleId: rule.id, statHour: view.statHour, statDate: view.statDate, source: view.source, country: view.country },
  });
  return true;
}

let lastReleaseCheck = 0;
let releasing: Promise<unknown> | null = null;

/** Releases due views at most once a minute — cheap enough to call from every tracked view and admin page. */
export function releaseSoon(): void {
  if (releasing || Date.now() - lastReleaseCheck < 60_000) return;
  lastReleaseCheck = Date.now();
  releasing = releaseHeldViews(false)
    .catch((e) => console.error("releaseHeldViews failed:", e))
    .finally(() => {
      releasing = null;
    });
}

/**
 * Ends the hold of views older than HOLD_MINUTES (or of every held view when `now` is true — the Cache
 * Manager's "fire now"): the rule's percentage is taken off, the rest becomes visible.
 */
export async function releaseHeldViews(now: boolean): Promise<{ released: number; hidden: number }> {
  const cutoff = new Date(Date.now() - HOLD_MINUTES * 60_000);
  const rows = await prisma.analyticsHeldView.findMany({
    where: now ? {} : { createdAt: { lte: cutoff } },
    orderBy: { id: "asc" },
    take: 20000,
  });
  if (rows.length === 0) return { released: 0, hidden: 0 };

  const percentById = new Map((await prisma.analyticsAdjustmentRule.findMany({ select: { id: true, reductionPercent: true, enabled: true } }))
    .map((r) => [r.id, r.enabled ? Math.max(0, Math.min(100, r.reductionPercent)) : 0]));

  // group: post + rule + hour + source + country
  type G = { postId: number; ruleId: number; statHour: Date; statDate: Date; source: string; country: string; n: number };
  const groups = new Map<string, G>();
  for (const r of rows) {
    const k = `${r.postId}|${r.ruleId}|${r.statHour.getTime()}|${r.source}|${r.country}`;
    const g = groups.get(k);
    if (g) g.n++;
    else groups.set(k, { postId: r.postId, ruleId: r.ruleId, statHour: r.statHour, statDate: r.statDate, source: r.source, country: r.country, n: 1 });
  }

  const carryKeys = Array.from(new Set(Array.from(groups.values()).map((g) => `${g.postId}|${g.ruleId}`)));
  const carries = await prisma.analyticsHideCarry.findMany({
    where: { OR: carryKeys.map((k) => ({ postId: Number(k.split("|")[0]), ruleId: Number(k.split("|")[1]) })) },
  });
  const carry = new Map(carries.map((c) => [`${c.postId}|${c.ruleId}`, c.carry]));

  const hiddenRows: { postId: number; ruleId: number; statHour: Date; statDate: Date; source: string; country: string; views: number }[] = [];
  let hiddenTotal = 0;
  for (const g of groups.values()) {
    const pct = percentById.get(g.ruleId) ?? 0; // rule deleted / switched off meanwhile: nothing is taken off
    const ck = `${g.postId}|${g.ruleId}`;
    const total = (carry.get(ck) ?? 0) + (g.n * pct) / 100;
    const hide = Math.min(g.n, Math.floor(total + 1e-9));
    carry.set(ck, total - hide);
    if (hide > 0) {
      hiddenRows.push({ postId: g.postId, ruleId: g.ruleId, statHour: g.statHour, statDate: g.statDate, source: g.source, country: g.country, views: hide });
      hiddenTotal += hide;
    }
  }

  await prisma.$transaction([
    ...(hiddenRows.length ? [prisma.analyticsHiddenView.createMany({ data: hiddenRows })] : []),
    ...carryKeys.map((k) => {
      const [postId, ruleId] = k.split("|").map(Number);
      const c = carry.get(k) ?? 0;
      return prisma.analyticsHideCarry.upsert({ where: { postId_ruleId: { postId, ruleId } }, create: { postId, ruleId, carry: c }, update: { carry: c } });
    }),
    prisma.analyticsHeldView.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } }),
  ]);
  return { released: rows.length, hidden: hiddenTotal };
}

/** How many views are on hold now, and when the oldest one is released. */
export async function heldSummary(): Promise<{ held: number; nextReleaseAt: Date | null }> {
  const [held, oldest] = await Promise.all([
    prisma.analyticsHeldView.count(),
    prisma.analyticsHeldView.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  return { held, nextReleaseAt: oldest ? new Date(oldest.createdAt.getTime() + HOLD_MINUTES * 60_000) : null };
}

/** Post ids a rule covers (its user's posts, or every post for an "all users" rule). */
async function postsForRule(rule: { scope: string; userId: number | null }): Promise<{ id: number; authorUserId: number }[]> {
  const where = rule.scope === "user" && rule.userId ? { author: { userId: rule.userId } } : {};
  const posts = await prisma.post.findMany({ where, select: { id: true, author: { select: { userId: true } } } });
  return posts.map((p) => ({ id: p.id, authorUserId: p.author.userId }));
}

/**
 * "Past traffic too": takes the rule's percentage off the traffic recorded before it existed (from `from`,
 * or all of it), at once. Per hour where the hourly table has the data, otherwise per day. Done once per rule.
 */
export async function applyRuleToPast(ruleId: number, opts: { from?: Date | null; until?: Date; force?: boolean } = {}): Promise<number> {
  const rule = await prisma.analyticsAdjustmentRule.findUnique({ where: { id: ruleId } });
  if (!rule || (rule.pastAppliedAt && !opts.force)) return 0;
  const from = opts.from ?? null;
  const active: ActiveRule = {
    id: rule.id, isGlobal: rule.isGlobal, country: rule.country?.toUpperCase() ?? null,
    excluded: new Set((rule.excludedCountries ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)),
    scope: rule.scope === "user" ? "user" : "all", userId: rule.userId, percent: Math.max(0, Math.min(100, rule.reductionPercent)),
  };
  // Up to the day the rule was made (what came after is held as it arrives), unless told otherwise.
  const until = opts.until ?? rule.createdAt;
  const posts = await postsForRule(rule);
  let hiddenTotal = 0;
  for (let i = 0; i < posts.length; i += 200) {
    const batch = posts.slice(i, i + 200);
    const ids = batch.map((p) => p.id);
    const authorOf = new Map(batch.map((p) => [p.id, p.authorUserId]));
    const dateFilter = { lt: istCalendarDate(until), ...(from ? { gte: istCalendarDate(from) } : {}) };
    const [daily, hourly] = await Promise.all([
      prisma.postStatsDaily.findMany({ where: { postId: { in: ids }, statDate: dateFilter }, select: { postId: true, statDate: true, source: true, country: true, views: true } }),
      prisma.postStatsHourly.findMany({
        where: { postId: { in: ids }, statHour: { lt: istDayToUtcRange(istCalendarDate(until)).start, ...(from ? { gte: istDayToUtcRange(istCalendarDate(from)).start } : {}) } },
        select: { postId: true, statHour: true, source: true, country: true, views: true },
      }),
    ]);
    // hourly rows of each day/post/source/country, to spread a day's reduction over its real hours
    const hoursOf = new Map<string, { statHour: Date; views: number }[]>();
    for (const h of hourly) {
      const k = `${h.postId}|${istCalendarDate(h.statHour).getTime()}|${h.source}|${h.country}`;
      const list = hoursOf.get(k) ?? [];
      list.push({ statHour: h.statHour, views: h.views });
      hoursOf.set(k, list);
    }
    const out: { postId: number; ruleId: number; statHour: Date; statDate: Date; source: string; country: string; views: number }[] = [];
    const carry = new Map<number, number>();
    for (const d of daily) {
      if (!ruleFor([active], authorOf.get(d.postId) ?? -1, d.country)) continue;
      const total = (carry.get(d.postId) ?? 0) + (d.views * active.percent) / 100;
      let hide = Math.min(d.views, Math.floor(total + 1e-9));
      carry.set(d.postId, total - hide);
      if (hide <= 0) continue;
      hiddenTotal += hide;
      const hours = (hoursOf.get(`${d.postId}|${d.statDate.getTime()}|${d.source}|${d.country}`) ?? []).sort((a, b) => b.views - a.views);
      const hourTotal = hours.reduce((a, b) => a + b.views, 0);
      for (const h of hours) {
        if (hide <= 0 || hourTotal <= 0) break;
        const part = Math.min(hide, Math.floor((d.views * active.percent * h.views) / 100 / hourTotal), h.views);
        if (part > 0) {
          out.push({ postId: d.postId, ruleId: rule.id, statHour: h.statHour, statDate: d.statDate, source: d.source, country: d.country, views: part });
          hide -= part;
        }
      }
      if (hide > 0) {
        // what is left (or a day without hourly data) goes to that day's first hour
        out.push({ postId: d.postId, ruleId: rule.id, statHour: hours[0]?.statHour ?? istDayToUtcRange(d.statDate).start, statDate: d.statDate, source: d.source, country: d.country, views: hide });
      }
    }
    if (out.length) await prisma.analyticsHiddenView.createMany({ data: out });
  }
  await prisma.analyticsAdjustmentRule.update({ where: { id: ruleId }, data: { pastAppliedAt: new Date() } });
  return hiddenTotal;
}

// ───────────── reading: what a non-admin sees ─────────────

export interface Deduction {
  postId: number;
  statDate: Date;
  statHour: Date;
  source: string;
  country: string;
  views: number;
}

/** Views taken off (hidden) plus views still on hold, for these posts (null = all) between two IST days. */
export async function deductionsForDays(postIds: number[] | null, start: Date, end: Date): Promise<Deduction[]> {
  if (postIds !== null && postIds.length === 0) return [];
  const postWhere = postIds !== null ? { postId: { in: postIds } } : {};
  const [hidden, held] = await Promise.all([
    prisma.analyticsHiddenView.groupBy({
      by: ["postId", "statDate", "statHour", "source", "country"],
      where: { ...postWhere, statDate: { gte: start, lte: end } },
      _sum: { views: true },
    }),
    prisma.analyticsHeldView.groupBy({
      by: ["postId", "statDate", "statHour", "source", "country"],
      where: { ...postWhere, statDate: { gte: start, lte: end } },
      _count: { _all: true },
    }),
  ]);
  return [
    ...hidden.map((h) => ({ postId: h.postId, statDate: h.statDate, statHour: h.statHour, source: h.source, country: h.country, views: h._sum.views ?? 0 })),
    ...held.map((h) => ({ postId: h.postId, statDate: h.statDate, statHour: h.statHour, source: h.source, country: h.country, views: h._count._all })),
  ];
}

/** All-time views taken off or held, per post (for the lifetime "Views" column). */
export async function lifetimeDeductions(postIds: number[] | null): Promise<Map<number, number>> {
  if (postIds !== null && postIds.length === 0) return new Map();
  const where = postIds !== null ? { postId: { in: postIds } } : {};
  const [hidden, held] = await Promise.all([
    prisma.analyticsHiddenView.groupBy({ by: ["postId"], where, _sum: { views: true } }),
    prisma.analyticsHeldView.groupBy({ by: ["postId"], where, _count: { _all: true } }),
  ]);
  const out = new Map<number, number>();
  for (const h of hidden) out.set(h.postId, (out.get(h.postId) ?? 0) + (h._sum.views ?? 0));
  for (const h of held) out.set(h.postId, (out.get(h.postId) ?? 0) + h._count._all);
  return out;
}

/** Sum of deductions by a key. */
export function sumBy<K>(rows: Deduction[], key: (d: Deduction) => K): Map<K, number> {
  const m = new Map<K, number>();
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + r.views);
  return m;
}
