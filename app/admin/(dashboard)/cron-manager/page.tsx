import { getAppConfig, resolveSiteConfig } from "@/lib/config";
import { CronCopyBlock } from "@/components/admin/CronCopyBlock";

/**
 * Rebuilt (item #17). The previous version documented **Vercel Cron**
 * setup — `vercel.json`, Vercel's own auth header, a link to Vercel's
 * docs — none of which applies here: this site is self-hosted on a VPS
 * behind Cloudflare, running under PM2. Someone following those
 * instructions would have got nothing working at all. Replaced with the
 * setup that actually fits this deployment (system `crontab` + `curl`),
 * plus a real status card per job showing whether it has ever run.
 */
export default async function CronManagerPage() {
  const [appConfig, siteConfig] = await Promise.all([getAppConfig(), resolveSiteConfig("")]);
  const base = (siteConfig.siteUrl || "").replace(/\/+$/, "");

  const jobs = [
    {
      name: "Scheduled post publishing",
      icon: "fa-clock",
      endpoint: "/api/cron/minute",
      schedule: "Every minute",
      cron: "* * * * *",
      lastRun: appConfig.cron_minute_last_run,
      desc: "Publishes posts whose scheduled time has arrived.",
    },
    {
      name: "Daily maintenance",
      icon: "fa-broom",
      endpoint: "/api/cron/daily",
      schedule: "Once daily, 3:00 AM",
      cron: "0 3 * * *",
      lastRun: appConfig.cron_daily_last_run,
      desc: "Log cleanup and routine housekeeping.",
    },
  ];

  const crontabLines = jobs
    .map((j) => `${j.cron} curl -fsS -H "Authorization: Bearer $CRON_SECRET" ${base}${j.endpoint} > /dev/null 2>&1`)
    .join("\n");

  return (
    <div className="cron-wrap">
      <div className="cron-grid">
        {jobs.map((j) => {
          const hasRun = Boolean(j.lastRun);
          return (
            <div className="cron-card" key={j.endpoint}>
              <div className="cron-card-head">
                <div className={`cron-icon ${hasRun ? "ok" : "idle"}`}>
                  <i className={`fas ${j.icon}`} />
                </div>
                <div>
                  <div className="cron-name">{j.name}</div>
                  <div className="cron-desc">{j.desc}</div>
                </div>
                <span className={`cron-pill ${hasRun ? "ok" : "idle"}`}>
                  {hasRun ? "Active" : "Never run"}
                </span>
              </div>
              <div className="cron-meta">
                <div>
                  <span className="cron-meta-label">Schedule</span>
                  <span className="cron-meta-value">{j.schedule}</span>
                </div>
                <div>
                  <span className="cron-meta-label">Endpoint</span>
                  <code className="cron-code">{j.endpoint}</code>
                </div>
                <div>
                  <span className="cron-meta-label">Last run</span>
                  <span className="cron-meta-value">
                    {j.lastRun ? new Date(j.lastRun).toLocaleString() : "Never"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="cron-setup">
        <h3>
          <i className="fas fa-terminal" /> Server setup
        </h3>
        <p className="cron-hint">
          Next.js has no built-in scheduler, so these run as plain HTTP endpoints triggered by the
          server&apos;s own cron. Run <code>crontab -e</code> and add the two lines below.
        </p>
        <CronCopyBlock text={crontabLines} />
        <p className="cron-hint" style={{ marginTop: "0.85rem" }}>
          <i className="fas fa-shield-halved" /> Both endpoints require the{" "}
          <code>CRON_SECRET</code> value from your <code>.env.local</code>, sent as an{" "}
          <code>Authorization: Bearer</code> header — verified against the actual check in{" "}
          <code>app/api/cron/*/route.ts</code>, not assumed. Without it they refuse the request, so
          they can&apos;t be triggered by anyone else.
        </p>
      </div>
    </div>
  );
}
