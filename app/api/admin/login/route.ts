import { NextResponse, type NextRequest } from "next/server";
import { attemptLogin, safeAdminRedirect } from "@/lib/adminAuth";
import { publicRedirectUrl } from "@/lib/urls";

/**
 * Native POST login endpoint — used instead of a Server Action for the
 * login FORM specifically (every other admin form in this project still
 * uses Server Actions normally). Server Actions check the request's
 * Origin header against the deploying domain for CSRF protection; behind
 * certain reverse proxies / dynamic-subdomain sandboxes, that check can
 * see a mismatched or missing Origin and reject the action before it
 * ever reaches attemptLogin(), which looks like "the login page loads
 * and accepts input, but nothing happens on submit". A plain form POST
 * to a Route Handler has no such check, so it's the more robust choice
 * for the one form that has to work even on a freshly-provisioned,
 * not-yet-fully-configured deployment.
 */
export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const redirectTo = safeAdminRedirect(String(formData.get("redirect_to") ?? ""));

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "0.0.0.0";
  const userAgent = request.headers.get("user-agent") ?? "unknown";

  const result = await attemptLogin(username, password, ip, userAgent);

  // See lib/urls.ts's publicRedirectUrl() for the full history of why
  // this needs to be a real absolute URL built from x-forwarded-host,
  // not `request.nextUrl.clone()` (leaks the internal host) and not a
  // bare relative Location header (Next.js's own internal response
  // handling throws on that in some contexts).
  if (!result.success) {
    const search = `?error=${encodeURIComponent(result.error ?? "Login failed")}&next=${encodeURIComponent(redirectTo)}`;
    return NextResponse.redirect(publicRedirectUrl(request, `/admin-login${search}`), 303);
  }

  return NextResponse.redirect(publicRedirectUrl(request, redirectTo), 303);
}
