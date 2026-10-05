/**
 * One-time step after deploying the hold-and-release traffic adjustment (lib/viewAdjust.ts).
 *
 * Until now a rule was applied while READING the stats, from the day it was created. The new system takes the
 * reduction off when views are recorded. So that authors' numbers stay what they were, every existing enabled
 * rule is applied once to the traffic from its creation day up to now. Safe to run twice: a rule that was
 * already done (pastAppliedAt set) is skipped.
 *
 *   npx tsx scripts/migrate-view-adjust.ts
 */
import { prisma } from "../lib/db";
import { applyRuleToPast } from "../lib/viewAdjust";

async function main() {
  const rules = await prisma.analyticsAdjustmentRule.findMany({ where: { enabled: true, pastAppliedAt: null } });
  const until = new Date(Date.now() + 24 * 3600 * 1000); // through today
  for (const r of rules) {
    const n = await applyRuleToPast(r.id, { from: r.createdAt, until });
    console.log(`rule #${r.id}: ${n} views taken off (from ${r.createdAt.toISOString().slice(0, 10)})`);
  }
  console.log(`done — ${rules.length} rule(s)`);
}
main().finally(() => prisma.$disconnect());
