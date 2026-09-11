import { prisma } from "./db";
import { POSTS_PER_PAGE } from "./config";

export interface ListingPost {
  id: number;
  title: string;
  slug: string;
  bannerImage: string | null;
  bannerAlt: string | null;
}

function toListingPost(p: {
  id: number;
  title: string;
  slug: string;
  featuredImage: { filePath: string; altText: string | null } | null;
}): ListingPost {
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    bannerImage: p.featuredImage?.filePath ?? null,
    bannerAlt: p.featuredImage?.altText ?? null,
  };
}

// ── Category (category.php) ─────────────────────────────────────────────

export async function getCategoryBySlug(slug: string) {
  return prisma.category.findUnique({ where: { slug } });
}

export async function getCategoryPosts(categoryId: number, page: number) {
  const perPage = POSTS_PER_PAGE;
  const offset = (page - 1) * perPage;
  const [total, rows] = await Promise.all([
    prisma.post.count({ where: { categoryId, status: "published" } }),
    prisma.post.findMany({
      where: { categoryId, status: "published" },
      orderBy: { date: "desc" },
      skip: offset,
      take: perPage,
      select: { id: true, title: true, slug: true, featuredImage: { select: { filePath: true, altText: true } } },
    }),
  ]);
  return { posts: rows.map(toListingPost), total, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

// ── Tag (tag.php) ────────────────────────────────────────────────────────

export async function getTagById(id: number) {
  return prisma.tag.findUnique({ where: { id: BigInt(id) } });
}

export async function getTagPosts(tagId: number, page: number) {
  const perPage = POSTS_PER_PAGE;
  const offset = (page - 1) * perPage;
  const where = { status: "published" as const, postTags: { some: { tagId: BigInt(tagId) } } };
  const [total, rows] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      orderBy: { date: "desc" },
      skip: offset,
      take: perPage,
      select: { id: true, title: true, slug: true, featuredImage: { select: { filePath: true, altText: true } } },
    }),
  ]);
  return { posts: rows.map(toListingPost), total, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

// ── Author (author.php) ─────────────────────────────────────────────────

export async function getAuthorBySlug(slug: string) {
  return prisma.author.findUnique({ where: { slug } });
}

export async function getAuthorPosts(authorId: number, page: number) {
  const perPage = POSTS_PER_PAGE;
  const offset = (page - 1) * perPage;
  const [total, rows] = await Promise.all([
    prisma.post.count({ where: { authorId, status: "published" } }),
    prisma.post.findMany({
      where: { authorId, status: "published" },
      orderBy: { date: "desc" },
      skip: offset,
      take: perPage,
      select: { id: true, title: true, slug: true, featuredImage: { select: { filePath: true, altText: true } } },
    }),
  ]);
  return { posts: rows.map(toListingPost), total, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}

// ── Search (search.php) ─────────────────────────────────────────────────

export interface MatchedTopic {
  id: number | bigint;
  name: string;
  slug: string;
  type: "category" | "tag";
}

export async function searchTopics(query: string): Promise<MatchedTopic[]> {
  const [cats, tags] = await Promise.all([
    prisma.category.findMany({
      where: { name: { contains: query } },
      take: 5,
      select: { id: true, name: true, slug: true },
    }),
    prisma.tag.findMany({
      where: { name: { contains: query } },
      take: 5,
      select: { id: true, name: true, slug: true },
    }),
  ]);
  return [
    ...cats.map((c) => ({ ...c, type: "category" as const })),
    ...tags.map((t) => ({ ...t, type: "tag" as const })),
  ];
}

export async function searchPosts(query: string, page: number) {
  const perPage = POSTS_PER_PAGE;
  const offset = (page - 1) * perPage;
  const where = {
    status: "published" as const,
    OR: [{ title: { contains: query } }, { content: { contains: query } }],
  };
  const [total, rows] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      orderBy: { date: "desc" },
      skip: offset,
      take: perPage,
      select: { id: true, title: true, slug: true, featuredImage: { select: { filePath: true, altText: true } } },
    }),
  ]);
  return { posts: rows.map(toListingPost), total, totalPages: Math.max(1, Math.ceil(total / perPage)) };
}
