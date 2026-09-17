"use server";

import { prisma } from "./db";
import { requireUser } from "./auth";
import type { ViewCountDrift, ViewCountAuditResult } from "./adminTypes";

/**
 * Verify & Repair View Counts.
 *
 * Why this exists: the reference PHP buffered views in a JSON file and
 * only flushed them to the database every 10 views / 24 hours, so its
 * Cache Manager needed a "flush pending views" button — without it,
 * recently-tracked views genuinely hadn't reached the database yet.
 *
 * This port has no such buffer: `track-view/route.ts` writes every view
 * straight to the database, so there is never anything "pending" to
 * flush and a direct port of that button would always report zero.
 *
 * What CAN genuinely drift here is different, and this tool targets that
 * instead. A single tracked view writes three rows in sequence inside
 * ONE try block:
 *   1. `postView`        (lifetime total, per post+chapter)
 *   2. `postStatsDaily`  (per post+date+source+country)
 *   3. `postStatsHourly` (per post+hour+source+country)
 * If a later write fails — a deadlock, a connection drop mid-request, a
 * timeout — the shared `catch` swallows it, but the EARLIER writes have
 * already committed. The result is a post whose lifetime total and whose
 * summed daily stats disagree, with no error surfaced anywhere. That's
 * silent, cumulative, and invisible until someone compares the two
 * numbers by hand — which is exactly what this does.
 */

async function requireAdmin() {
  const user = await requireUser();
  if (!user || user.role !== "admin") throw new Error("Admin access required.");
  return user;
}

/**
 * Compares each post's lifetime `postView` total against the sum of its
 * `postStatsDaily` rows. Read-only — changes nothing.
 */
export async function auditViewCounts(): Promise<ViewCountAuditResult> {
  await requireAdmin();

  const [lifetimeRows, dailyRows, posts] = await Promise.all([
    prisma.postView.groupBy({ by: ["postId"], _sum: { views: true } }),
    prisma.postStatsDaily.groupBy({ by: ["postId"], _sum: { views: true } }),
    prisma.post.findMany({ select: { id: true, title: true } }),
  ]);

  // Explicitly typed rather than inferred: the groupBy results' `_sum`
  // shape doesn't narrow reliably here, and letting these Maps infer
  // `{}` values silently breaks the arithmetic below. Being explicit
  // also documents what these actually hold.
  const titleById = new Map<number, string>(posts.map((p) => [p.id, p.title] as [number, string]));
  const lifetimeById = new Map<number, number>(
    lifetimeRows.map((r) => [r.postId, Number(r._sum.views ?? 0)] as [number, number])
  );
  const dailyById = new Map<number, number>(
    dailyRows.map((r) => [r.postId, Number(r._sum.views ?? 0)] as [number, number])
  );

  // Union of both sides — a post present in only one of them is itself a
  // drift worth reporting, not something to skip over.
  const allPostIds = new Set<number>([...lifetimeById.keys(), ...dailyById.keys()]);

  const driftedPosts: ViewCountDrift[] = [];
  let totalLifetime = 0;
  let totalDaily = 0;

  for (const postId of allPostIds) {
    const lifetimeTotal = lifetimeById.get(postId) ?? 0;
    const dailySum = dailyById.get(postId) ?? 0;
    totalLifetime += lifetimeTotal;
    totalDaily += dailySum;
    if (lifetimeTotal !== dailySum) {
      driftedPosts.push({
        postId,
        title: titleById.get(postId) ?? `(deleted post #${postId})`,
        lifetimeTotal,
        dailySum,
        drift: lifetimeTotal - dailySum,
      });
    }
  }

  driftedPosts.sort((a, b) => Math.abs(b.drift) - Math.abs(a.drift));

  return { postsChecked: allPostIds.size, driftedPosts, totalLifetime, totalDaily };
}

/**
 * Repairs drift by writing the MISSING views into `postStatsDaily` under
 * today's date, attributed to source "direct" / country "XX".
 *
 * Two deliberate limitations, stated rather than hidden:
 *
 * 1. Only positive drift is repaired (lifetime > daily — views the daily
 *    table is missing). NEGATIVE drift means the daily table has MORE
 *    than the lifetime total, which shouldn't be possible from the known
 *    failure mode and suggests something else is wrong; silently
 *    "fixing" it by inflating the lifetime total could paper over a real
 *    bug, so those are reported and left alone.
 *
 * 2. The recovered views are attributed to today/direct/XX because their
 *    real date, source and country are genuinely unrecoverable — that
 *    information only ever existed in the request that failed. This
 *    makes the TOTALS agree again (which is what the dashboard's
 *    all-time and per-post figures use) without pretending to know a
 *    breakdown it can't. Anyone reading a daily chart should know the
 *    repair day carries these.
 */
export async function repairViewCounts(): Promise<{ repairedPosts: number; viewsRecovered: number; skippedNegative: number }> {
  await requireAdmin();

  const audit = await auditViewCounts();
  const today = new Date();
  const statDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  let repairedPosts = 0;
  let viewsRecovered = 0;
  let skippedNegative = 0;

  for (const d of audit.driftedPosts) {
    if (d.drift <= 0) {
      skippedNegative++;
      continue;
    }
    // Skip rows whose post no longer exists — postStatsDaily has a real
    // FK to Post, so inserting one would fail anyway.
    const postExists = await prisma.post.count({ where: { id: d.postId } });
    if (postExists === 0) continue;

    await prisma.postStatsDaily.upsert({
      where: { uniq_post_date_source_country: { postId: d.postId, statDate, source: "direct", country: "XX" } },
      create: { postId: d.postId, statDate, source: "direct", country: "XX", views: d.drift },
      update: { views: { increment: d.drift } },
    });
    repairedPosts++;
    viewsRecovered += d.drift;
  }

  return { repairedPosts, viewsRecovered, skippedNegative };
}
