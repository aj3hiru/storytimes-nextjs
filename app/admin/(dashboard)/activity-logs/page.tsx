import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";

export default async function ActivityLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
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

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const perPage = 50;

  const [total, logs] = await Promise.all([
    prisma.activityLog.count(),
    prisma.activityLog.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      include: { user: { select: { username: true } } },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div>

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
      </div>

      {totalPages > 1 && (
        <nav className="pagination" style={{ marginTop: "1rem" }}>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .slice(0, 20)
            .map((p) => (
              <a key={p} href={`/admin/activity-logs?page=${p}`} className={p === page ? "current" : undefined}>
                {p}
              </a>
            ))}
        </nav>
      )}
    </div>
  );
}
