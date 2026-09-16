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

  // Scope for anyone who can't manage every post: their own posts PLUS
  // those of the authors assigned to them (the same `createdById`
  // relationship that scopes the User Manager list and analytics, reused
  // so all three can't drift apart). Previously this was own-posts-only,
  // which meant an editor couldn't even SEE the work of the authors they
  // manage — while `canManageAllPosts()` separately let every editor edit
  // the entire site. Both halves are corrected now.
  const scopeAuthor = { user: { OR: [{ id: userId }, { createdById: userId }] } };

  const where: Record<string, unknown> = {};
  if (!canEditAll) where.author = scopeAuthor;
  if (filters.status && filters.status !== "all") where.status = filters.status;
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.stateId) where.stateId = filters.stateId;
  if (filters.authorUserId) {
    // An author filter is always validated against the caller's own
    // scope: for a restricted viewer it's ANDed with it, so passing
    // another editor's author id in the URL can't widen what they see.
    where.author = canEditAll
      ? { userId: filters.authorUserId }
      : { userId: filters.authorUserId, user: { OR: [{ id: userId }, { createdById: userId }] } };
  }
  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search } },
      { author: { name: { contains: filters.search } } },
    ];
  }

  const [statusCounts, total, rows] = await Promise.all([
    prisma.post.groupBy({
      by: ["status"],
      where: canEditAll ? {} : { author: scopeAuthor },
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
        // Real bug fixed here: this used to filter to `chapterNumber: 0`
        // specifically — but the actual view-tracking endpoint
        // (track-view/route.ts) always writes real chapter numbers (1,
        // 2, 3... — a single-page post tracks as "chapter 1", never 0;
        // see Phase 40's fix), so a `chapterNumber: 0` row is NEVER
        // written by anything, meaning this filter matched nothing and
        // every post's views column showed 0 regardless of real
        // traffic. Fetches every chapter's view row and sums them below
        // instead, since a post's total views should be the sum across
        // all its chapters.
        postViews: { select: { views: true } },
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
    views: p.postViews.reduce((sum, v) => sum + v.views, 0),
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
    select: { id: true, title: true, content: true, featuredImageId: true },
  });
  if (!post) {
    return { success: false, error: "Post not found or you don't have permission to delete it." };
  }

  try {
    // Real bug fixed here: this used to delete the media row matching
    // post.featuredImageId unconditionally — if that SAME image was also
    // set as another post's featured image (picked via "Browse Library"
    // rather than uploaded fresh), deleting THIS post would silently
    // break the OTHER post's featured image too. Only delete it if no
    // other post still references it.
    const sharedAsFeatured =
      post.featuredImageId != null
        ? await prisma.post.count({ where: { featuredImageId: post.featuredImageId, id: { not: postId } } })
        : 0;
    const featuredImageIdToDelete = post.featuredImageId != null && sharedAsFeatured === 0 ? post.featuredImageId : -1;

    // Same real bug, second instance: media rows linked to this post via
    // `postId` (images embedded in ITS content) can ALSO be embedded in
    // another post's content — e.g. picking an existing image from the
    // Media Library modal to insert into a second post's body only adds
    // an <img> tag pointing at the same file, it doesn't add a second
    // database relationship (this schema only tracks one owning post per
    // media row via `postId`). Deleting by `postId` alone would silently
    // 404 that image in every OTHER post whose content still references
    // the same file path. Mirrors the exact "does this file path appear
    // in any other post's content" check lib/aiKeyAdmin.ts's
    // findOrphanedAiMedia() already uses for the same reason.
    const contentLinkedMedia = await prisma.media.findMany({ where: { postId }, select: { id: true, filePath: true } });
    let mediaIdsToDelete: number[] = [];
    if (contentLinkedMedia.length > 0) {
      const otherPostsContent = await prisma.post.findMany({
        where: { id: { not: postId } },
        select: { content: true },
      });
      const combinedOtherContent = otherPostsContent.map((p) => p.content).join("\n");
      mediaIdsToDelete = contentLinkedMedia.filter((m) => !combinedOtherContent.includes(m.filePath)).map((m) => m.id);
    }

    await prisma.$transaction([
      prisma.media.deleteMany({ where: { OR: [{ id: { in: mediaIdsToDelete } }, { id: featuredImageIdToDelete }] } }),
      prisma.postMeta.deleteMany({ where: { postId } }),
      prisma.postCategory.deleteMany({ where: { postId } }),
      prisma.postTag.deleteMany({ where: { postId } }),
      prisma.postStatsDaily.deleteMany({ where: { postId } }),
      // Real bug fixed here: this table was never cleaned up here at
      // all — every OTHER per-post stats/log table was. In production,
      // post_stats_hourly has a real foreign key back to posts (see
      // prisma/migrations_manual/add_post_stats_hourly.sql — no ON
      // DELETE clause, which MySQL treats as RESTRICT), and this table
      // only ever gets rows once a post has actually received real
      // traffic (real-time hourly tracking). That meant deleting any
      // post that had ever been viewed failed on the FK violation —
      // only posts with 0 views (and therefore no hourly rows at all)
      // had nothing to violate, so ONLY those could ever be deleted.
      // Exactly matches "sirf 0-view wale post delete ho rahe hain."
      prisma.postStatsHourly.deleteMany({ where: { postId } }),
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
