import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { resolveSiteConfig } from "@/lib/config";
import { searchPosts, searchTopics } from "@/lib/listings";
import { PostGrid } from "@/components/shared/PostGrid";
import { Pagination } from "@/components/shared/Pagination";
import { categoryUrl, tagUrl } from "@/lib/urls";

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const { q } = await searchParams;
  const query = q?.trim() ?? "";
  const siteConfig = await resolveSiteConfig("");
  return {
    title: `Search Results for "${query}" | ${siteConfig.siteName}`,
    description: `Search results for "${query}" on ${siteConfig.siteName}.`,
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: pageParam } = await searchParams;
  const query = q?.trim() ?? "";
  if (!query) redirect("/");

  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const [topics, { posts, total, totalPages }] = await Promise.all([
    searchTopics(query),
    searchPosts(query, page),
  ]);

  return (
    <main>
      <div className="container">
        <div className="page-hero">
          <h1 className="page-title">Search Results</h1>
          <p className="page-hero-desc">Showing results for &ldquo;{query}&rdquo;</p>
          <span className="page-hero-meta">
            {total} {total === 1 ? "Post" : "Posts"}
          </span>
        </div>

        {topics.length > 0 && (
          <div className="search-topics-container">
            <span className="topics-label">Related topics</span>
            <div className="topics-list">
              {topics.map((t) => (
                <Link
                  href={t.type === "category" ? categoryUrl(t.slug) : tagUrl(t.slug, t.id)}
                  className={`topic-badge ${t.type}`}
                  key={`${t.type}-${String(t.id)}`}
                >
                  {t.name}
                </Link>
              ))}
            </div>
          </div>
        )}

        {posts.length === 0 ? (
          <div className="no-results">
            <p className="no-results-text">No posts found for &ldquo;{query}&rdquo;.</p>
            <Link href="/" className="no-results-btn">
              Back to Home
            </Link>
          </div>
        ) : (
          <>
            <PostGrid posts={posts} />
            <Pagination
              page={page}
              totalPages={totalPages}
              buildHref={(p) => `/search?q=${encodeURIComponent(query)}${p > 1 ? `&page=${p}` : ""}`}
            />
          </>
        )}
      </div>
    </main>
  );
}
