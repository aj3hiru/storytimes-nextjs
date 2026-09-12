import type { NextRequest } from "next/server";
import { attemptLogin, safeAdminRedirect } from "@/lib/adminAuth";

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

  // Real bug fixed here: this used to build the redirect from
  // `request.nextUrl.clone()`, which reflects the host Next.js believes
  // it's running on — behind a reverse proxy (nginx forwarding to an
  // internal port like 3001), that can be the INTERNAL address
  // (localhost:3001) rather than the public domain, if the proxy isn't
  // forwarding (or Next.js isn't configured to trust) the original
  // Host header. The browser then followed that Location header
  // straight to http://localhost:3001/..., which is exactly the
  // "URL randomly turns into localhost" symptom. A bare relative path
  // in the Location header sidesteps the whole problem: browsers
  // resolve a relative redirect against the page's own actual current
  // origin, never against whatever host the server-side code guessed.
  if (!result.success) {
    const search = `?error=${encodeURIComponent(result.error ?? "Login failed")}&next=${encodeURIComponent(redirectTo)}`;
    return new Response(null, { status: 303, headers: { Location: `/admin-login${search}` } });
  }

  return new Response(null, { status: 303, headers: { Location: redirectTo } });
}
