import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

/**
 * Daily maintenance: prunes visitor/chapter-visitor logs older than 90
 * days (the raw per-visit rows are only needed for dedup — the rolling
 * analytics already aggregate into post_stats_daily). Ports the spirit of
 * db_cron.php's maintenance role.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const [visitorLogDeleted, chapterLogDeleted] = await Promise.all([
    prisma.visitorLog.deleteMany({ where: { visitDate: { lt: ninetyDaysAgo } } }),
    prisma.chapterVisitorLog.deleteMany({ where: { visitDate: { lt: ninetyDaysAgo } } }),
  ]);

  const now = new Date();
  await prisma.appConfig.upsert({
    where: { configKey: "cron_daily_last_run" },
    create: { configKey: "cron_daily_last_run", configValue: now.toISOString() },
    update: { configValue: now.toISOString() },
  });

  return NextResponse.json({
    success: true,
    visitorLogDeleted: visitorLogDeleted.count,
    chapterLogDeleted: chapterLogDeleted.count,
  });
}
