import { prisma } from "./db";
import type { UserRole } from "@prisma/client";
import type { Permissions } from "./auth";
import { canManageAllPosts } from "./auth";

export interface PostListFilters {
  status?: string;
  categoryId?: number;
  stateId?: number;
  search?: string;
  authorUserId?: number;
  page?: number;
  perPage?: number;
}

export interface PostListRow {
  id: number;
  title: string;
  status: string;
  date: Date | null;
  updatedAt: Date | null;
  slug: string;
  authorName: string;
  authorUserId: number;
  views: number;
  bannerImage: string | null;
}

export async function listPosts(
  userId: number,
  role: UserRole,
  permissions: Permissions | null,
  filters: PostListFilters
) {
  const canEditAll = canManageAllPosts(role, permissions, "edit");
  const perPage = filters.perPage && [20, 50, 100].includes(filters.perPage) ? filters.perPage : 20;
  const page = Math.max(1, filters.page ?? 1);

  const where: Record<string, unknown> = {};
  if (!canEditAll) where.author = { userId };
  if (filters.status && filters.status !== "all") where.status = filters.status;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.stateId) where.stateId = filters.stateId;
  if (filters.authorUserId && canEditAll) where.author = { userId: filters.authorUserId };
  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search } },
      { author: { name: { contains: filters.search } } },
    ];
  }

  const [statusCounts, total, rows] = await Promise.all([
    prisma.post.groupBy({
      by: ["status"],
      where: canEditAll ? {} : { author: { userId } },
      _count: true,
    }),
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      orderBy: { date: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        title: true,
        status: true,
        date: true,
        updatedAt: true,
        slug: true,
        author: { select: { name: true, userId: true } },
        featuredImage: { select: { filePath: true } },
        postViews: { where: { chapterNumber: 0 }, select: { views: true }, take: 1 },
      },
    }),
  ]);

  const counts = { published: 0, draft: 0, archived: 0 };
  for (const c of statusCounts) counts[c.status] = c._count;

  const posts: PostListRow[] = rows.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    date: p.date,
    updatedAt: p.updatedAt,
    slug: p.slug,
    authorName: p.author.name,
    authorUserId: p.author.userId,
    views: p.postViews[0]?.views ?? 0,
    bannerImage: p.featuredImage?.filePath ?? null,
  }));

  return {
    posts,
    total,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
    page,
    perPage,
    counts,
    canEditAll,
  };
}

export interface DeleteResult {
  success: boolean;
  error?: string;
}

export interface BulkDeleteResult {
  deleted: number;
  skipped: number;
}

/** Ports the bulk_delete handler in admin/blogs-manager.php — same
 *  cascading cleanup as deletePost(), just looped over a set of ids and
 *  filtered down to ones the caller actually has permission to delete. */
export async function bulkDeletePosts(
  postIds: number[],
  userId: number,
  role: UserRole,
  permissions: Permissions | null
): Promise<BulkDeleteResult> {
  let deleted = 0;
  let skipped = 0;
  for (const postId of postIds) {
    const result = await deletePost(postId, userId, role, permissions);
    if (result.success) deleted++;
    else skipped++;
  }
  return { deleted, skipped };
}

/**
 * Ports the cascading cleanup in admin/blogs-manager.php's delete handler:
 * media rows, post_meta, post_categories, post_tag, post_stats_daily,
 * chapter_visitor_log, visitor_log, post_views, then the post itself — all
 * in one transaction. (Actual file/object storage cleanup for the media
 * rows is a TODO for whichever storage backend is wired up — R2/S3 — since
 * that's an external API call, not a DB operation.)
 */
export async function deletePost(
  postId: number,
  userId: number,
  role: UserRole,
  permissions: Permissions | null
): Promise<DeleteResult> {
  const canDeleteAll = canManageAllPosts(role, permissions, "delete");

  const post = await prisma.post.findFirst({
    where: canDeleteAll ? { id: postId } : { id: postId, author: { userId } },
    select: { id: true, title: true, featuredImageId: true },
  });
  if (!post) {
    return { success: false, error: "Post not found or you don't have permission to delete it." };
  }

  try {
    await prisma.$transaction([
      prisma.media.deleteMany({ where: { OR: [{ postId }, { id: post.featuredImageId ?? -1 }] } }),
      prisma.postMeta.deleteMany({ where: { postId } }),
      prisma.postCategory.deleteMany({ where: { postId } }),
      prisma.postTag.deleteMany({ where: { postId } }),
      prisma.postStatsDaily.deleteMany({ where: { postId } }),
      prisma.chapterVisitorLog.deleteMany({ where: { postId } }),
      prisma.visitorLog.deleteMany({ where: { postId } }),
      prisma.postView.deleteMany({ where: { postId } }),
      prisma.comment.deleteMany({ where: { postId } }),
      prisma.post.delete({ where: { id: postId } }),
      prisma.activityLog.create({
        data: {
          userId,
          actionType: "post_delete",
          description: `Deleted Post: ${post.title.slice(0, 50)} (ID: ${postId})`,
        },
      }),
    ]);
    return { success: true };
  } catch (err) {
    console.error("Failed to delete post:", err);
    return { success: false, error: "Failed to delete post." };
  }
}
