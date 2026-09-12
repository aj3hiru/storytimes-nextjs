import type { NextRequest } from "next/server";

/**
 * Deliberately kept in its OWN file, separate from lib/urls.ts.
 *
 * Real performance regression fixed here: this function originally lived
 * in lib/urls.ts, which is imported by nearly every public page (postUrl,
 * categoryUrl, authorUrl, tagUrl, resolveMediaUrl are used everywhere,
 * including on statically-generated pages). Adding so much as a `import
 * type { NextRequest } from "next/server"` to that file was enough to
 * make Next.js's build treat every page importing it as needing dynamic
 * (per-request) rendering — confirmed in a real production build, where
 * the homepage, post pages, category pages, and several other
 * previously-static/ISR routes all flipped from `○`/`●` to `ƒ`
 * (server-rendered on demand) the moment this import was added, silently
 * undoing this project's ISR/static-generation performance work. Only
 * `middleware.ts` and the login/logout Route Handlers — which are
 * inherently per-request anyway — need this function, so it lives here,
 * completely isolated from the shared URL-building helpers.
 *
 * Builds a full, correctly-public-facing URL for a redirect Location
 * header from an incoming request. Ports the fix for the actual root
 * cause behind two different production incidents:
 *
 * 1. `NextResponse.redirect(new URL(path, request.url))` /
 *    `request.nextUrl.clone()` — resolves against the host Next.js
 *    itself believes it's running on, which behind a reverse-proxy setup
 *    (nginx forwarding to an internal port) turned out to be the
 *    INTERNAL bind address (http://localhost:3001) rather than the
 *    public domain — "the URL sometimes turns into localhost:3001".
 * 2. A bare relative path in the Location header (`{ Location:
 *    "/admin-login" }`) sidesteps problem #1 for a normal HTTP redirect
 *    response (browsers resolve a relative Location against the page's
 *    current origin just fine) — but Next.js's own internal middleware
 *    response handling calls `new URL()` on the NextResponse it's given
 *    and expects a fully-qualified URL; a bare relative path throws
 *    `TypeError [ERR_INVALID_URL]` deep inside Next's own runtime,
 *    before the response ever reaches the browser.
 *
 * The fix: build a real absolute URL, but from `x-forwarded-host`/
 * `x-forwarded-proto` — the headers a standard nginx reverse-proxy
 * config sets to the actual public request details — rather than from
 * `request.url`/`request.nextUrl`, which reflect Next.js's own
 * (potentially internal-only) view of its host.
 */
export function publicRedirectUrl(request: NextRequest, pathAndQuery: string): URL {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host") || request.nextUrl.host;
  const protocol = request.headers.get("x-forwarded-proto") || "https";
  return new URL(pathAndQuery, `${protocol}://${host}`);
}
