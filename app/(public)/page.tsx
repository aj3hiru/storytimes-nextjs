import "./homepage.css";
import Link from "next/link";
import type { Metadata } from "next";
import { getAppConfig, resolveSiteConfig, POSTS_PER_PAGE } from "@/lib/config";
import { getHomePosts, getHomePostsTotal, getPopularPosts } from "@/lib/posts";
import { postUrl, isNewPost, resolveMediaUrl } from "@/lib/urls";
import { getAdHtmlFor } from "@/lib/adRendering";
import { AdminHtml } from "@/components/AdminHtml";

// Same ISR reasoning as the post pages — homepage stays fast under any
// amount of concurrent AI-generation write load. New/updated posts also
// trigger an on-demand revalidatePath("/") from lib/postEditor.ts.
export const revalidate = 60;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}): Promise<Metadata> {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);
  const [appConfig, siteConfig] = await Promise.all([getAppConfig(), resolveSiteConfig("")]);

  const homeTitle = appConfig.site_title?.trim() || siteConfig.siteName;
  const homeTagline = appConfig.site_tagline?.trim() || "";
  let title = homeTagline ? `${homeTitle} | ${homeTagline}` : homeTitle;
  if (page > 1) title += ` — Page ${page}`;
  const description = appConfig.meta_description?.trim() || siteConfig.seoDefaultDescription;

  // Real gap fixed here: the homepage previously had only a bare
  // title/description — no OpenGraph, no Twitter Card, no canonical URL
  // — so sharing the homepage link on Facebook/WhatsApp/Twitter/LinkedIn
  // showed a blank or generic preview instead of the site's actual logo
  // and description.
  return {
    title,
    description,
    alternates: { canonical: page > 1 ? `/?page=${page}` : "/" },
    openGraph: {
      type: "website",
      title,
      description,
      url: page > 1 ? `/?page=${page}` : "/",
      siteName: siteConfig.siteName,
      images: [{ url: siteConfig.seoDefaultImage, width: 1200, height: 630, alt: siteConfig.siteName }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [siteConfig.seoDefaultImage],
    },
  };
}

/** JSON-LD "WebSite" + "Organization" schema — helps Google understand the
 *  site's identity and can enable a sitelinks search box in search
 *  results. Was completely absent before this pass. */
