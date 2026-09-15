import Link from "next/link";
import { checkLockout, safeAdminRedirect } from "@/lib/adminAuth";
import { resolveSiteConfig } from "@/lib/config";
import { AdminLoginLogo, LogoSvgFallback } from "@/components/AdminLoginLogo";
import "./admin-login.css";

export const metadata = {
  robots: "noindex, nofollow, noarchive, nosnippet",
};

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
    <main className="admin-login-page">
      <div className="login-wrapper">
        <div className="login-card">
          <div className="login-header">
            <div className="logo-container">
              {siteConfig.siteLogo ? (
                <AdminLoginLogo src={siteConfig.siteLogo} alt={siteConfig.siteName} />
              ) : (
                <LogoSvgFallback />
              )}
            </div>
            <h1>{siteConfig.siteName}</h1>
            <p>Login Portal</p>
          </div>

          <div className="login-body">
            {locked ? (
              <div className="lockout-box">
                <div className="lockout-icon">
                  <i className="fas fa-clock" />
                </div>
                <h3>Too Many Attempts</h3>
                <p>Please wait before trying again.</p>
                <div className="countdown-display" id="countdown" data-seconds={secondsLeft}>
                  {String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:
                  {String(secondsLeft % 60).padStart(2, "0")}
                </div>
              </div>
            ) : (
              errorParam && (
                <div className="alert-box alert-error">
                  <i className="fas fa-exclamation-circle" />
                  <span>{errorParam}</span>
                </div>
              )
            )}

            {!locked && (
              <form method="POST" action="/api/admin/login" id="loginForm" autoComplete="off">
                <input type="hidden" name="redirect_to" value={redirectTo} />

                <div className="form-group">
                  <label htmlFor="username">Username or Email</label>
                  <div className="input-wrapper">
                    <input
                      type="text"
                      id="username"
                      name="username"
                      required
                      autoComplete="username"
                      placeholder="Enter your username or email"
                      autoFocus
                    />
                    <i className="fas fa-user input-icon" />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="password">Password</label>
                  <div className="input-wrapper">
                    <input
                      type="password"
                      id="password"
                      name="password"
                      required
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      className="password-input"
                    />
                    <i className="fas fa-lock input-icon" />
                    <button type="button" className="toggle-password" tabIndex={-1} aria-label="Toggle password visibility" data-toggle-password>
                      <i className="fas fa-eye" id="toggleIcon" />
                    </button>
                  </div>
                </div>

                <button type="submit" className="submit-btn" id="submitBtn">
                  <span className="spinner" />
                  <span className="btn-text">
                    <i className="fas fa-sign-in-alt" /> Login to Dashboard
                  </span>
                </button>
              </form>
            )}

            <Link href="/" className="visit-site-link">
              <i className="fas fa-arrow-left" /> Visit Site
            </Link>

            <div className="login-footer">
              <div className="security-badge">
                <i className="fas fa-lock" />
                <span>Secure Admin Access Only</span>
              </div>
            </div>
          </div>
        </div>
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
