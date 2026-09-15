import { NextResponse, type NextRequest } from "next/server";
import { revokeCurrentSession } from "@/lib/authSession";
import { publicRedirectUrl } from "@/lib/serverRedirect";

/**
 * See lib/urls.ts's publicRedirectUrl() for the full history: a bare
 * relative Location header (this function's previous approach) sidesteps
 * the "internal host leaks into the redirect" bug for a normal HTTP
 * response, but Next.js's own internal response handling can throw
 * `TypeError: Invalid URL` on a relative Location in some contexts —
 * building a real absolute URL from x-forwarded-host avoids both
 * problems at once.
 */
async function doLogout(request: NextRequest) {
  // Real bug fixed here: this used to call session.destroy() (clears the
  // encrypted cookie only) — now revokes the actual database row too
  // (revokeCurrentSession(), see lib/authSession.ts), so a copy of the
  // old cookie value sitting in browser history/back-forward cache
  // cannot be replayed to re-authenticate after logout.
  await revokeCurrentSession();
  return NextResponse.redirect(publicRedirectUrl(request, "/admin-login"), 303);
}

export async function POST(request: NextRequest) {
  return doLogout(request);
}

// The AdminBar's logout link is a plain <a href> (matching the original
// PHP's admin/api/logout.php, which was also a plain GET-able link) —
// supporting GET here too means it works with no JS required.
export async function GET(request: NextRequest) {
  return doLogout(request);
}
