import Link from "next/link";
import { requireUser, resolvePermissions } from "@/lib/auth";
import { getDashboardStats, getDashboardTraffic, flagEmoji } from "@/lib/dashboardStats";
import { TrendChart } from "@/components/admin/TrendChart";

export default async function DashboardPage() {
  const user = await requireUser();
  if (!user) return null; // layout already redirects; this satisfies TS

  const permissions = resolvePermissions(user);
  const canViewAll = user.role === "admin" || user.role === "editor" || Boolean(permissions.analytics.view_advanced);

  const [stats, traffic] = await Promise.all([
    getDashboardStats(user.id, user.role, canViewAll),
    getDashboardTraffic(user.id, canViewAll),
  ]);

  return (
    <div>
      <div className="toolbar">
        <h2 className="toolbar-title">Dashboard</h2>
        <div className="toolbar-actions">
          <Link href="/admin/post-manager/new" className="btn btn-primary">
            <i className="fas fa-plus" /> New Post
          </Link>
        </div>
      </div>

      {/* Traffic Overview — ported from dashboard.php, previously missing
          entirely from this port. */}
      <div className="db-card">
        <div className="db-card-head">
          <div className="db-card-title">
            <span className="dci dci-indigo">
              <i className="fas fa-chart-line" />
            </span>{" "}
            Traffic Overview
          </div>
          <Link href="/admin/analytics" className="db-card-link">
            View Full Analytics <i className="fas fa-arrow-right" />
          </Link>
        </div>
        <div className="db-card-body">
          <div className="traffic-grid">
            <div className="traffic-card traffic-today">
              <div className="tc-icon">
                <i className="fas fa-calendar-day" />
              </div>
              <div>
                <div className="tc-lbl">Today</div>
                <div className="tc-num">{traffic.today.views.toLocaleString()}</div>
                <div className="tc-sub">
                  <i className="fas fa-user" /> {traffic.today.uniqueVisitors.toLocaleString()} unique visitors
                </div>
              </div>
            </div>
            <div className="traffic-card traffic-yesterday">
              <div className="tc-icon">
                <i className="fas fa-calendar-minus" />
              </div>
              <div>
                <div className="tc-lbl">Yesterday</div>
                <div className="tc-num">{traffic.yesterday.views.toLocaleString()}</div>
                <div className="tc-sub">
                  <i className="fas fa-user" /> {traffic.yesterday.uniqueVisitors.toLocaleString()} unique visitors
                </div>
              </div>
            </div>
            <div className="traffic-card traffic-week">
              <div className="tc-icon">
                <i className="fas fa-calendar-week" />
              </div>
              <div>
                <div className="tc-lbl">Last 7 Days</div>
                <div className="tc-num">{traffic.last7Days.views.toLocaleString()}</div>
                <div className="tc-sub">
                  <i className="fas fa-user" /> {traffic.last7Days.uniqueVisitors.toLocaleString()} unique visitors
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="db-row2">
        <div className="db-card">
          <div className="db-card-head">
            <div className="db-card-title">
              <span className="dci dci-emerald">
                <i className="fas fa-wave-square" />
              </span>{" "}
              Traffic Trend
            </div>
            <div className="db-card-sub">Last 7 days</div>
          </div>
          <div className="db-card-body">
            <div className="db-chart-wrap">
              <TrendChart data={traffic.dailyTrend} />
            </div>
          </div>
        </div>

        <div className="db-card">
          <div className="db-card-head">
            <div className="db-card-title">
              <span className="dci dci-indigo">
                <i className="fas fa-flag" />
              </span>{" "}
              Traffic by Country
            </div>
            <div className="db-card-sub">Last 7 days · top 7, rest as Other</div>
          </div>
          <div className="db-card-body">
            {traffic.topCountries.length === 0 ? (
              <div className="db-empty">
                <i className="fas fa-globe" />
                No country data yet.
              </div>
            ) : (
              <ul className="db-country-list">
                {traffic.topCountries.map((c) => (
                  <li className="db-country-row" key={c.code}>
                    <span className="db-country-flag">{c.code === "XX" ? "🌐" : flagEmoji(c.code)}</span>
                    <span className="db-country-name" title={c.name}>
                      {c.name}
                    </span>
                    <span className="db-country-views">{c.views >= 1000 ? `${(c.views / 1000).toFixed(1)}K` : c.views}</span>
                    <span className="db-country-pct">{c.pct}%</span>
                    <div className="db-country-bar-wrap">
                      <div className="db-country-bar" style={{ width: `${c.pct}%`, background: c.color }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard label="Total Posts" value={stats.totalPosts} icon="fa-newspaper" primary />
        <StatCard label="Published" value={stats.publishedPosts} icon="fa-check-circle" />
        <StatCard label="Drafts" value={stats.draftPosts} icon="fa-file" />
        {canViewAll && <StatCard label="Pending Comments" value={stats.pendingComments} icon="fa-comments" />}
        <StatCard label="Views (7 days)" value={stats.views7d} icon="fa-chart-line" />
      </div>

      <div className="card" style={{ padding: "1.25rem" }}>
        <h3 className="toolbar-title" style={{ marginBottom: "1rem" }}>
          Recent Posts
        </h3>
        {stats.recentPosts.length === 0 ? (
          <p style={{ color: "var(--gray-500)" }}>No posts yet.</p>
        ) : (
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {stats.recentPosts.map((p) => (
                  <tr key={p.id}>
                    <td>{p.title}</td>
                    <td>
                      <span className={`badge badge-${p.status}`}>{p.status}</span>
                    </td>
                    <td>{p.date ? new Date(p.date).toLocaleDateString() : "—"}</td>
                    <td>
                      <Link href={`/admin/post-manager/${p.id}/edit`} className="btn-action btn-edit">
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  primary,
}: {
  label: string;
  value: number;
  icon: string;
  primary?: boolean;
}) {
  return (
    <div className={`stat-card${primary ? " primary" : ""}`}>
      <div className="stat-header">
        <span className="stat-label">{label}</span>
        <span className="stat-icon">
          <i className={`fas ${icon}`} />
        </span>
      </div>
      <div className="stat-value">{value.toLocaleString()}</div>
    </div>
  );
}
