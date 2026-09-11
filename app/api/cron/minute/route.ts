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
 * Ports the scheduled-publish part of cron/cron_1min.php: any post whose
 * status implies "scheduled" and whose publish date has arrived gets
 * flipped to published. (The schema doesn't have a separate "scheduled"
 * status — posts.status is draft/published/archived — so this treats a
 * draft with a future `date` already set as the schedule signal, which is
 * the same convention post-manager's "Schedule" UI would need to use.)
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const result = await prisma.post.updateMany({
    where: { status: "draft", date: { lte: now, not: null } },
    data: { status: "published" },
  });

  await prisma.appConfig.upsert({
    where: { configKey: "cron_minute_last_run" },
    create: { configKey: "cron_minute_last_run", configValue: now.toISOString() },
    update: { configValue: now.toISOString() },
  });

  return NextResponse.json({ success: true, publishedCount: result.count });
}
