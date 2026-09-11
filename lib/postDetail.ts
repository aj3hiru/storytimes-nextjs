import { prisma } from "./db";

export interface PostDetail {
  id: number;
  title: string;
  content: string;
  faqJson: string | null;
  date: Date | null;
  updatedAt: Date | null;
  excerpt: string | null;
  slug: string;
  metaDescription: string | null;
  metaKeywords: string | null;
  fbDescription: string | null;
  categoryId: number;
  categoryName: string;
  categorySlug: string;
  authorId: number;
  authorName: string;
  authorSlug: string | null;
  authorBio: string | null;
  authorProfileImage: string | null;
  bannerPath: string | null;
  bannerAlt: string | null;
}

/** Ports the main post SELECT in post.php (post + category + author + featured image joins).
 *  @param includeUnpublished — set by /admin/draft/[slug] preview mode (ports admin/draft.php),
 *  bypasses the published-only filter for logged-in staff to preview drafts. */
export async function getPostBySlug(slug: string, includeUnpublished = false): Promise<PostDetail | null> {
  const post = await prisma.post.findFirst({
    where: { slug, ...(includeUnpublished ? {} : { status: "published" }) },
    include: {
      category: true,
      author: true,
      featuredImage: true,
      // NOTE: the keys actually written by admin/post-manager.php's save
      // handler are 'description' / 'keywords' / 'fb_description' — an
      // earlier pass of this port queried 'meta_description' here, which
      // never matched anything the admin form actually saved. Fixed.
      postMeta: { where: { metaKey: { in: ["description", "keywords", "fb_description"] } } },
    },
  });
  if (!post) return null;

  const metaByKey = Object.fromEntries(post.postMeta.map((m) => [m.metaKey, m.metaValue]));

  return {
    id: post.id,
    title: post.title,
    content: post.content,
    faqJson: post.faqJson,
    date: post.date,
    updatedAt: post.updatedAt,
    excerpt: post.excerpt,
    slug: post.slug,
    metaDescription: metaByKey.description ?? null,
    metaKeywords: metaByKey.keywords ?? null,
    fbDescription: metaByKey.fb_description ?? null,
    categoryId: post.categoryId,
    categoryName: post.category.name,
    categorySlug: post.category.slug,
    authorId: post.authorId,
    authorName: post.author.name,
    authorSlug: post.author.slug,
    authorBio: post.author.bio,
    authorProfileImage: post.author.profileImage,
    bannerPath: post.featuredImage?.filePath ?? null,
    bannerAlt: post.featuredImage?.altText ?? null,
  };
}

export interface RelatedPost {
  id: number;
  title: string;
  slug: string;
  bannerPath: string | null;
}

/** Ports the related-posts query in post.php: same category, excluding the current post. */
export async function getRelatedPosts(categoryId: number, excludePostId: number, limit = 4): Promise<RelatedPost[]> {
  const rows = await prisma.post.findMany({
    where: { categoryId, status: "published", id: { not: excludePostId } },
    orderBy: { date: "desc" },
    take: limit,
    select: { id: true, title: true, slug: true, featuredImage: { select: { filePath: true } } },
  });
  return rows.map((r) => ({ id: r.id, title: r.title, slug: r.slug, bannerPath: r.featuredImage?.filePath ?? null }));
}

/** Increments the word-count-based reading time — ports the word_count/reading_mins calc in post.php. */
export function estimateReadingMinutes(plainText: string): number {
  const words = plainText.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "");
}
