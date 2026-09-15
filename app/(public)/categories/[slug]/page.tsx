import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { resolveSiteConfig, buildListingMetadata } from "@/lib/config";
import { getCategoryBySlug, getCategoryPosts } from "@/lib/listings";
import { PostGrid } from "@/components/shared/PostGrid";
import { Pagination } from "@/components/shared/Pagination";
import { ListingAds } from "@/components/shared/ListingAds";

// ISR — same reasoning as the homepage/post pages. NOTE: the category
// view-counter increment below now only runs when this page actually
// regenerates (not on every cached hit), which is a good thing under
// heavy traffic — far fewer redundant UPDATE queries hitting the DB.
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const cat = await getCategoryBySlug(slug);
  if (!cat) return {};
  const siteConfig = await resolveSiteConfig("");
  const title = `${cat.metaTitle || cat.name} | ${siteConfig.siteName}`;
  const description = cat.metaDescription || `Explore all posts in ${cat.name} on ${siteConfig.siteName}`;
  return {
    title,
    description,
    ...buildListingMetadata(siteConfig, title, description, `/categories/${slug}`),
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const cat = await getCategoryBySlug(slug);
  if (!cat) notFound();

  // Fire-and-forget view counter, mirrors `UPDATE categories SET views = views + 1`.
  prisma.category.update({ where: { id: cat.id }, data: { views: { increment: 1 } } }).catch(() => {});

  const { posts, total, totalPages } = await getCategoryPosts(cat.id, page);

  return (
    <main>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <ol>
          <li>
            <Link href="/categories">Categories</Link>
          </li>
          <li aria-current="page">{cat.name}</li>
          <li aria-hidden="true">&middot;</li>
          <li className="breadcrumb-count">
            {total} {total === 1 ? "Post" : "Posts"}
          </li>
        </ol>
      </nav>

      <div className="container">
        <h1 className="sr-only">{cat.name}</h1>

        {posts.length === 0 ? (
          <p>No posts found in this category.</p>
        ) : (
          <>
            <ListingAds page="category" position="before_content" />
            <PostGrid posts={posts} />
            <ListingAds page="category" position="after_content" />
            <Pagination page={page} totalPages={totalPages} buildHref={(p) => (p > 1 ? `/categories/${slug}?page=${p}` : `/categories/${slug}`)} />
          </>
        )}
      </div>
    </main>
  );
}
