import Link from "next/link";
import { guardPage } from "@/lib/pageGuard";
import { getPerfSettings } from "@/lib/config";
import { savePerformanceSettings } from "@/lib/performanceSettingsAdmin";
import { getCacheSettings } from "@/lib/cache/cacheSettings";
import { isRedisConfigured, objectCachePing } from "@/lib/cache/objectCache";

/**
 * Only settings that really change something in this stack are offered;
 * image optimisation, code splitting, gzip and the 1-year media cache are
 * always on and shown as status, not as toggles.
 */
const DURATIONS = [
  { v: 30, l: "30 seconds" },
  { v: 60, l: "1 minute" },
  { v: 300, l: "5 minutes" },
  { v: 900, l: "15 minutes" },
  { v: 3600, l: "1 hour" },
];

function Toggle({ name, label, hint, on, badge }: { name: string; label: string; hint: string; on: boolean; badge?: string }) {
  return (
    <label className="ps-toggle-row" style={{ cursor: "pointer" }}>
      <div className="ps-toggle-info">
        <div className="ps-toggle-label">
          {label}
          {badge && <span className="pf-badge">{badge}</span>}
        </div>
        <div className="ps-toggle-hint">{hint}</div>
      </div>
      <span className="ps-sw">
        <input type="checkbox" name={name} defaultChecked={on} />
        <span className="ps-sl" />
      </span>
    </label>
  );
}

function Card({ icon, bg, color, title, desc, children }: { icon: string; bg: string; color: string; title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="pf-card">
      <div className="pf-card-head">
        <span className="ps-sec-icon" style={{ background: bg, color }}>
          <i className={`fas ${icon}`} />
        </span>
        <div>
          <div className="ps-sec-title">{title}</div>
          <div className="ps-sec-desc">{desc}</div>
        </div>
      </div>
      <div className="pf-card-body">{children}</div>
    </section>
  );
}

export default async function PerformanceSettingsPage({ searchParams }: { searchParams: Promise<{ success?: string }> }) {
  const denied = await guardPage((p) => p.settings.general, "Only users with Settings access can change performance settings.");
  if (denied) return denied;

  const { success } = await searchParams;
  const [perf, cache, redisOk] = await Promise.all([
    getPerfSettings(),
    getCacheSettings(),
    isRedisConfigured() ? objectCachePing().catch(() => false) : Promise.resolve(false),
  ]);
  const duration = perf.cacheDurationSeconds || 60;
  const durations = DURATIONS.some((d) => d.v === duration) ? DURATIONS : [...DURATIONS, { v: duration, l: `${duration} seconds` }];

  const status = [
    { ok: true, icon: "fa-image", label: "Image optimisation", note: "Always on" },
    { ok: true, icon: "fa-photo-film", label: "Media browser cache", note: "1 year" },
    { ok: cache.enabled, icon: "fa-layer-group", label: "Page cache", note: cache.enabled ? "On" : "Off", href: "/admin/cache-manager" },
    { ok: redisOk, icon: "fa-database", label: "Redis", note: redisOk ? "Connected" : isRedisConfigured() ? "Not reachable" : "Not set up", href: "/admin/cache-manager" },
    { ok: perf.cacheHeaders, icon: "fa-cloud", label: "CDN cache headers", note: perf.cacheHeaders ? "On" : "Off" },
  ];

  return (
    <div className="pf-wrap">
      {success && (
        <div className="ps-alert success" style={{ marginBottom: "1rem" }}>
          <i className="fas fa-check-circle" /> Performance settings saved. They are live now.
        </div>
      )}

      <div className="pf-status">
        {status.map((s) => {
          const inner = (
            <>
              <span className={`pf-dot ${s.ok ? "ok" : "off"}`}>
                <i className={`fas ${s.icon}`} />
              </span>
              <span>
                <span className="pf-st-label">{s.label}</span>
                <span className={`pf-st-note ${s.ok ? "ok" : ""}`}>{s.note}</span>
              </span>
            </>
          );
          return s.href ? (
            <Link key={s.label} href={s.href} className="pf-st">
              {inner}
            </Link>
          ) : (
            <div key={s.label} className="pf-st">
              {inner}
            </div>
          );
        })}
      </div>

      <form action={savePerformanceSettings}>
        <div className="pf-grid">
          <Card icon="fa-font" bg="#ede9fe" color="#6366f1" title="Fonts" desc="What the browser has to load before showing a page">
            <div className="pf-field" style={{ alignItems: "flex-start", flexDirection: "column", gap: ".5rem" }}>
              <label htmlFor="delayScripts" style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
                Delay ads and tracking scripts <span className="pf-badge">Big speed win</span>
              </label>
              <select id="delayScripts" name="delayScripts" className="ps-dur-select" defaultValue={perf.delayScripts} style={{ width: "100%" }}>
                <option value="interaction">Until the reader first scrolls, taps or moves the mouse (fastest — like WP Rocket)</option>
                <option value="load">Until the page has finished loading</option>
                <option value="off">Don&apos;t delay</option>
              </select>
              <span className="ps-toggle-hint">
                Ads, Analytics/GTM and Code Snippets wait, so the page appears and responds first. Ad slots further down load as the reader scrolls near them. With &quot;first scroll&quot;, visitors who leave without touching the page are not counted by Analytics.
              </span>
            </div>
            <Toggle name="systemFont" label="Use system font" hint="Show text in the phone's/computer's own font instead of Inter. Pages appear a little faster; the look changes slightly." on={perf.systemFont} />
          </Card>

          <Card icon="fa-cloud" bg="#d1fae5" color="#059669" title="CDN & Browser Cache" desc="Cache-Control headers on public pages (Cloudflare)">
            <Toggle name="cacheHeaders" label="Send cache headers" hint="Lets Cloudflare keep a copy of public pages for anonymous visitors. Logged-in staff always get fresh pages. Skipped on post pages while country redirects exist." on={perf.cacheHeaders} />
            <div className="pf-field">
              <label htmlFor="cacheDuration">Keep a copy for</label>
              <select id="cacheDuration" name="cacheDuration" className="ps-dur-select" defaultValue={String(duration)}>
                {durations.map((d) => (
                  <option key={d.v} value={d.v}>
                    {d.l}
                  </option>
                ))}
              </select>
            </div>
            <Toggle name="cacheSwr" label="Serve stale while refreshing" hint="When the copy expires, visitors still get the old copy instantly while a fresh one is fetched in the background." on={perf.staleWhileRevalidate} />
          </Card>
        </div>

        <div className="pf-links">
          <Link href="/admin/cache-manager" className="pf-link">
            <i className="fas fa-broom" /> Cache Manager <span>Clear / preload page cache, Redis</span>
          </Link>
          <Link href="/admin/cron-manager" className="pf-link">
            <i className="fas fa-clock" /> Cron Manager <span>Scheduled cleanup jobs</span>
          </Link>
        </div>

        <div className="ps-savebar pf-savebar">
          <span className="ps-save-hint">Changes apply within 30 seconds of saving.</span>
          <button type="submit" className="ps-save-btn">
            <i className="fas fa-save" /> Save Changes
          </button>
        </div>
      </form>
    </div>
  );
}
