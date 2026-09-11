import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { resolveSiteConfig } from "@/lib/config";
import { categoryUrl } from "@/lib/urls";

// ISR — same reasoning as the homepage/post pages (see there for details).
export const revalidate = 120;

export async function generateMetadata(): Promise<Metadata> {
  const siteConfig = await resolveSiteConfig("");
  return {
    title: `All Categories | ${siteConfig.siteName}`,
    description: `Browse every topic on ${siteConfig.siteName} and jump straight to the stories that interest you.`,
  };
}

export default async function CategoriesPage() {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      _count: { select: { posts: { where: { status: "published" } } } },
    },
  });

  return (
    <main>
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <ol>
          <li aria-current="page">Categories</li>
        </ol>
      </nav>

      <div className="container">
        <div className="page-hero">
          <h1 className="page-title">All Categories</h1>
          <p className="page-hero-desc">Browse every topic and jump straight to the stories that interest you.</p>
          <span className="page-hero-meta">
            {categories.length} {categories.length === 1 ? "Category" : "Categories"}
          </span>
        </div>

        {categories.length === 0 ? (
          <p className="no-posts-message">No categories found.</p>
        ) : (
          <div className="post-grid">
            {categories.map((cat) => (
              <article className="post-card" key={cat.id}>
                <Link href={categoryUrl(cat.slug)} className="post-card-link">
                  <div className="post-card-content">
                    <h2 className="post-card-title">{cat.name}</h2>
                    <span className="post-card-readmore">
                      {cat._count.posts} {cat._count.posts === 1 ? "Post" : "Posts"}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14M13 6l6 6-6 6" />
                      </svg>
                    </span>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
