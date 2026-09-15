import Link from "next/link";
import { checkLockout, safeAdminRedirect } from "@/lib/adminAuth";
import { resolveSiteConfig } from "@/lib/config";
import { AdminLoginLogo, LogoSvgFallback } from "@/components/AdminLoginLogo";
import { AdminLoginForm } from "@/components/AdminLoginForm";
import "./admin-login.css";

export const metadata = {
  robots: "noindex, nofollow, noarchive, nosnippet",
};

// Real defensive fix, same reasoning as middleware.ts's admin-guard
// no-store header: this reads per-request lockout state and echoes
// back a per-request "next" redirect target — a CDN/shared cache
// (this site sits behind Cloudflare) serving a stale cached copy of
// this page to a different visitor could show a stale lockout
// countdown or, worse, redirect them somewhere unintended after login.
// Explicit, rather than relying on Next.js's own dynamic-rendering
// detection to imply "never cached upstream" too.
export const dynamic = "force-dynamic";

/**
 * Full redesign, per explicit request: a fresh, WordPress-style login
 * page — simple and minimal, matching wp-login.php's own well-known
 * layout instead of the previous card-with-gradient-header design.
 * WordPress's actual structure: the logo sits ABOVE a plain white card
 * (not inside it), the card itself is just the form with generous
 * whitespace, and a single "← Back to [Site]" link sits below the card
 * — no dashboard-style icons/badges/gradients anywhere. Deliberately no
 * "Forgot password?" link (not needed per explicit instruction).
 * "Remember Me" is included to match WordPress's own convention, though
 * this project already keeps a session alive for 90 days regardless
 * (see lib/sessionConfig.ts) — checked by default, matching WordPress's
 * own default checked state.
 */
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error: errorParam } = await searchParams;
  const siteConfig = await resolveSiteConfig("");
  const { locked, secondsLeft } = await checkLockout();
  const redirectTo = safeAdminRedirect(next);

  return (
    <main className="wp-login-page">
      <div className="wp-login-wrap">
        <div className="wp-login-card">
          {/* Logo now sits INSIDE the card rather than floating above it,
              per explicit request — visually it reads as one contained
              unit this way. */}
          <div className="wp-login-logo">
            {siteConfig.siteLogo ? (
              <AdminLoginLogo src={siteConfig.siteLogo} alt={siteConfig.siteName} />
            ) : (
              <LogoSvgFallback />
            )}
          </div>

          {locked ? (
            <div className="wp-lockout">
              <i className="fas fa-clock" />
              <h3>Too many attempts</h3>
              <p>Please wait before trying again.</p>
              <div className="wp-countdown" id="countdown" data-seconds={secondsLeft}>
                {String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:
                {String(secondsLeft % 60).padStart(2, "0")}
              </div>
            </div>
          ) : (
            <>
              {errorParam && (
                <div className="wp-login-error">
                  <i className="fas fa-exclamation-circle" />
                  <span>{errorParam}</span>
                </div>
              )}
              <AdminLoginForm redirectTo={redirectTo} />
            </>
          )}
        </div>

        <p className="wp-login-back">
          <Link href="/">&larr; Back to {siteConfig.siteName}</Link>
        </p>
      </div>
    </main>
  );
}
