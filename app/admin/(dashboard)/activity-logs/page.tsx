import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { ActivityLogFilters } from "@/components/admin/ActivityLogFilters";

export default async function ActivityLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string; userId?: string; q?: string }>;
}) {
  const user = await requireUser();
  if (!user || user.role !== "admin") {
    return (
      <div className="empty-state">
        <h3>Access denied</h3>
        <p>Only admins can view activity logs.</p>
      </div>
    );
  }

  const { page: pageParam, action, userId, q } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const perPage = 50;

  // Filters applied server-side and driven by the URL, so a filtered view
  // is linkable, survives a refresh, and composes correctly with the
  // existing pagination (a client-side filter would only ever narrow the
  // 50 rows of the current page, which is misleading).
  // Typed structurally rather than as Prisma.ActivityLogWhereInput: no
  // other file in this codebase imports Prisma's generated WhereInput
  // types, and this project's generated client doesn't reliably export
  // them — following the codebase's existing convention avoids depending
  // on that.
  const where: {
    actionType?: string;
    userId?: number;
    OR?: ({ description?: { contains: string } } | { ipAddress?: { contains: string } })[];
  } = {};
  if (action) where.actionType = action;
  if (userId && /^\d+$/.test(userId)) where.userId = parseInt(userId, 10);
  if (q?.trim()) {
    where.OR = [{ description: { contains: q.trim() } }, { ipAddress: { contains: q.trim() } }];
  }

  const [total, logs, distinctActions, users] = await Promise.all([
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      include: { user: { select: { username: true } } },
    }),
    prisma.activityLog.findMany({
      distinct: ["actionType"],
      select: { actionType: true },
      orderBy: { actionType: "asc" },
    }),
    prisma.user.findMany({ select: { id: true, username: true }, orderBy: { username: "asc" } }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  // Preserve active filters when paginating — without this, clicking page 2
  // would silently drop whatever the person had filtered to.
  const filterQs = new URLSearchParams();
  if (action) filterQs.set("action", action);
  if (userId) filterQs.set("userId", userId);
  if (q?.trim()) filterQs.set("q", q.trim());

  return (
    <div>
      <ActivityLogFilters
        actionTypes={distinctActions.map((a) => a.actionType).filter(Boolean)}
        users={users}
        current={{ action, userId, q }}
      />

      <p style={{ fontSize: "0.8125rem", color: "var(--gray-500)", margin: "0.75rem 0" }}>
        {total.toLocaleString()} log entr{total === 1 ? "y" : "ies"}
        {(action || userId || q) ? " matching your filters" : ""}
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Action</th>
              <th>Description</th>
              <th>IP</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td>{log.user?.username ?? "—"}</td>
                <td>
                  <span className="badge badge-info">{log.actionType}</span>
                </td>
                <td>{log.description}</td>
                <td>{log.ipAddress}</td>
                <td>{log.createdAt ? new Date(log.createdAt).toLocaleString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && (
          <p style={{ padding: "1.5rem", textAlign: "center", color: "var(--gray-500)", fontSize: "0.875rem" }}>
            No activity log entries match these filters.
          </p>
        )}
      </div>

      {totalPages > 1 && (
        <nav className="pagination" style={{ marginTop: "1rem" }}>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .slice(0, 20)
            .map((p) => (
              <a key={p} href={`/admin/activity-logs?page=${p}${filterQs.toString() ? `&${filterQs}` : ""}`} className={p === page ? "current" : undefined}>
                {p}
              </a>
            ))}
        </nav>
      )}
    </div>
  );
}
