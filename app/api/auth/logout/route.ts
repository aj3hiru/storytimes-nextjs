import { NextResponse, type NextRequest } from "next/server";
import { revokeCurrentSession } from "@/lib/authSession";
import { publicRedirectUrl } from "@/lib/serverRedirect";
import { safeAdminRedirect } from "@/lib/adminAuth";

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
  // Carry the page they were on into the login URL, so signing back in
  // returns them there instead of always dumping them on the dashboard.
  // Taken from the Referer (the admin page whose sidebar/bar they clicked
  // logout from) and passed through safeAdminRedirect(), the same
  // allowlist the login form already uses for its `next` param — so this
  // can only ever produce an /admin path, never an attacker-supplied
  // destination, even though Referer is client-controlled.
  let next: string | null = null;
  try {
    const referer = request.headers.get("referer");
    if (referer) {
      const url = new URL(referer);
      if (url.origin === new URL(request.url).origin) {
        const candidate = url.pathname + url.search;
        const safe = safeAdminRedirect(candidate);
        // safeAdminRedirect falls back to the dashboard for anything it
        // doesn't recognise; only carry a value that's genuinely the page
        // they came from.
        if (safe === candidate) next = safe;
      }
    }
  } catch {
    // Malformed Referer — just fall through to the plain login page.
  }

  const target = next ? `/admin-login?next=${encodeURIComponent(next)}` : "/admin-login";
  return NextResponse.redirect(publicRedirectUrl(request, target), 303);
}

export async function POST(request: NextRequest) {
  return doLogout(request);
}

/**
 * CRITICAL bug fixed here — the actual root cause of "kisi bhi admin page
 * pe jaate hi randomly logout ho jaata hoon", including the specific
 * reported pattern of Cache Manager / Activity Logs breaking and a
 * refresh landing on the login page.
 *
 * This route used to also export a GET handler, and the sidebar's
 * "Logout" entry is rendered by SidebarNav.tsx through Next.js's own
 * `<Link>` component. Next.js AUTOMATICALLY PREFETCHES `<Link>` targets
 * — by default, whenever the link scrolls into the viewport (and the
 * admin sidebar's Logout item is permanently visible on every single
 * admin page). Prefetching issues a real GET request to the href. So on
 * every admin page load, the browser was quietly firing a GET at
 * /api/auth/logout in the background — which, with a GET handler
 * present, ran doLogout() for real: revoking the current session row in
 * the database and clearing the cookie, without the person ever
 * clicking anything.
 *
 * That explains every part of the reported symptom set precisely:
 * the logout happens silently and unpredictably (whenever a prefetch
 * fires); the CURRENT page keeps rendering fine because its HTML was
 * already produced before the prefetch landed; the very NEXT navigation
 * or server action then fails its admin check ("Access denied" on
 * Activity Logs, "Admin access required" thrown by Cache Manager's
 * server actions); other admin pages render their shell but no data;
 * and a refresh finally goes to the login page, because by then the
 * session genuinely is revoked. It also explains why it seemed to
 * correlate with those two pages specifically — they're simply the ones
 * that surface a failed admin check as a visible message rather than
 * silently rendering empty.
 *
 * Logout is a STATE-CHANGING action and must never be reachable by GET
 * (this is also exactly why the HTTP spec reserves GET for safe,
 * side-effect-free requests — any prefetcher, crawler, or link-preview
 * bot may issue one at any time). GET is now gone entirely; the sidebar
 * and AdminBar both submit a real POST instead.
 */
