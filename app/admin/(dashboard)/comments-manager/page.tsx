import { guardPage } from "@/lib/pageGuard";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { CommentModerationRow } from "@/components/admin/CommentModerationRow";

/** Re-verified against the live admin/comments-manager.php's rendered
 *  HTML — an earlier pass used the generic .post-status-tabs/table
 *  pattern instead of this page's own .cm-* classes. */
export default async function CommentsManagerPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; search?: string }>;
}) {
  // Direct-URL access guard — see lib/pageGuard.tsx.
  const denied = await guardPage((p) => p.blogs.manage_comments, "You do not have permission to manage comments.");
  if (denied) return denied;

  const { filter, search } = await searchParams;
  const filterStatus = filter === "pending" ? "pending" : filter === "approved" ? "approved" : undefined;

  const [comments, pendingCount, approvedCount] = await Promise.all([
    prisma.comment.findMany({
      where: {
        ...(filterStatus ? { status: filterStatus } : {}),
        ...(search ? { OR: [{ name: { contains: search } }, { content: { contains: search } }] } : {}),
      },
      orderBy: { date: "desc" },
      take: 100,
      include: { post: { select: { title: true, slug: true } } },
    }),
    prisma.comment.count({ where: { status: "pending" } }),
    prisma.comment.count({ where: { status: "approved" } }),
  ]);

  return (
    <div>
      <div className="cm-header">
        <h1 className="cm-title">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          Comments
        </h1>
      </div>

      <div className="cm-filter-bar">
        <div className="cm-filter-tabs">
          <Link href="/admin/comments-manager?filter=all" className={`cm-filter-tab${!filter || filter === "all" ? " active" : ""}`}>
            <span className="label">All</span>
            <span className="count">{pendingCount + approvedCount}</span>
          </Link>
          <Link href="/admin/comments-manager?filter=pending" className={`cm-filter-tab${filter === "pending" ? " active" : ""}`}>
            <span className="label">Pending</span>
            <span className="count">{pendingCount}</span>
          </Link>
          <Link href="/admin/comments-manager?filter=approved" className={`cm-filter-tab${filter === "approved" ? " active" : ""}`}>
            <span className="label">Approved</span>
            <span className="count">{approvedCount}</span>
          </Link>
        </div>
        <form className="cm-search-form" method="GET">
          {filter && <input type="hidden" name="filter" value={filter} />}
          <input type="search" name="search" className="cm-search-input" placeholder="Search comments…" defaultValue={search} />
          <button type="submit" className="cm-search-btn">
            Search
          </button>
        </form>
      </div>

      {comments.length === 0 ? (
        <div className="empty-state">
          <h3>No comments</h3>
          <p>Nothing to moderate here yet.</p>
        </div>
      ) : (
        <div className="cm-table-wrap">
          <table className="cm-table">
            <thead>
              <tr>
                <th className="col-author">Author</th>
                <th className="col-comment">Comment</th>
                <th className="col-post">In Response To</th>
                <th className="col-status">Status</th>
                <th className="col-date">Date</th>
              </tr>
            </thead>
            <tbody>
              {comments.map((c) => (
                <CommentModerationRow
                  key={c.id}
                  comment={{
                    id: c.id,
                    name: c.name,
                    email: c.email,
                    content: c.content,
                    status: c.status,
                    date: c.date,
                    postTitle: c.post.title,
                    postSlug: c.post.slug,
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
