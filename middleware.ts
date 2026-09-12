import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";

// Runs middleware on the Node.js runtime (stable since Next.js 15.2)
// instead of Edge — needed so this can query the database directly for
// country-redirect rules below, the same way includes/country_redirect.php
// did with a live DB connection.
export const runtime = "nodejs";

// Paths that should 301 → /admin-login, exactly like the root .htaccess
// (hides the real admin login path from common bot-scan URLs).
const LOGIN_DECOY_PATHS = new Set([
  "/admin/login",
  "/login",
  "/wp-login",
  "/wp-login.php",
  "/wp-admin",
  "/signin",
  "/administrator",
]);

interface SessionShape {
  userId?: number;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Decoy login paths → real login page
  if (LOGIN_DECOY_PATHS.has(pathname.replace(/\/$/, ""))) {
    return NextResponse.redirect(new URL("/admin-login", request.url), 301);
  }

  // 2. Admin panel auth guard (everything under /admin/* except the login
  //    page itself. IMPORTANT: this must be an exact-prefix check with a
  //    trailing slash or exact match, not a bare `startsWith("/admin")` —
  //    "/admin-login".startsWith("/admin") is ALSO true in JS, since it's
  //    a plain string prefix test with no path-boundary awareness. That
  //    bug made the login page itself require being logged in, which is
  //    exactly backwards and caused a redirect loop in production
  //    (/admin-login → treated as protected → redirect to /admin-login).
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const secretKey = process.env.SECRET_KEY;
    if (!secretKey || secretKey.length < 32) {
      // Fail closed rather than silently letting requests through
      // un-authenticated if the env var is missing in this deploy.
      return new NextResponse("Server misconfigured: SECRET_KEY missing.", { status: 500 });
    }

    const response = NextResponse.next();
    const session = await getIronSession<SessionShape>(request, response, {
      cookieName: "storytimes_session",
      password: secretKey,
    });

    if (!session.userId) {
      const loginUrl = new URL("/admin-login", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // NOTE: role/permission checks for individual admin pages happen in
    // each page's own layout/server component (they need a DB read for
    // the user's `permissions` JSON, which middleware — Edge runtime,
    // no Prisma — cannot do). Middleware only proves "is logged in".
    return response;
  }

  // 3. Deny direct access to files that should never be web-reachable,
  //    mirroring the original .htaccess `<FilesMatch>` deny rules.
  if (/\.(sql|log|env)$/i.test(pathname)) {
    return new NextResponse("Not found", { status: 404 });
  }

  // 4. Country redirection — ports includes/country_redirect.php's
  //    runCountryRedirectCheck(). Only applies to public pages (not admin,
  //    not API routes, not already excluded above). Country is read from
  //    Vercel's edge-populated header (x-vercel-ip-country) — if deploying
  //    somewhere other than Vercel, swap this for that host's equivalent
  //    geo header or a MaxMind/IP-lookup call.
  if (!pathname.startsWith("/api")) {
    const country = request.headers.get("x-vercel-ip-country");
    if (country) {
      const rules = await getCountryRedirectRules();
      const rule = rules.get(country.toUpperCase());
      if (rule) {
        return NextResponse.redirect(rule, 307);
      }
    }
  }

  return NextResponse.next();
}

// Short-lived in-memory cache so this doesn't run a DB query on literally
// every page request — middleware invocations on the same warm serverless
// instance reuse it for up to 60s. Cold starts / other instances still pay
// one query, same as any other per-instance cache.
let redirectRulesCache: { rules: Map<string, string>; expiresAt: number } | null = null;

async function getCountryRedirectRules(): Promise<Map<string, string>> {
  const now = Date.now();
  if (redirectRulesCache && redirectRulesCache.expiresAt > now) {
    return redirectRulesCache.rules;
  }
  try {
    const rows = await prisma.countryRedirection.findMany({ where: { status: true } });
    const rules = new Map<string, string>(
      rows.map((r): [string, string] => [String(r.countryCode).toUpperCase(), String(r.targetUrl)])
    );
    redirectRulesCache = { rules, expiresAt: now + 60_000 };
    return rules;
  } catch (err) {
    console.error("Country redirect check failed:", err);
    return new Map();
  }
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets and Next's internals —
     * mirrors the original .htaccess only rewriting "real" routes.
     */
    "/((?!_next/static|_next/image|favicon.ico|assets/|icons/|uploads/).*)",
  ],
};
