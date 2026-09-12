import { requireUser, resolvePermissions } from "@/lib/auth";
import { getDashboardTraffic, getTodaysPosts, flagEmoji } from "@/lib/dashboardStats";
import { DashboardWidgets } from "@/components/admin/DashboardWidgets";

/**
 * Rebuilt from the ACTUAL PHP admin panel's own view-source
 * (dashboard.php), not a written description of it. An earlier pass had
 * invented its own "Total Posts / Published / Drafts / Pending Comments
 * / Views" stat-card grid and a "Recent Posts" table — NEITHER of which
 * exist in the original — while missing the real top actions bar
 * (Add New Post / Full Analytics / Display Options) and the real
 * "Today's Posts" card. There is also no page-level "Dashboard" heading
 * here at all in the original; the content starts directly with the
 * actions bar.
 */
export default async function DashboardPage() {
  const user = await requireUser();
  if (!user) return null; // layout already redirects; this satisfies TS

  const permissions = resolvePermissions(user);
  const canViewAll = user.role === "admin" || user.role === "editor" || Boolean(permissions.analytics.view_advanced);

  const [traffic, todaysPosts] = await Promise.all([
    getDashboardTraffic(user.id, canViewAll),
    getTodaysPosts(user.id, canViewAll),
  ]);

  return (
    <DashboardWidgets
      traffic={traffic}
      postedToday={todaysPosts.postedToday}
      postedYesterday={todaysPosts.postedYesterday}
      flagEmoji={flagEmoji}
    />
  );
}
