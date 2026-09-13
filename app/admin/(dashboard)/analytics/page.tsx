import { requireUser, resolvePermissions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveMediaUrl } from "@/lib/urls";
import { flagEmoji } from "@/lib/flagEmoji";
import {
  parseRange,
  getRangeBounds,
  calculateGrowth,
  formatViews,
  getCountryAdjustments,
  scopedPostIds,
  getTotalViews,
  getRangeTotal,
  getUniqueVisitors,
  getAvgChaptersRead,
  getRangeSources,
  getRangeCountries,
  getTopPostsForRange,
  getRangeSeries,
  sourceMetaFor,
  countryNameFor,
  COUNTRY_COLORS,
  RANGE_LABELS,
  type RangeKey,
} from "@/lib/analyticsData";
import { AnalyticsCharts, CountryDoughnutChart } from "@/components/admin/AnalyticsCharts";

const TOP_POSTS_PER_PAGE = 10;

/**
 * Rebuilt to match the actual admin/analytics.php exactly (verified
 * against the real file, not a description of it) — an earlier pass
 * here was a fixed 30-day window with plain CSS-bar charts, no range
 * filter, no author filter, no unique visitors, no growth %, no avg-
 * chapters-read, and no country-adjustment support at all.
 *
 * Disclosed simplification: "Today"/"Yesterday" show an hourly x-axis
 * exactly like the reference, but this project's post_stats_daily table
 * is day-granular (the original reads a separate hourly-tracking JSON
 * cache file that has no equivalent here) — the day's real total is
 * shown as a single point rather than a fabricated hour-by-hour curve.
 * Every other range (7d/30d/prev_month/6m/1y) has real day-level data
 * and matches exactly.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; author_id?: string; tp_page?: string }>;
}) {
  const user = await requireUser();
  if (!user) return null;

  const permissions = resolvePermissions(user);
  const canViewAll = user.role === "admin" || user.role === "editor" || Boolean(permissions.analytics.view_advanced);
  const isAdminViewer = user.role === "admin";

  const { range: rangeParam, author_id, tp_page } = await searchParams;
  const selectedRange: RangeKey = parseRange(rangeParam);
  const filterAuthorUserId = canViewAll && author_id && Number(author_id) > 0 ? Number(author_id) : null;
  const topPostsPage = tp_page && Number(tp_page) > 0 ? Number(tp_page) : 1;
  const topPostsOffset = (topPostsPage - 1) * TOP_POSTS_PER_PAGE;

  const bounds = getRangeBounds(selectedRange);

  const [adjustments, ownedPostIds, analyticsAuthors] = await Promise.all([
    getCountryAdjustments(user.id, isAdminViewer),
    scopedPostIds(user.id, canViewAll, filterAuthorUserId),
    canViewAll
      ? prisma.author.findMany({ include: { user: { select: { id: true, username: true } } }, orderBy: { name: "asc" } })
      : Promise.resolve([]),
  ]);

  const [lifetimeTotal, rangeTotal, rangePrevTotal, uniqueVisitors, avgChaptersRead, sourceBreakdown, countryBreakdown, topPostsResult, series] =
    await Promise.all([
      getTotalViews(ownedPostIds),
      getRangeTotal(bounds.start, bounds.end, ownedPostIds, adjustments),
      getRangeTotal(bounds.prevStart, bounds.prevEnd, ownedPostIds, adjustments),
      getUniqueVisitors(bounds.start, bounds.end, ownedPostIds),
      getAvgChaptersRead(bounds.start, bounds.end, ownedPostIds),
      getRangeSources(bounds.start, bounds.end, ownedPostIds, adjustments),
      getRangeCountries(bounds.start, bounds.end, ownedPostIds, adjustments, 7),
      getTopPostsForRange(bounds.start, bounds.end, ownedPostIds, adjustments, TOP_POSTS_PER_PAGE, topPostsOffset),
      getRangeSeries(bounds, ownedPostIds, adjustments),
    ]);

  const rangeGrowth = calculateGrowth(rangeTotal, rangePrevTotal);
  const daysInRange = Math.max(1, Math.round((bounds.end.getTime() - bounds.start.getTime()) / 86400000) + 1);
  const avgPerDay = Math.round((rangeTotal / daysInRange) * 10) / 10;
  const { posts: topPosts, total: topPostsTotal } = topPostsResult;
  const topPostsPages = Math.max(1, Math.ceil(topPostsTotal / TOP_POSTS_PER_PAGE));

  function rangeUrl(key: RangeKey) {
    const params = new URLSearchParams({ range: key });
    if (filterAuthorUserId !== null) params.set("author_id", String(filterAuthorUserId));
    return `?${params.toString()}`;
  }
  function topPostsUrl(p: number) {
    const params = new URLSearchParams({ range: selectedRange, tp_page: String(p) });
    if (filterAuthorUserId !== null) params.set("author_id", String(filterAuthorUserId));
    return `?${params.toString()}`;
  }

  return (
    <div style={{ padding: 0 }}>
      <div className="an-filter">
        <div className="an-range-pills">
          {(Object.keys(RANGE_LABELS) as RangeKey[]).map((key) => (
            <a key={key} href={rangeUrl(key)} className={`an-range-pill${selectedRange === key ? " active" : ""}`}>
              {RANGE_LABELS[key]}
            </a>
          ))}
        </div>

        {!canViewAll ? (
          <div className="an-scope-badge">
            <i className="fas fa-user-lock" /> Your posts only
          </div>
        ) : (
          <form method="GET" className="an-author-select">
            <input type="hidden" name="range" value={selectedRange} />
            <label htmlFor="author_id">Author</label>
            <select name="author_id" id="author_id" defaultValue={filterAuthorUserId ?? 0} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
              <option value={0}>All Authors</option>
              {analyticsAuthors.map((a) => (
                <option key={a.userId} value={a.userId}>
                  {a.name || a.user.username}
                </option>
              ))}
            </select>
          </form>
        )}
      </div>

      <div className="an-stats-grid">
        <div className="an-stat">
          <div className="an-stat-label">Total Views (All Time)</div>
          <div className="an-stat-val">{formatViews(lifetimeTotal)}</div>
        </div>

        <div className="an-stat">
          <div className="an-stat-label">{bounds.label} Views</div>
          <div className="an-stat-val">{formatViews(rangeTotal)}</div>
          <span className={`an-growth ${rangeGrowth > 0 ? "positive" : rangeGrowth < 0 ? "negative" : "neutral"}`}>
            <i className={`fas fa-arrow-${rangeGrowth >= 0 ? "up" : "down"}`} />
            {rangeGrowth > 0 ? "+" : ""}
            {rangeGrowth}% vs previous period
          </span>
        </div>

        <div className="an-stat">
          <div className="an-stat-label">{bounds.label} Unique Visitors</div>
          <div className="an-stat-val">{formatViews(uniqueVisitors)}</div>
          <div className="an-stat-sub">Distinct readers, {bounds.label.toLowerCase()}</div>
        </div>

        <div className="an-stat">
          <div className="an-stat-label">Avg. Chapters Read</div>
          <div className="an-stat-val">{avgChaptersRead > 0 ? avgChaptersRead : "—"}</div>
          <div className="an-stat-sub">
            Per visitor per story, {bounds.label.toLowerCase()}
            {avgChaptersRead === 0 ? " (tracking just started)" : ""}
          </div>
        </div>

        <div className="an-stat">
          <div className="an-stat-label">Avg. Views / Day</div>
          <div className="an-stat-val">{formatViews(avgPerDay)}</div>
          <div className="an-stat-sub">Across {bounds.label}</div>
        </div>
      </div>

      <AnalyticsCharts
        seriesLabels={series.labels}
        seriesData={series.data}
        rangeLabel={bounds.label}
        sourceBreakdown={sourceBreakdown.map((s) => ({ ...s, ...sourceMetaFor(s.source) }))}
      />

      <div className="an-row2">
        <div className="an-card">
          <div className="an-card-header">
            <div className="an-card-title">
              <i className="fas fa-flag" /> Traffic by Country
            </div>
            <div className="an-card-title-sub">Top 7 &middot; rest grouped as Other</div>
          </div>
          {countryBreakdown.length === 0 ? (
            <div className="an-empty-note">No country data for this period yet</div>
          ) : (
            <>
              <CountryDoughnutChart
                countryBreakdown={countryBreakdown.map((c, i) => ({
                  ...c,
                  name: countryNameFor(c.country),
                  flag: c.country === "OTHER" ? "🌐" : flagEmoji(c.country),
                  color: COUNTRY_COLORS[i] ?? "#9ca3af",
                }))}
              />
              <ul className="an-source-list">
                {countryBreakdown.map((c, i) => (
                  <li className="an-source-row" key={c.country}>
                    <span className="an-source-dot" style={{ background: COUNTRY_COLORS[i] ?? "#9ca3af" }} />
                    <span className="an-source-name">
                      <span className="an-source-icon">{c.country === "OTHER" ? "🌐" : flagEmoji(c.country)}</span>
                      <span className="an-source-label" title={countryNameFor(c.country)}>
                        {countryNameFor(c.country)}
                      </span>
                    </span>
                    <span className="an-source-views">{formatViews(c.views)}</span>
                    <span className="an-source-pct">{c.pct}%</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="an-table-wrap">
          <div className="an-card-header" style={{ padding: "1.25rem 1.25rem 0" }}>
            <div className="an-card-title">
              <i className="fas fa-fire" /> Top Posts
            </div>
            <div className="an-card-title-sub">{bounds.label} &middot; clicks per post</div>
          </div>
          {topPosts.length === 0 ? (
            <div className="an-empty-note">No post views recorded for this period yet</div>
          ) : (
            <>
              <table className="an-table">
                <thead>
                  <tr>
                    <th style={{ width: 36 }}>#</th>
                    <th>Post</th>
                    <th>Views</th>
                    <th className="an-bar-cell">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {topPosts.map((post, i) => (
                    <tr key={post.id}>
                      <td>
                        <span className="an-rank">{topPostsOffset + i + 1}</span>
                      </td>
                      <td>
                        <div className="an-post-cell">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={post.bannerImage ? resolveMediaUrl(post.bannerImage) : "/assets/img/seo_og_default.png"}
                            alt=""
                            className="an-post-thumb"
                          />
                          <span className="an-post-title">{post.title}</span>
                        </div>
                      </td>
                      <td>{formatViews(post.rangeViews)}</td>
                      <td className="an-bar-cell">
                        <div className="an-mini-bar">
                          <div className="an-mini-bar-fill" style={{ width: `${post.percentage}%` }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {topPostsPages > 1 && (
                <div className="an-pagination">
                  <a href={topPostsUrl(Math.max(1, topPostsPage - 1))} className={`an-page-btn${topPostsPage <= 1 ? " disabled" : ""}`}>
                    <i className="fas fa-chevron-left" /> Prev
                  </a>
                  <span className="an-page-info">
                    Page {topPostsPage} of {topPostsPages}
                  </span>
                  <a href={topPostsUrl(Math.min(topPostsPages, topPostsPage + 1))} className={`an-page-btn${topPostsPage >= topPostsPages ? " disabled" : ""}`}>
                    Next <i className="fas fa-chevron-right" />
                  </a>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
