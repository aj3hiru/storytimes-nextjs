"use client";

import Link from "next/link";
import { TrendChart } from "@/components/admin/TrendChart";
import { DisplayOptionsDropdown, useDashboardWidgetVisibility } from "@/components/admin/DisplayOptionsDropdown";
import { DashboardUserFilter, type DashboardFilterOption } from "@/components/admin/DashboardUserFilter";
import { flagEmoji } from "@/lib/flagEmoji";
import type { DashboardTraffic } from "@/lib/dashboardStats";

/**
 * Client wrapper for the dashboard's actual widgets — server-fetched data
 * comes in as plain props, this component owns only the show/hide state
 * (Display Options) and the resulting conditional rendering. Rebuilt from
 * the actual PHP dashboard.php's own view-source: an earlier pass had
 * invented a different "Total Posts / Published / Drafts / Pending
 * Comments / Views (7 days)" stat grid plus a "Recent Posts" table —
 * NEITHER of which exist in the original — while missing the real
 * Today's Posts card entirely.
 */
export function DashboardWidgets({
  traffic,
  postedToday,
  postedYesterday,
  userFilterOptions,
  currentUserId,
}: {
  traffic: DashboardTraffic;
  postedToday: number;
  postedYesterday: number;
  /** Empty for an author (no filter shown at all) — see
   *  DashboardUserFilter.tsx for the full reasoning. */
  userFilterOptions: DashboardFilterOption[];
  currentUserId: number;
}) {
  const { hidden, toggle } = useDashboardWidgetVisibility();
  const cardClass = (key: string) => `db-card db-card-full${hidden.has(key) ? " db-card-hidden" : ""}`;

  return (
    <div className="wp-dashboard-wrap">
      <div className="db-actions-bar">
        <Link href="/admin/post-manager/new" className="db-action-btn db-action-primary">
          <i className="fas fa-plus" /> Add New Post
        </Link>
        <Link href="/admin/analytics" className="db-action-btn db-action-ghost">
          <i className="fas fa-chart-line" /> Full Analytics
        </Link>
        <DisplayOptionsDropdown hidden={hidden} onToggle={toggle} />
        <DashboardUserFilter options={userFilterOptions} currentUserId={currentUserId} />
      </div>

      {/* Traffic Overview */}
      <div className={cardClass("traffic")}>
        <div className="db-card-head">
          <div className="db-card-title">
            <span className="dci dci-indigo">
              <i className="fas fa-chart-line" />
            </span>
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
              <div className="tc-info">
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
              <div className="tc-info">
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
              <div className="tc-info">
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
        {/* Traffic Trend */}
        <div className={cardClass("trendchart")}>
          <div className="db-card-head">
            <div className="db-card-title">
              <span className="dci dci-emerald">
                <i className="fas fa-wave-square" />
              </span>
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

        {/* Traffic by Country */}
        <div className={cardClass("countrytraffic")}>
          <div className="db-card-head">
            <div className="db-card-title">
              <span className="dci dci-indigo">
                <i className="fas fa-flag" />
              </span>
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

      {/* Today's Posts */}
      <div className={cardClass("todaysposts")}>
        <div className="db-card-head">
          <div className="db-card-title">
            <span className="dci dci-violet">
              <i className="fas fa-file-alt" />
            </span>
            Today&apos;s Posts
          </div>
          <Link href="/admin/blogs-manager" className="db-card-link">
            All Posts <i className="fas fa-arrow-right" />
          </Link>
        </div>
        <div className="db-card-body">
          <div className="tp-stat-row">
            <div className="tp-stat-card tp-today">
              <div className="tp-stat-num">{postedToday}</div>
              <div className="tp-stat-lbl">
                <i className="fas fa-calendar-day" /> Posted Today
              </div>
            </div>
            <div className="tp-stat-card tp-yesterday">
              <div className="tp-stat-num">{postedYesterday}</div>
              <div className="tp-stat-lbl">
                <i className="fas fa-calendar-minus" /> Posted Yesterday
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
