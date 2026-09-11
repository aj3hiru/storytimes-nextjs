import Link from "next/link";
import { postUrl } from "@/lib/urls";

export interface GridPost {
  id: number;
  title: string;
  slug: string;
  bannerImage: string | null;
  bannerAlt: string | null;
}

export function PostGrid({ posts }: { posts: GridPost[] }) {
  return (
    <div className="post-grid">
      {posts.map((post) => (
        <article className="post-card" key={post.id}>
          <Link href={postUrl(post.slug)} className="post-card-link">
            <div className="post-banner">
              {post.bannerImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`/${post.bannerImage.replace(/^\/+/, "")}`}
                  alt={post.bannerAlt || post.title}
                  loading="lazy"
                  width={1200}
                  height={675}
                />
              ) : (
                <div className="post-banner-placeholder">{post.title.charAt(0).toUpperCase()}</div>
              )}
            </div>
            <div className="post-card-content">
              <h2 className="post-card-title">{post.title}</h2>
              <span className="post-card-readmore">
                Read More
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </span>
            </div>
          </Link>
        </article>
      ))}
    </div>
  );
}
