import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { resolveSiteConfig } from "@/lib/config";
import { getTagById, getTagPosts } from "@/lib/listings";
import { PostGrid } from "@/components/shared/PostGrid";
import { Pagination } from "@/components/shared/Pagination";
import { tagUrl } from "@/lib/urls";

// ISR — same reasoning as category pages (view-counter writes also now
// only happen on cache regeneration, not every request).
export const revalidate = 60;

function parseTagSlugId(tagSlugId: string): { slug: string; id: number } | null {
  const match = /^(.+)-(\d+)$/.exec(tagSlugId);
  if (!match) return null;
  return { slug: match[1], id: parseInt(match[2], 10) };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tagSlugId: string }>;
}): Promise<Metadata> {
  const { tagSlugId } = await params;
  const parsed = parseTagSlugId(tagSlugId);
  if (!parsed) return {};
  const tag = await getTagById(parsed.id);
  if (!tag) return {};
  const siteConfig = await resolveSiteConfig("");
  return {
    title: `${tag.name} | ${siteConfig.siteName}`,
    description: `Explore all articles related to ${tag.name} on ${siteConfig.siteName}.`,
  };
}

export default async function TagPage({
  params,
  searchParams,
}: {
  params: Promise<{ tagSlugId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { tagSlugId } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const parsed = parseTagSlugId(tagSlugId);
  if (!parsed) notFound();

  const tag = await getTagById(parsed.id);
  if (!tag) notFound();

  // Canonical-slug redirect, mirrors keeping the id authoritative while the
  // slug in the URL is cosmetic (same idea as the original's tag.php?id=).
  if (tag.slug !== parsed.slug) {
    redirect(tagUrl(tag.slug, Number(tag.id)));
  }

  prisma.tag.update({ where: { id: tag.id }, data: { views: { increment: 1 } } }).catch(() => {});

  const { posts, total, totalPages } = await getTagPosts(Number(tag.id), page);

  return (
    <main>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <ol>
          <li aria-current="page">{tag.name}</li>
        </ol>
      </nav>

      <div className="container">
        <div className="page-hero">
          <span className="page-hero-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.59 13.41 11 3.83A2 2 0 0 0 9.59 3.24L4 3a1 1 0 0 0-1 1l.24 5.59a2 2 0 0 0 .59 1.41l9.58 9.59a2 2 0 0 0 2.83 0l4.35-4.35a2 2 0 0 0 0-2.83Z" />
              <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
            </svg>
          </span>
          <h1 className="page-title">#{tag.name}</h1>
          <p className="page-hero-desc">Every article tagged with {tag.name}.</p>
          <span className="page-hero-meta">
            {total} {total === 1 ? "Post" : "Posts"}
          </span>
        </div>

        {posts.length === 0 ? (
          <div className="no-results">
            <p className="no-results-text">No posts found for this tag.</p>
          </div>
        ) : (
          <>
            <PostGrid posts={posts} />
            <Pagination
              page={page}
              totalPages={totalPages}
              buildHref={(p) => `${tagUrl(tag.slug, Number(tag.id))}${p > 1 ? `?page=${p}` : ""}`}
            />
          </>
        )}
      </div>
    </main>
  );
}
