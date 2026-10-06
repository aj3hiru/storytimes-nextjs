import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized, runJob, isDailyDue } from "@/lib/cron/jobs";

export const dynamic = "force-dynamic";

/**
 * Every-minute job: scheduled posts, held traffic release, cache auto-clear.
 * Called by the built-in scheduler (instrumentation.ts) with ?auto=1 — that
 * call also runs the daily job when it is due — or by an external crontab.
 * Requires CRON_SECRET (or the scheduler's own secret) as a Bearer token.
 */
export async function GET(request: NextRequest) {
  if (!(await isCronAuthorized(request.headers.get("authorization")))) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  const auto = request.nextUrl.searchParams.get("auto") === "1";
  const run = await runJob("minute", auto ? "auto" : "external");
  const daily = auto && (await isDailyDue()) ? await runJob("daily", "auto") : null;
  return NextResponse.json({ success: true, run, daily });
}
