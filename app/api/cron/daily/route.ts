import { NextResponse, type NextRequest } from "next/server";
import { isCronAuthorized, runJob } from "@/lib/cron/jobs";

export const dynamic = "force-dynamic";

/**
 * Daily maintenance: expired logins, optional visitor-log cleanup.
 * Requires CRON_SECRET (or the scheduler's own secret) as a Bearer token.
 */
export async function GET(request: NextRequest) {
  if (!(await isCronAuthorized(request.headers.get("authorization")))) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  const auto = request.nextUrl.searchParams.get("auto") === "1";
  const run = await runJob("daily", auto ? "auto" : "external");
  return NextResponse.json({ success: true, run });
}
