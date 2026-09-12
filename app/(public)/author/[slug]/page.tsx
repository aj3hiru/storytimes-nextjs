import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { resolveSiteConfig, buildListingMetadata } from "@/lib/config";
import { getAuthorBySlug, getAuthorPosts } from "@/lib/listings";
import { PostGrid } from "@/components/shared/PostGrid";
import { Pagination } from "@/components/shared/Pagination";
import { authorUrl } from "@/lib/urls";

// ISR — same reasoning as the homepage/post pages.
export const revalidate = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const author = await getAuthorBySlug(slug);
  if (!author) return {};
  const siteConfig = await resolveSiteConfig("");
  const title = `Articles by ${author.name} | ${siteConfig.siteName}`;
  const description = `Browse all articles and updates written by ${author.name} on ${siteConfig.siteName}.`;
  return {
    title,
    description,
    ...buildListingMetadata(siteConfig, title, description, authorUrl(author.slug)),
  };
}

export default async function AuthorPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const author = await getAuthorBySlug(slug);
  if (!author) notFound();

  const { posts, total, totalPages } = await getAuthorPosts(author.id, page);

  const sameAs = [author.instagram, author.threads, author.linkedin, author.facebook, author.twitter].filter(
    Boolean
  ) as string[];

  return (
    <main>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <ol>
          <li aria-current="page">{author.name}</li>
        </ol>
      </nav>

      <div className="container">
        <div className="author-bio">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={author.profileImage ? `/${author.profileImage.replace(/^\/+/, "")}` : "/assets/img/user.png"}
            alt={author.name}
            width={88}
            height={88}
            style={{ width: 88, height: 88, borderRadius: "50%", objectFit: "cover" }}
          />
          <h1 className="page-title">About {author.name}</h1>
          <span className="author-stat-pill">
            {total} {total === 1 ? "Article" : "Articles"} Published
          </span>
          {author.bio && (
            <p style={{ whiteSpace: "pre-line" }}>{author.bio}</p>
          )}
          {sameAs.length > 0 && (
            <div className="author-follow-links">
              <h2>Follow on</h2>
              <div className="author-social-links">
                {author.instagram && (
                  <a href={author.instagram} target="_blank" rel="noopener noreferrer">
                    Instagram
                  </a>
                )}
                {author.threads && (
                  <a href={author.threads} target="_blank" rel="noopener noreferrer">
                    Threads
                  </a>
                )}
                {author.linkedin && (
                  <a href={author.linkedin} target="_blank" rel="noopener noreferrer">
                    LinkedIn
                  </a>
                )}
                {author.facebook && (
                  <a href={author.facebook} target="_blank" rel="noopener noreferrer">
                    Facebook
                  </a>
                )}
                {author.twitter && (
                  <a href={author.twitter} target="_blank" rel="noopener noreferrer">
                    X
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        <h2 className="section-heading">Posts by {author.name}</h2>

        {posts.length === 0 ? (
          <p>No posts found by this author.</p>
        ) : (
          <>
            <PostGrid posts={posts} />
            <Pagination
              page={page}
              totalPages={totalPages}
              buildHref={(p) => `${authorUrl(slug)}${p > 1 ? `?page=${p}` : ""}`}
            />
          </>
        )}
      </div>
    </main>
  );
}
