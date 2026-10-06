import Link from "next/link";
import { AdminHtml } from "@/components/AdminHtml";
import { postUrl, optimizedImage, imageSrcSet } from "@/lib/urls";

export interface GridPost {
  id: number;
  title: string;
  slug: string;
  bannerImage: string | null;
  bannerAlt: string | null;
}

/** Ad Inserter "before/after paragraph N" on list pages = before/after the Nth card. */
export interface GridAdSlots {
  before: Record<number, string>;
  after: Record<number, string>;
}

function GridAd({ html }: { html?: string }) {
  if (!html) return null;
  return <AdminHtml html={html} className="ad-slot post-grid-ad" allowFrame />;
}

export function PostGrid({ posts, ads }: { posts: GridPost[]; ads?: GridAdSlots }) {
  // A slot numbered past the last card still shows, at the end of the list.
  const lastAfter = ads ? Object.entries(ads.after).filter(([n]) => Number(n) > posts.length).map(([, h]) => h).join("") : "";
  const lastBefore = ads ? Object.entries(ads.before).filter(([n]) => Number(n) > posts.length).map(([, h]) => h).join("") : "";
  return (
    <div className="post-grid">
      {posts.map((post, i) => (
        <PostGridItem key={post.id} post={post} before={ads?.before[i + 1]} after={ads?.after[i + 1]} />
      ))}
      <GridAd html={lastBefore + lastAfter} />
    </div>
  );
}

function PostGridItem({ post, before, after }: { post: GridPost; before?: string; after?: string }) {
  return (
    <>
      <GridAd html={before} />
        <article className="post-card">
          <Link prefetch={false} href={postUrl(post.slug)} className="post-card-link">
            <div className="post-banner">
              {post.bannerImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={optimizedImage(post.bannerImage, 640)}
                  srcSet={imageSrcSet(post.bannerImage, [384, 640, 828])}
                  sizes="(max-width: 700px) 100vw, 420px"
                  alt={post.bannerAlt || post.title}
                  loading="lazy"
                  decoding="async"
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
      <GridAd html={after} />
    </>
  );
}
