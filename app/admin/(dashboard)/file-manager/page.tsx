import { requireUser, canManageAllPosts, resolvePermissions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DeleteMediaButton } from "@/components/admin/DeleteMediaButton";

export default async function FileManagerPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  if (!user) return null;

  const permissions = resolvePermissions(user);
  const canManageAll = canManageAllPosts(user.role, permissions, "edit") || permissions.media.manage_all;

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const perPage = 24;

  const where = canManageAll ? {} : { uploadedBy: user.id };
  const [total, media] = await Promise.all([
    prisma.media.count({ where }),
    prisma.media.findMany({
      where,
      orderBy: { uploadedAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div>
      <div className="toolbar">
        <h2 className="toolbar-title">File Manager ({total})</h2>
      </div>

      <div className="alert alert-info" style={{ marginBottom: "1.5rem" }}>
        <i className="fas fa-info-circle" /> Upload isn&apos;t wired up yet — needs a storage
        backend decision (Cloudflare R2 recommended, see README). This browses and manages
        existing media rows.
      </div>

      {media.length === 0 ? (
        <div className="empty-state">
          <h3>No media yet</h3>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem" }}>
          {media.map((m) => (
            <div key={m.id} className="card" style={{ overflow: "hidden" }}>
              {m.fileType.startsWith("image") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/${m.filePath.replace(/^\/+/, "")}`}
                  alt={m.altText ?? ""}
                  style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }}
                />
              ) : (
                <div style={{ height: 120, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--gray-100)" }}>
                  <i className="fas fa-file" style={{ fontSize: "2rem", color: "var(--gray-400)" }} />
                </div>
              )}
              <div style={{ padding: "0.5rem 0.75rem" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--gray-600)", wordBreak: "break-all", marginBottom: "0.5rem" }}>
                  {m.filePath.split("/").pop()}
                </div>
                <DeleteMediaButton mediaId={m.id} />
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav className="pagination" style={{ marginTop: "1.5rem" }}>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <a key={p} href={`/admin/file-manager?page=${p}`} className={p === page ? "current" : undefined}>
              {p}
            </a>
          ))}
        </nav>
      )}
    </div>
  );
}
