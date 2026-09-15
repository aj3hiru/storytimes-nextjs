import { getAppConfig } from "@/lib/config";

export default async function CronManagerPage() {
  const appConfig = await getAppConfig();

  return (
    <div>

      <div className="table-wrap" style={{ marginBottom: "1.5rem" }}>
        <table>
          <thead>
            <tr>
              <th>Job</th>
              <th>Endpoint</th>
              <th>Suggested schedule</th>
              <th>Last run</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Scheduled post publishing</td>
              <td>
                <code>/api/cron/minute</code>
              </td>
              <td>Every 1 minute</td>
              <td>{appConfig.cron_minute_last_run ? new Date(appConfig.cron_minute_last_run).toLocaleString() : "Never"}</td>
            </tr>
            <tr>
              <td>Log cleanup / maintenance</td>
              <td>
                <code>/api/cron/daily</code>
              </td>
              <td>Once daily</td>
              <td>{appConfig.cron_daily_last_run ? new Date(appConfig.cron_daily_last_run).toLocaleString() : "Never"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card" style={{ padding: "1.25rem" }}>
        <h3 style={{ marginBottom: "0.75rem" }}>Vercel Cron setup</h3>
        <p style={{ color: "var(--gray-600)", marginBottom: "0.75rem", fontSize: "0.9rem" }}>
          Add to <code>vercel.json</code>:
        </p>
        <pre style={{ background: "var(--gray-900)", color: "#e5e7eb", padding: "1rem", borderRadius: "var(--radius)", fontSize: "0.8rem", overflowX: "auto" }}>
{`{
  "crons": [
    { "path": "/api/cron/minute", "schedule": "* * * * *" },
    { "path": "/api/cron/daily",  "schedule": "0 3 * * *" }
  ]
}`}
        </pre>
        <p style={{ color: "var(--gray-600)", marginTop: "0.75rem", fontSize: "0.9rem" }}>
          Vercel Cron sends its own auth automatically when <code>CRON_SECRET</code> is set as an
          env var — see{" "}
          <a href="https://vercel.com/docs/cron-jobs" target="_blank" rel="noopener noreferrer">
            Vercel&apos;s cron docs
          </a>{" "}
          for the exact header it expects.
        </p>
      </div>
    </div>
  );
}
