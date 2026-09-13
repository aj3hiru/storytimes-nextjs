import { prisma } from "./db";

export interface HomePostRow {
  id: number;
  title: string;
  slug: string;
  date: Date | null;
  excerpt: string | null;
  catName: string;
  catSlug: string;
  authorName: string | null;
  authorSlug: string | null;
  bannerPath: string | null;
}

/** Ports getHomePosts() from index.php. */
export async function getHomePosts(limit: number, offset: number): Promise<HomePostRow[]> {
  const rows = await prisma.post.findMany({
    where: { status: "published" },
    orderBy: { date: "desc" },
    take: limit,
    skip: offset,
    select: {
      id: true,
      title: true,
      slug: true,
      date: true,
      excerpt: true,
      category: { select: { name: true, slug: true } },
      author: { select: { name: true, slug: true } },
      featuredImage: { select: { filePath: true } },
    },
  });

  return rows.map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    date: p.date,
    excerpt: p.excerpt,
    catName: p.category.name,
    catSlug: p.category.slug,
    authorName: p.author?.name ?? null,
    authorSlug: p.author?.slug ?? null,
    bannerPath: p.featuredImage?.filePath ?? null,
  }));
}

/** Ports getHomePostsTotal() from index.php. */
export async function getHomePostsTotal(): Promise<number> {
  return prisma.post.count({ where: { status: "published" } });
}

export interface PopularPostRow {
  id: number;
  title: string;
  slug: string;
  date: Date | null;
  bannerPath: string | null;
  totalViews: number;
}

/**
 * Ports getPopularPosts() from index.php, MINUS the cj_smart_cache/
 * blog_views.json file-cache merge — that was a filesystem-based read-path
 * optimization layered on top of the DB `post_views` sum, not a separate
 * source of truth. On serverless there's no shared local disk to hold that
 * cache anyway, so this reads `post_views` directly (still summed across
 * all chapters per post, same as the original SUM(views) GROUP BY post_id).
 */
export async function getPopularPosts(limit: number): Promise<PopularPostRow[]> {
  const rows = await prisma.post.findMany({
    where: { status: "published" },
    select: {
      id: true,
      title: true,
      slug: true,
      date: true,
      featuredImage: { select: { filePath: true } },
      postViews: { select: { views: true } },
    },
  });

  const withTotals = rows.map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    date: p.date,
    bannerPath: p.featuredImage?.filePath ?? null,
    totalViews: p.postViews.reduce((sum, v) => sum + v.views, 0),
  }));

  withTotals.sort((a, b) => b.totalViews - a.totalViews);
  return withTotals.slice(0, limit);
}

export interface LatestPostRow {
  id: number;
  title: string;
  slug: string;
  bannerPath: string | null;
}

/** Simple "most recent N published posts" — feeds the post-page sidebar's
 *  "Latest Posts" widget (ports the sidebar_latest toggle in post.php's
 *  $_pt settings). */
export async function getLatestPosts(limit: number, excludePostId?: number): Promise<LatestPostRow[]> {
  const rows = await prisma.post.findMany({
    where: { status: "published", ...(excludePostId ? { id: { not: excludePostId } } : {}) },
    orderBy: { date: "desc" },
    take: limit,
    select: { id: true, title: true, slug: true, featuredImage: { select: { filePath: true } } },
  });
  // Real gap fixed here: this never selected the featured image at all,
  // so the "Latest Posts" sidebar widget could only ever render as a
  // plain text list — explicit request to show a thumbnail per item,
  // matching the same visual treatment the "Trending" widget already
  // has (which does fetch and show one).
  return rows.map((p) => ({ id: p.id, title: p.title, slug: p.slug, bannerPath: p.featuredImage?.filePath ?? null }));
}
