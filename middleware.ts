import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { prisma } from "@/lib/db";
import { publicRedirectUrl } from "@/lib/serverRedirect";
import { getSessionOptions } from "@/lib/sessionConfig";

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
    return NextResponse.redirect(publicRedirectUrl(request, "/admin-login"), 301);
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
    // Real bug fixed here — the likely cause of "dusre admin pe switch
    // karte waqt kabhi kabhi logout ho jaata hai": admin pages are
    // per-user, authenticated content that must never be cached by any
    // intermediate layer (this site sits behind Cloudflare). Without an
    // explicit no-store, a shared/CDN cache sitting in front of this
    // origin could serve one staff member's cached admin response
    // (including its auth-check outcome) to a DIFFERENT session shortly
    // after — exactly the kind of intermittent, hard-to-reproduce
    // "sometimes logged out right after switching accounts" symptom
    // reported. Applied to every response this guard returns, both the
    // authenticated pass-through and the redirect-to-login case below.
    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    const session = await getIronSession<SessionShape>(request, response, getSessionOptions(secretKey));

    if (!session.userId) {
      const search = new URLSearchParams({ next: pathname }).toString();
      const redirectResponse = NextResponse.redirect(publicRedirectUrl(request, `/admin-login?${search}`), 307);
      redirectResponse.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
      return redirectResponse;
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
  //    runCountryRedirectCheck().
  //
  //    Real bug fixed here: this used to read `x-vercel-ip-country` —
  //    which only exists when Vercel's own edge network terminates the
  //    request. This site sits behind Cloudflare (orange cloud) in
  //    front of a self-hosted VPS, and Cloudflare is what actually
  //    populates the country header on the origin request instead:
  //    `cf-ipcountry`. Using the wrong header meant this feature
  //    silently never fired at all, for every single rule ever
  //    configured. 'XX' = Cloudflare couldn't resolve a country, 'T1'
  //    = Tor — same skip-list as the PHP version.
  //
  //    Also real bug fixed here: this used to apply to EVERY public
  //    page (homepage, category/tag/search listings, RSS, sitemap,
  //    author pages) — the PHP reference's runCountryRedirectCheck()
  //    was only ever called from post.php and page.php, meaning it's
  //    scoped to actual Post and Page URLs specifically, not every
  //    public route. Narrowed to match via isCountryRedirectEligible()
  //    below.
  //
  //    Bots stay exempt regardless of geo-redirection rules aimed at
  //    human visitors (see isKnownCrawler() below — the actual cause
  //    of "Facebook pe link share karte hain to preview fetch nahi
  //    hota" if even one rule existed for whichever country a
  //    crawler's datacenter resolves to).
  if (isCountryRedirectEligible(pathname) && !isKnownCrawler(request.headers.get("user-agent"))) {
    const country = (request.headers.get("cf-ipcountry") ?? "").toUpperCase();
    if (country && country !== "XX" && country !== "T1") {
      const rules = await getCountryRedirectRules();
      const target = rules.get(country);
      if (target) {
        // Same-host loop guard, mirroring the PHP version: never
        // redirect a visitor to a URL on this exact same host (an
        // admin typo like pointing IN -> https://thisdomain.com/...
        // would otherwise redirect-loop).
        try {
          const targetHost = new URL(target).host;
          if (targetHost.toLowerCase() !== request.nextUrl.host.toLowerCase()) {
            return NextResponse.redirect(target, 302);
          }
        } catch {
          // Invalid URL saved somehow — fail open rather than 500 a real visitor.
        }
      }
    }
  }

  return NextResponse.next();
}

// Known top-level routes that are NOT a Post or a Page — mirrors the PHP
// scope exactly: only post.php and page.php ever called
// runCountryRedirectCheck(). index.php (home), category.php, tag.php,
// search.php, rss.php, sitemap.php/news-sitemap.php and author.php never
// did, so those stay reachable for every visitor regardless of country.
const NON_POST_OR_PAGE_TOP_SEGMENTS = new Set([
  "categories",
  "tag",
  "search",
  "rss.xml",
  "author",
  "sitemap.xml",
  "news-sitemap.xml",
  "robots.txt",
  "ads.txt",
  "api",
  "admin-login",
  "upload",
]);

function isCountryRedirectEligible(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return false; // homepage — excluded, same as index.php
  const [first] = segments;
  if (NON_POST_OR_PAGE_TOP_SEGMENTS.has(first)) return false;
  // Everything else is either a Post (/[slug], /[slug]/[chapterNum]) or a
  // Page — /page/[slug] via the generic Page builder, plus the three pages
  // that got their own hardcoded routes in this rebuild (about-us,
  // contact-us, privacy-policy) instead of going through /page/[slug] like
  // they did via page.php?slug=... in the original.
  return true;
}

// Known social/search crawler user-agent substrings — matched
// case-insensitively against the request's own User-Agent header.
// Deliberately a plain substring list (not a giant maintained registry)
// since the specific handful that actually generate link previews /
// index pages is what matters here, not exhaustive bot detection.
const CRAWLER_USER_AGENTS = [
  "facebookexternalhit",
  "facebot",
  "whatsapp",
  "twitterbot",
  "linkedinbot",
  "telegrambot",
  "discordbot",
  "slackbot",
  "googlebot",
  "bingbot",
  "pinterest",
  "redditbot",
  "applebot",
  "skypeuripreview",
];

function isKnownCrawler(userAgent: string | null): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return CRAWLER_USER_AGENTS.some((bot) => ua.includes(bot));
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
     * `upload/` excluded here too: `/upload/media/*` (see
     * app/upload/media/[...path]/route.ts) is the clean public URL for
     * every uploaded file — real bug fixed here: without this
     * exclusion, an image request would still be subject to step 4's
     * country-redirect logic (which only skips paths starting with
     * "/api"), meaning a visitor from a country with a configured
     * redirect rule could get redirected AWAY from an image entirely
     * instead of ever seeing it.
     */
    "/((?!_next/static|_next/image|favicon.ico|assets/|icons/|uploads/|upload/).*)",
  ],
};
