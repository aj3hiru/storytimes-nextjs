import Link from "next/link";
import { checkLockout, safeAdminRedirect } from "@/lib/adminAuth";
import { resolveSiteConfig } from "@/lib/config";
import { AdminLoginLogo, LogoSvgFallback } from "@/components/AdminLoginLogo";
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
        <h1 className="wp-login-logo">
          <Link href="/">
            {siteConfig.siteLogo ? (
              <AdminLoginLogo src={siteConfig.siteLogo} alt={siteConfig.siteName} />
            ) : (
              <LogoSvgFallback />
            )}
          </Link>
        </h1>

        {locked ? (
          <div className="wp-login-card">
            <div className="wp-lockout">
              <i className="fas fa-clock" />
              <h3>Too many attempts</h3>
              <p>Please wait before trying again.</p>
              <div className="wp-countdown" id="countdown" data-seconds={secondsLeft}>
                {String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:
                {String(secondsLeft % 60).padStart(2, "0")}
              </div>
            </div>
          </div>
        ) : (
          <div className="wp-login-card">
            {errorParam && (
              <div className="wp-login-error">
                <i className="fas fa-exclamation-circle" />
                <span>{errorParam}</span>
              </div>
            )}

            <form method="POST" action="/api/admin/login" id="loginForm" autoComplete="off">
              <input type="hidden" name="redirect_to" value={redirectTo} />

              <p className="wp-login-field">
                <label htmlFor="username">Username or Email Address</label>
                <input
                  type="text"
                  id="username"
                  name="username"
                  required
                  autoComplete="username"
                  autoFocus
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </p>

              <p className="wp-login-field">
                <label htmlFor="password">Password</label>
                <span className="wp-pwd-wrap">
                  <input type="password" id="password" name="password" required autoComplete="current-password" />
                  <button type="button" className="wp-pwd-toggle" tabIndex={-1} aria-label="Show password" data-toggle-password>
                    <i className="fas fa-eye" id="toggleIcon" />
                  </button>
                </span>
              </p>

              <p className="wp-login-remember">
                <label>
                  <input type="checkbox" name="remember" defaultChecked />
                  Remember Me
                </label>
              </p>

              <p className="wp-login-submit">
                <button type="submit" id="submitBtn">
                  <span className="wp-spinner" />
                  <span className="wp-btn-text">Log In</span>
                </button>
              </p>
            </form>
          </div>
        )}

        <p className="wp-login-back">
          <Link href="/">&larr; Back to {siteConfig.siteName}</Link>
        </p>
      </div>

      <script
        dangerouslySetInnerHTML={{
          __html: `
function togglePass() {
  const inp = document.getElementById('password');
  const icon = document.getElementById('toggleIcon');
  if (!inp || !icon) return;
  if (inp.type === 'password') {
    inp.type = 'text';
    icon.classList.replace('fa-eye', 'fa-eye-slash');
  } else {
    inp.type = 'password';
    icon.classList.replace('fa-eye-slash', 'fa-eye');
  }
}
document.querySelectorAll('[data-toggle-password]').forEach(function (btn) {
  btn.addEventListener('click', togglePass);
});

const form = document.getElementById('loginForm');
if (form) {
  form.addEventListener('submit', function (e) {
    const u = document.getElementById('username').value.trim();
    const p = document.getElementById('password').value;
    if (!u || !p) { e.preventDefault(); return; }
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;
    btn.classList.add('loading');
  });
}

(function () {
  const el = document.getElementById('countdown');
  if (!el) return;
  let secs = parseInt(el.getAttribute('data-seconds') || '0', 10);
  const tick = setInterval(function () {
    secs--;
    if (secs <= 0) { clearInterval(tick); window.location.reload(); return; }
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    el.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }, 1000);
})();
          `,
        }}
      />
    </main>
  );
}
