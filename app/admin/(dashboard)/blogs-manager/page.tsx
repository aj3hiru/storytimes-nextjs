import Link from "next/link";
import { revalidatePath } from "next/cache";
import { requireUser, canManageAllPosts, resolvePermissions } from "@/lib/auth";
import { listPosts, deletePost, bulkDeletePosts } from "@/lib/postAdmin";
import { prisma } from "@/lib/db";
import { PostsTable } from "@/components/admin/PostsTable";
import { PostDateFilter } from "@/components/admin/PostDateFilter";
import { resolveDateRangeFilter, type DateRangePreset } from "@/lib/istDate";

/**
 * Re-verified against the live admin/blogs-manager.php's actual rendered
 * HTML (view-source), not just the PHP source — the toolbar/table markup
 * here now matches exactly: .allposts-header + .btn-add-post pill button,
 * .post-status-tabs pills, .posts-toolbar-card with icon-prefixed
 * .pt-select dropdowns, and PostsTable.tsx's hover-reveal row actions.
 * Also removed the State filter that an earlier pass added here — the
 * live page doesn't have one (Category/Author/Per-page/Search only).
 */
export default async function BlogsManagerPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    category?: string;
    author?: string;
    search?: string;
    page?: string;
    per_page?: string;
    date_range?: string;
    date_from?: string;
    date_to?: string;
  }>;
}) {
  const user = await requireUser();
  if (!user) return null;
  const permissions = resolvePermissions(user);
  const canEditAllForFilters = canManageAllPosts(user.role, permissions, "edit");

  const {
    status,
    category,
    author,
    search,
    page: pageParam,
    per_page: perPageParam,
    date_range: dateRangePreset,
    date_from: dateFrom,
    date_to: dateTo,
  } = await searchParams;

  // New feature, no PHP equivalent — see PostDateFilter.tsx. No filter is
  // applied unless the person has actually picked one; the page still
  // shows every post by default.
  const validPresets: DateRangePreset[] = ["today", "yesterday", "week", "month", "custom"];
  const dateRange =
    dateRangePreset && validPresets.includes(dateRangePreset as DateRangePreset)
      ? resolveDateRangeFilter(dateRangePreset as DateRangePreset, dateFrom, dateTo)
      : undefined;

  const { posts, total, totalPages, page, perPage, counts, canEditAll } = await listPosts(user.id, user.role, permissions, {
    status,
    categoryId: category ? parseInt(category, 10) : undefined,
    authorUserId: author ? parseInt(author, 10) : undefined,
    search,
    page: pageParam ? parseInt(pageParam, 10) : 1,
    perPage: perPageParam ? parseInt(perPageParam, 10) : 20,
    dateRange,
  });

  const [categories, authors] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // Restricted viewers get a filter listing themselves plus the authors
    // assigned to them — previously they got an empty list, so an editor
    // had no way to narrow down to one of their own authors at all.
    canEditAllForFilters
      ? prisma.author.findMany({ orderBy: { name: "asc" }, select: { userId: true, name: true } })
      : prisma.author.findMany({
          where: { user: { OR: [{ id: user.id }, { createdById: user.id }] } },
          orderBy: { name: "asc" },
          select: { userId: true, name: true },
        }),
  ]);

  async function handleDelete(postId: number) {
    "use server";
    const u = await requireUser();
    if (!u) return;
    const perms = resolvePermissions(u);
    await deletePost(postId, u.id, u.role, perms);
    revalidatePath("/admin/blogs-manager");
  }

  async function handleBulkDelete(ids: number[]) {
    "use server";
    const u = await requireUser();
    if (!u) return { deleted: 0, skipped: ids.length };
    const perms = resolvePermissions(u);
    const result = await bulkDeletePosts(ids, u.id, u.role, perms);
    revalidatePath("/admin/blogs-manager");
    return result;
  }

  const statusTabs: { key: string; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.published + counts.draft + counts.archived },
    { key: "published", label: "Published", count: counts.published },
    { key: "draft", label: "Drafts", count: counts.draft },
    { key: "archived", label: "Archived", count: counts.archived },
  ];

  const qs = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { status, category, author, search, per_page: perPageParam, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const s = params.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div>
      <div className="allposts-header">
        <h2>Posts</h2>
        <div className="allposts-header-actions">
          <Link href="/admin/post-manager/new" className="btn-add-post">
            <span className="add-post-icon">
              <i className="fas fa-plus" />
            </span>{" "}
            Add New Post
          </Link>
        </div>
      </div>

      <div className="post-status-tabs">
        {statusTabs.map((tab) => (
          <Link
            key={tab.key}
            href={`/admin/blogs-manager${qs({ status: tab.key === "all" ? undefined : tab.key, page: undefined })}`}
            className={`pst-link${(status ?? "all") === tab.key ? " active" : ""}`}
          >
            {tab.label} <span className="pst-count">{tab.count}</span>
          </Link>
        ))}
      </div>

      <div className="posts-toolbar-card">
        <form method="GET">
          <input type="hidden" name="status" value={status ?? "all"} />
          <div className="pt-filters">
            <div className="pt-select-wrap">
              <i className="fas fa-layer-group pt-select-icon" />
              <select name="category" className="pt-select" defaultValue={category ?? "all"}>
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            {/* Shown whenever there's more than just the viewer's own author
                profile to choose between — an editor managing several
                authors needs this filter as much as an admin does. A lone
                author still doesn't, so it stays hidden for them. */}
            {authors.length > 1 && (
              <div className="pt-select-wrap">
                <i className="fas fa-user pt-select-icon" />
                <select name="author" className="pt-select" defaultValue={author ?? "all"}>
                  <option value="all">All Authors</option>
                  {authors.map((a) => (
                    <option key={a.userId} value={a.userId}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="pt-select-wrap">
              <i className="fas fa-list-ol pt-select-icon" />
              <select name="per_page" className="pt-select" defaultValue={String(perPage)}>
                <option value="20">20 per page</option>
                <option value="50">50 per page</option>
                <option value="100">100 per page</option>
              </select>
            </div>
            <PostDateFilter
              currentPreset={dateRangePreset ?? null}
              currentFrom={dateFrom ?? null}
              currentTo={dateTo ?? null}
              matchingCount={dateRange ? total : null}
            />
          </div>
          <div className="pt-search-wrap">
            <input type="text" name="search" className="pt-input" placeholder="Search posts…" defaultValue={search} />
            <button type="submit" className="btn btn-primary btn-sm">
              <i className="fas fa-search" /> Search
            </button>
          </div>
        </form>
      </div>

      {posts.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <i className="fas fa-newspaper" />
          </div>
          <h3>No posts found</h3>
          <p>Try adjusting your filters, or create a new post.</p>
        </div>
      ) : (
        <PostsTable
          posts={posts.map((p) => ({
            id: p.id,
            title: p.title,
            slug: p.slug,
            status: p.status,
            date: p.date,
            views: p.views,
            authorName: p.authorName,
            bannerImage: p.bannerImage,
          }))}
          canEditAll={canEditAll}
          onDelete={handleDelete}
          onBulkDelete={handleBulkDelete}
        />
      )}

      {totalPages > 1 && (
        <nav className="tc-pagination">
          <span className="pp-info">
            Page {page} of {totalPages} — {total} posts
          </span>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .slice(0, 20)
            .map((p) => (
              <Link key={p} href={`/admin/blogs-manager${qs({ page: String(p) })}`} className={p === page ? "page-link active" : "page-link"}>
                {p}
              </Link>
            ))}
        </nav>
      )}
    </div>
  );
}