function HomeJsonLd({ siteConfig }: { siteConfig: { siteName: string; siteUrl: string; siteLogo: string } }) {
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: siteConfig.siteName,
      url: siteConfig.siteUrl,
      potentialAction: {
        "@type": "SearchAction",
        target: `${siteConfig.siteUrl}/search?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: siteConfig.siteName,
      url: siteConfig.siteUrl,
      logo: siteConfig.siteLogo,
    },
  ];
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />;
}

function formatDate(d: Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function truncate(text: string | null, max: number): string {
  const t = (text ?? "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const requestedPage = Math.max(1, parseInt(pageParam ?? "1", 10) || 1);

  const appConfig = await getAppConfig();
  const perPage = Math.max(
    1,
    Math.min(30, parseInt(appConfig.hp_posts_per_page ?? String(POSTS_PER_PAGE), 10) || POSTS_PER_PAGE)
  );

  const totalPosts = await getHomePostsTotal();
  const totalPages = Math.max(1, Math.ceil(totalPosts / perPage));
  const page = Math.min(requestedPage, totalPages);
  const offset = (page - 1) * perPage;

  const posts = await getHomePosts(perPage, offset);

  const sidebarCount = Math.max(1, Math.min(10, parseInt(appConfig.homepage_sidebar_count ?? "6", 10) || 6));
  const sidebarOn = (appConfig.homepage_sidebar_enabled ?? "1") !== "0";
  const popularPosts = sidebarOn ? await getPopularPosts(sidebarCount) : [];
  const sidebarTitleSize = Math.max(10, Math.min(40, parseInt(appConfig.homepage_sidebar_title_font_size ?? "18", 10) || 18));
  // Real gap fixed here: this used to read a dedicated, hardcoded
  // "homepageTop" field instead of the general block-targeting system
  // every OTHER Ad Inserter block already uses — a block set to
  // Homepage + "Before content" now renders here instead, matching how
  // every other page/insertion combination already works.
  const homepageTopAd = await getAdHtmlFor("homepage", "before_content");
  const siteConfig = await resolveSiteConfig("");

  const showBreadcrumb = (appConfig.hp_breadcrumb_enabled ?? "1") === "1";
  const breadcrumbText = appConfig.hp_breadcrumb_text?.trim() || "Story";

  const aboveFold = posts.slice(0, 3);
  const belowFold = posts.slice(3);
  const featPost = aboveFold[0] ?? null;
  const sideItems = aboveFold.slice(1, 3);

  return (
    <>
      <HomeJsonLd siteConfig={siteConfig} />
      <main id="main-content">
      <div className="hp-page">
        <div className="hp-wrap">
          {showBreadcrumb && (
            <div className="hp-breadcrumb">
              <h2 className="hp-breadcrumb-title">
                <Link href="/">{breadcrumbText}</Link>
              </h2>
              <div className="hp-breadcrumb-search">
                <form action="/search" method="GET">
                  <input type="text" name="q" placeholder="Type keywords...." autoComplete="off" />
                  <button type="submit" aria-label="Search">
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </button>
                </form>
              </div>
            </div>
          )}

          <div className={`hp-layout${sidebarOn ? "" : " hp-no-sidebar"}`}>
            {/* ━━━ LEFT: POSTS ━━━ */}
            {/* Homepage ad slot — ports the .ai-block third-party ad-widget
                position from the live site's homepage. */}
            <div className="hp-main-col">
              {homepageTopAd && (
                <div className="ad-slot ad-slot--homepage-top" style={{ textAlign: "center" }}>
                  {/* Real critical bug fixed here: raw dangerouslySetInnerHTML
                      never executes <script> tags (a browser DOM-spec rule) —
                      a native-ad-network widget here (e.g. MGID, the exact
                      use case this slot documents) is almost always a
                      <script> tag, so it was rendering into the page but
                      silently never actually running. */}
                  <AdminHtml html={homepageTopAd} allowFrame />
                </div>
              )}
              {posts.length > 0 ? (
                <>
                  {featPost && (
                    <div className="hp-feat-row">
                      <article className="hp-feat-main">
                        <Link href={postUrl(featPost.slug)} className="hp-f-thumb">
                          {featPost.bannerPath ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={resolveMediaUrl(featPost.bannerPath)}
                              alt={featPost.title}
                              loading="eager"
                              width={720}
                              height={405}
                            />
                          ) : (
                            <div className="hp-f-thumb-fb">
                              <span aria-hidden="true">🖼</span>
                            </div>
                          )}
                        </Link>
                        <h3 className="hp-f-title">
                          <Link href={postUrl(featPost.slug)}>{featPost.title}</Link>
                        </h3>
                        {featPost.excerpt && (
                          <p className="hp-f-excerpt">{truncate(featPost.excerpt, 180)}</p>
                        )}
                      </article>

                      {sideItems.length > 0 && (
                        <div className="hp-feat-side">
                          {sideItems.map((post) => (
                            <article className="hp-side-item" key={post.id}>
                              <Link href={postUrl(post.slug)} className="hp-s-thumb">
                                {post.bannerPath ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={resolveMediaUrl(post.bannerPath)}
                                    alt={post.title}
                                    loading="eager"
                                    width={640}
                                    height={360}
                                  />
                                ) : (
                                  <div className="hp-s-thumb-fb">
                                    <span aria-hidden="true">🖼</span>
                                  </div>
                                )}
                              </Link>
                              <h3 className="hp-s-title">
                                <Link href={postUrl(post.slug)}>{post.title}</Link>
                              </h3>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {belowFold.length > 0 && (
                    <div className="hp-below-fold">
                      <div className="hp-grid">
                        {belowFold.map((post) => {
                          const dateStr = formatDate(post.date);
                          const excerpt = truncate(post.excerpt, 140);
                          const isNew = post.date ? isNewPost(post.date) : false;
                          return (
                            <article className="hp-card" key={post.id}>
                              <Link href={postUrl(post.slug)} tabIndex={-1} aria-hidden="true" className="hp-thumb">
                                {post.bannerPath ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={resolveMediaUrl(post.bannerPath)}
                                    alt={post.title}
                                    loading="lazy"
                                    width={640}
                                    height={360}
                                  />
                                ) : (
                                  <div className="hp-thumb-fb">
                                    <span aria-hidden="true">🖼</span>
                                  </div>
                                )}
                                {isNew && <span className="hp-new-badge">New</span>}
                              </Link>
                              <div className="hp-body">
                                {post.catName && <div className="hp-cat-eyebrow">{post.catName}</div>}
                                <div className="hp-meta-date">
                                  <time dateTime={post.date ? new Date(post.date).toISOString().slice(0, 10) : undefined}>
                                    {dateStr}
                                  </time>
                                </div>
                                <h2 className="hp-title">
                                  <Link href={postUrl(post.slug)}>{post.title}</Link>
                                </h2>
                                {excerpt && <p className="hp-excerpt">{excerpt}</p>}
                                <Link className="hp-read-link" href={postUrl(post.slug)}>
                                  Read Story <span aria-hidden="true">→</span>
                                </Link>
                              </div>
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {totalPages > 1 && (
                    <nav className="hp-pagination" aria-label="Post pagination">
                      {page > 1 ? (
                        <Link
                          className="hp-page-btn hp-page-prev"
                          href={page - 1 > 1 ? `/?page=${page - 1}` : "/"}
                          rel="prev"
                        >
                          &larr; Prev
                        </Link>
                      ) : (
                        <span className="hp-page-btn hp-page-prev disabled-btn">&larr; Prev</span>
                      )}

                      <div className="hp-page-numbers">
                        <PageNumbers page={page} totalPages={totalPages} />
                      </div>

                      {page < totalPages ? (
                        <Link className="hp-page-btn hp-page-next" href={`/?page=${page + 1}`} rel="next">
                          Next &rarr;
                        </Link>
                      ) : (
                        <span className="hp-page-btn hp-page-next disabled-btn">Next &rarr;</span>
                      )}
                    </nav>
                  )}
                </>
              ) : (
                <div className="hp-empty">
                  <p>No posts found. Check back soon!</p>
                </div>
              )}
            </div>
            {/* /LEFT */}

            {/* ━━━ RIGHT: SIDEBAR ━━━ */}
            {sidebarOn && popularPosts.length > 0 && (
              <aside className="hp-sidebar">
                <div className="hp-topstories">
                  <h3 className="hp-ts-title" style={{ fontSize: sidebarTitleSize }}>
                    Top Stories
                  </h3>
                  <ul className="hp-ts-list">
                    {popularPosts.map((pop) => (
                      <li className="hp-ts-item" key={pop.id}>
                        <Link href={postUrl(pop.slug)} title={pop.title}>
                          {pop.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
            )}
          </div>
        </div>
      </div>
    </main>
    </>
  );
}

function PageNumbers({ page, totalPages }: { page: number; totalPages: number }) {
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  const nodes: React.ReactNode[] = [];

  if (start > 1) {
    nodes.push(
      <Link className="hp-page-num" href="/" key="first">
        1
      </Link>
    );
    if (start > 2) nodes.push(<span className="hp-page-dots" key="dots-start">…</span>);
  }

  for (let p = start; p <= end; p++) {
    if (p === page) {
      nodes.push(
        <span className="hp-page-num hp-page-current" aria-current="page" key={p}>
          {p}
        </span>
      );
    } else {
      nodes.push(
        <Link className="hp-page-num" href={p > 1 ? `/?page=${p}` : "/"} key={p}>
          {p}
        </Link>
      );
    }
  }

  if (end < totalPages) {
    if (end < totalPages - 1) nodes.push(<span className="hp-page-dots" key="dots-end">…</span>);
    nodes.push(
      <Link className="hp-page-num" href={`/?page=${totalPages}`} key="last">
        {totalPages}
      </Link>
    );
  }

  return <>{nodes}</>;
}
