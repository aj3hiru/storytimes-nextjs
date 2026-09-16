import { requireUser, resolvePermissions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getDashboardTraffic, getTodaysPosts, resolveDashboardScope } from "@/lib/dashboardStats";
import { DashboardWidgets } from "@/components/admin/DashboardWidgets";
import type { DashboardFilterOption } from "@/components/admin/DashboardUserFilter";

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
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string }>;
}) {
  const user = await requireUser();
  if (!user) return null; // layout already redirects; this satisfies TS

  const permissions = resolvePermissions(user);
  const { user: userParam } = await searchParams;
  const requestedUserId = userParam && Number(userParam) > 0 ? Number(userParam) : null;

  // Resolves BOTH whose dashboard is shown and the scope it should use —
  // see the doc comment on resolveDashboardScope() in lib/dashboardStats.ts
  // for the full reasoning, including the real over-permissioning bug
  // this fixes (editors previously saw the whole site's traffic here).
  const scope = await resolveDashboardScope(user, permissions, requestedUserId);

  // New feature, no PHP equivalent — per explicit request. An author gets
  // an empty list (DashboardUserFilter renders nothing for ≤1 option); an
  // editor gets themselves plus their assigned authors; an admin gets
  // every user on the site.
  //
  // Real bug fixed here: this used to key off `viewerCanViewAll`, which
  // also turns true for anyone (including an editor) holding the
  // explicit `analytics.view_advanced` permission. That permission is
  // meant to grant a broader AGGREGATE analytics view — it isn't meant
  // to also expand this specific filter into "list literally every user
  // on the site, including other editors and admins." An editor with
  // that permission was seeing everyone here, not just their own team,
  // which directly contradicts what this filter is for. The options
  // list is now keyed strictly on the actual `role` value — an editor
  // always gets exactly themselves + their own assigned authors, no
  // matter what other permissions they hold. Only a genuine admin sees
  // every user.
  let userFilterOptions: DashboardFilterOption[] = [];
  if (user.role === "admin") {
    userFilterOptions = await prisma.user.findMany({
      orderBy: { username: "asc" },
      select: { id: true, username: true, role: true },
    });
  } else if (user.role === "editor") {
    const managed = await prisma.user.findMany({
      where: { createdById: user.id },
      orderBy: { username: "asc" },
      select: { id: true, username: true, role: true },
    });
    userFilterOptions = [{ id: user.id, username: user.username, role: user.role }, ...managed];
  }

  const [traffic, todaysPosts] = await Promise.all([
    getDashboardTraffic(scope),
    getTodaysPosts(scope),
  ]);

  return (
    <DashboardWidgets
      traffic={traffic}
      postedToday={todaysPosts.postedToday}
      postedYesterday={todaysPosts.postedYesterday}
      userFilterOptions={userFilterOptions}
      currentUserId={scope.targetUserId}
    />
  );
}
