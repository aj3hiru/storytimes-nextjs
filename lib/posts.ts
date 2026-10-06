import { revalidateTag, unstable_cache } from "next/cache";
import { prisma } from "./db";

/**
 * Listing data is cached (tag "posts", 60 s) so public pages don't wait on
 * the remote database for every visitor; saving, publishing or deleting a
 * post clears the tag. Cached values come back as JSON, so dates are
 * turned back into Date objects.
 */
export const POSTS_TAG = "posts";
const toDate = (d: Date | string | null) => (d ? new Date(d) : null);

/** Call after any change to posts so listings refresh at once. */
export function invalidatePosts(): void {
  try {
    revalidateTag(POSTS_TAG, "max");
  } catch {
    // outside a request (background job) — the 60 s cache expiry covers it
  }
}

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
async function loadHomePosts(limit: number, offset: number): Promise<HomePostRow[]> {
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
const cachedHomePosts = unstable_cache(loadHomePosts, ["home-posts"], { revalidate: 60, tags: [POSTS_TAG] });

export async function getHomePosts(limit: number, offset: number): Promise<HomePostRow[]> {
  return (await cachedHomePosts(limit, offset)).map((p) => ({ ...p, date: toDate(p.date) }));
}

export const getHomePostsTotal = unstable_cache(() => prisma.post.count({ where: { status: "published" } }), ["home-posts-total"], {
  revalidate: 60,
  tags: [POSTS_TAG],
});

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
/** Most-viewed published posts: summed in the database, not by loading every post. */
async function loadPopularPosts(limit: number): Promise<PopularPostRow[]> {
  const top = await prisma.postView.groupBy({
    by: ["postId"],
    where: { post: { status: "published" } },
    _sum: { views: true },
    orderBy: { _sum: { views: "desc" } },
    take: limit,
  });
  const ids = top.map((t) => t.postId);
  const posts = ids.length
    ? await prisma.post.findMany({
        where: { id: { in: ids } },
        select: { id: true, title: true, slug: true, date: true, featuredImage: { select: { filePath: true } } },
      })
    : [];
  const byId = new Map(posts.map((p) => [p.id, p]));
  const out: PopularPostRow[] = [];
  for (const t of top) {
    const p = byId.get(t.postId);
    if (p) out.push({ id: p.id, title: p.title, slug: p.slug, date: p.date, bannerPath: p.featuredImage?.filePath ?? null, totalViews: t._sum.views ?? 0 });
  }
  // Fewer posts with views than asked for: fill up with the newest ones.
  if (out.length < limit) {
    const fill = await prisma.post.findMany({
      where: { status: "published", id: { notIn: out.map((p) => p.id) } },
      orderBy: { date: "desc" },
      take: limit - out.length,
      select: { id: true, title: true, slug: true, date: true, featuredImage: { select: { filePath: true } } },
    });
    for (const p of fill) out.push({ id: p.id, title: p.title, slug: p.slug, date: p.date, bannerPath: p.featuredImage?.filePath ?? null, totalViews: 0 });
  }
  return out;
}

const cachedPopularPosts = unstable_cache(loadPopularPosts, ["popular-posts"], { revalidate: 300, tags: [POSTS_TAG] });

export async function getPopularPosts(limit: number): Promise<PopularPostRow[]> {
  return (await cachedPopularPosts(limit)).map((p) => ({ ...p, date: toDate(p.date) }));
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
