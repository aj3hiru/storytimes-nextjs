import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminHtml } from "@/components/AdminHtml";
import { getPostBySlug, getRelatedPosts, estimateReadingMinutes, stripTags } from "@/lib/postDetail";
import { parseChaptersFromContent } from "@/lib/chapters";
import { postUrl, chapterUrl, authorUrl, categoryUrl, resolveMediaUrl } from "@/lib/urls";
import { resolveSiteConfig } from "@/lib/config";
import { getPostTemplateSettings } from "@/lib/postTemplateSettings";
import { getAdHtmlFor, getParagraphAdBlocks } from "@/lib/adRendering";
import { ChapterNav, ChapterStartNav } from "./ChapterNav";
import { ChapterListDrawer } from "./ChapterListDrawer";
import { DesktopTocSidebar } from "./DesktopTocSidebar";
import { ChapterViewTracker } from "./ChapterViewTracker";
import { ShareButtons } from "./ShareButtons";
import { PostSidebar } from "./PostSidebar";
import { CommentsSection } from "../comments/CommentsSection";

/** Ports _inject_after_paragraph() from post.php: splits HTML on top-level
 *  <p> tags and inserts the given HTML right after the Nth paragraph. */
function injectAfterParagraph(html: string, afterN: number, insertHtml: string): string {
  if (afterN < 1 || !insertHtml.trim() || !html.trim()) return html;
  const parts = html.split(/(<p[\s>][\s\S]*?<\/p>)/i);
  let count = 0;
  let done = false;
  let out = "";
  for (const part of parts) {
    out += part;
    if (/^<p[\s>]/i.test(part)) {
      count++;
      if (!done && count === afterN) {
        out += insertHtml;
        done = true;
      }
    }
  }
  if (!done) out += insertHtml;
  return out;
}

/** Same idea as injectAfterParagraph(), but inserts BEFORE the Nth
 *  paragraph instead — needed for Ad Inserter's "Before paragraph"
 *  insertion type (as distinct from "After paragraph", which
 *  injectAfterParagraph already covers). */
function injectBeforeParagraph(html: string, beforeN: number, insertHtml: string): string {
  if (beforeN < 1 || !insertHtml.trim() || !html.trim()) return html;
  const parts = html.split(/(<p[\s>][\s\S]*?<\/p>)/i);
  let count = 0;
  let done = false;
  let out = "";
  for (const part of parts) {
    if (/^<p[\s>]/i.test(part)) {
      count++;
      if (!done && count === beforeN) {
        out += insertHtml;
        done = true;
      }
    }
    out += part;
  }
  if (!done) out += insertHtml;
  return out;
}

/**
 * Comprehensive SEO + social-share metadata for a post/chapter page —
 * previously only had a bare title/description and a partial, buggy
 * OpenGraph block (manually built the image path instead of calling
 * resolveMediaUrl(), so it 404'd once uploads moved to local-disk
 * storage; had no og:type/og:url/og:siteName, no Twitter Card at all,
 * and no canonical URL). Chapter pages (chapter > 0) previously got NO
 * image and NO OpenGraph/Twitter data whatsoever, so a shared chapter
 * link showed a blank/generic preview on every platform.
 */
export async function buildPostMetadata(slug: string, chapter: number): Promise<Metadata> {
  const post = await getPostBySlug(slug);
  if (!post) return {};
  const siteConfig = await resolveSiteConfig("");
  const pt = await getPostTemplateSettings();
  const parsed = pt.chapters
    ? parseChaptersFromContent(post.content)
    : { hasChapters: false, introHtml: "", chapters: [], total: 0 };

  // Real gap fixed here (SEO_FIXES.md #2): a post/chapter with no
  // featured image got NO og:image/twitter:image at all — a blank
  // preview card on every platform. Falls back to the site's own
  // default share image, matching how category/tag/author pages
  // already handle this via siteConfig.seoDefaultImage.
  const imageUrl = post.bannerPath ? resolveMediaUrl(post.bannerPath) : siteConfig.seoDefaultImage;
  const canonicalPath = chapter > 0 ? chapterUrl(post.slug, chapter) : postUrl(post.slug);
  const publishedTime = post.date ? new Date(post.date).toISOString() : undefined;
  const modifiedTime = post.updatedAt ? new Date(post.updatedAt).toISOString() : publishedTime;

  function buildMetadata(title: string, description: string): Metadata {
    if (!post) return {};
    return {
      title,
      description,
      alternates: { canonical: canonicalPath },
      openGraph: {
        type: "article",
        title,
        description,
        url: canonicalPath,
        siteName: siteConfig.siteName,
        images: imageUrl ? [{ url: imageUrl, width: 1200, height: 675, alt: post.bannerAlt || post.title }] : undefined,
        publishedTime,
        modifiedTime,
        authors: post.authorName ? [post.authorName] : undefined,
        section: post.categoryName,
      },
      twitter: {
        card: imageUrl ? "summary_large_image" : "summary",
        title,
        description,
        images: imageUrl ? [imageUrl] : undefined,
      },
    };
  }

  if (parsed.hasChapters && chapter > 0) {
    const ch = parsed.chapters[chapter - 1];
    if (!ch) return {};
    return buildMetadata(
      `${ch.title} — ${post.title} | ${siteConfig.siteName}`,
      stripTags(ch.contentHtml).slice(0, 160)
    );
  }

  const description =
    post.fbDescription?.trim() ||
    post.metaDescription?.trim() ||
    stripTags(parsed.hasChapters ? parsed.introHtml : post.content).slice(0, 160);

  return {
    ...buildMetadata(`${post.title} | ${siteConfig.siteName}`, description),
    keywords: post.metaKeywords?.trim() || undefined,
  };
}

/**
 * JSON-LD "Article" structured data — what actually earns a post the
 * enhanced Google search result (headline, image, publish date, author)
 * rather than a plain blue link. Rendered as a <script type="application/
 * ld+json"> in the page body (Metadata objects can't carry this; it has
 * to be real markup) — was completely absent before this pass, on every
 * single post page.
 */
function PostJsonLd({
  post,
  siteConfig,
  canonicalPath,
  faq,
  chapterInfo,
}: {
  post: { title: string; date: Date | null; updatedAt: Date | null; authorName: string; bannerPath: string | null; bannerAlt: string | null; metaDescription: string | null; fbDescription: string | null };
  siteConfig: { siteName: string; siteUrl: string; seoDefaultImage: string };
  canonicalPath: string;
  /** FAQ items already entered in the post editor and already rendered
   *  on-page (see the pt.faq block further down) — real gap fixed here
   *  (SEO_FIXES.md #3): that same data was never turned into FAQPage
   *  JSON-LD, so posts with FAQs filled in sat on ready-made rich-
   *  result data Google could never see. */
  faq: { q: string; a: string }[];
  /** Real gap fixed here (SEO_FIXES.md #4): chapter pages show a
   *  visible "Post Title · Chapter N of M" breadcrumb on-page but had
   *  no matching BreadcrumbList schema for Google's own breadcrumb
   *  rich result. Only passed (non-null) on an actual chapter page. */
  chapterInfo: { postTitle: string; postUrl: string; chapterTitle: string; chapterNumber: number } | null;
}) {
  // Real gap fixed here (SEO_FIXES.md #2, same fallback as
  // buildPostMetadata above): a post with no featured image had no
  // "image" field in its Article JSON-LD at all — Google's own
  // structured-data guidelines call out image as recommended for the
  // rich-result eligibility this schema exists to earn in the first
  // place.
  const imageUrl = post.bannerPath ? resolveMediaUrl(post.bannerPath) : siteConfig.seoDefaultImage;
  const absoluteImageUrl = imageUrl ? new URL(imageUrl, siteConfig.siteUrl).toString() : undefined;
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.fbDescription?.trim() || post.metaDescription?.trim() || undefined,
    image: absoluteImageUrl ? [absoluteImageUrl] : undefined,
    datePublished: post.date ? new Date(post.date).toISOString() : undefined,
    dateModified: post.updatedAt ? new Date(post.updatedAt).toISOString() : undefined,
    author: { "@type": "Person", name: post.authorName },
    publisher: {
      "@type": "Organization",
      name: siteConfig.siteName,
      logo: { "@type": "ImageObject", url: siteConfig.siteUrl + "/assets/img/logo.webp" },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": new URL(canonicalPath, siteConfig.siteUrl).toString() },
  };

  const faqSchema =
    faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faq.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }
      : null;

  const breadcrumbSchema = chapterInfo
    ? {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: chapterInfo.postTitle, item: new URL(chapterInfo.postUrl, siteConfig.siteUrl).toString() },
          { "@type": "ListItem", position: 2, name: `Chapter ${chapterInfo.chapterNumber}: ${chapterInfo.chapterTitle}`, item: new URL(canonicalPath, siteConfig.siteUrl).toString() },
        ],
      }
    : null;

  // Combine whichever schemas actually apply into a single @graph — a
  // page can validly carry multiple structured-data types at once, and
  // @graph is schema.org's own documented way to do that in one script
  // tag rather than needing a separate <script> per type.
  const graph = [articleSchema, faqSchema, breadcrumbSchema].filter(Boolean);
  const jsonLd = graph.length > 1 ? { "@context": "https://schema.org", "@graph": graph } : graph[0];
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />;
}

/**
 * Renders the post/chapter reader. `chapter === 0` is the intro page
 * (plain post content, or the pre-chapter-1 intro block when the post has
 * chapters). Ports the core structure of post.php's chapter-resolution
 * branch: intro-empty → redirect to chapter 1; invalid chapter number →
 * 404; otherwise render that chapter's slice of content.
 */
export async function PostReader({
  slug,
  chapter,
  preview = false,
}: {
  slug: string;
  chapter: number;
  preview?: boolean;
}) {
  const post = await getPostBySlug(slug, preview);
  if (!post) notFound();

  const pt = await getPostTemplateSettings();
  // Master "chapters" toggle — ports $_chapters_feature_on in post.php:
  // when off, every post is single-page even if its content has <h1>
  // boundaries (chapter routes 404 instead of resolving).
  const parsedRaw = parseChaptersFromContent(post.content);
  const parsed = pt.chapters ? parsedRaw : { hasChapters: false, introHtml: "", chapters: [], total: 0 };
  const { hasChapters, chapters, total: totalChapters } = parsed;

  let contentHtml: string;
  let chapterTitle: string | null = null;

  if (hasChapters) {
    if (chapter === 0) {
      const introPlain = stripTags(parsed.introHtml).replace(/[\s\u00A0]+/g, "");
      if (introPlain === "") {
        redirect(chapterUrl(slug, 1));
      }
      contentHtml = parsed.introHtml;
    } else {
      if (chapter < 1 || chapter > totalChapters) notFound();
      const ch = chapters[chapter - 1];
      contentHtml = ch.contentHtml;
      chapterTitle = ch.title;
    }
  } else {
    if (chapter > 0) notFound();
    contentHtml = post.content;
  }

  const readingMinutes = estimateReadingMinutes(stripTags(contentHtml));
  const pubDate = post.date
    ? new Date(post.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

  const relatedPosts = await getRelatedPosts(post.categoryId, post.id, 4);
  const siteConfig = await resolveSiteConfig("");

  // Real gap fixed here: this used to treat EVERY enabled block as if
  // its insertion type were always "after_paragraph", ignoring the
  // other 9 insertion-point choices (before_post/before_content/
  // after_content/after_post/before_comments/after_comments/footer)
  // and ignoring each block's own page-type targeting (`pages`)
  // entirely — a block explicitly configured for, say, "Homepage" only
  // would still render on every post page regardless. Now uses the
  // shared getAdHtmlFor()/getParagraphAdBlocks() helpers (see
  // lib/adRendering.ts) that respect both, matching each block's real
  // configured page + insertion-point combination.
  const [adBeforePost, adBeforeContent, adAfterContent, adAfterPost, adBeforeComments, adAfterComments, adBeforeFeaturedImage, adAfterFeaturedImage, adParagraphBlocks] =
    await Promise.all([
      getAdHtmlFor("post", "before_post"),
      getAdHtmlFor("post", "before_content"),
      getAdHtmlFor("post", "after_content"),
      getAdHtmlFor("post", "after_post"),
      getAdHtmlFor("post", "before_comments"),
      getAdHtmlFor("post", "after_comments"),
      getAdHtmlFor("post", "before_featured_image"),
      getAdHtmlFor("post", "after_featured_image"),
      getParagraphAdBlocks("post", "before_paragraph"),
    ]);
  const adAfterParagraphBlocks = await getParagraphAdBlocks("post", "after_paragraph");

  for (const { paragraph, html } of adParagraphBlocks) {
    contentHtml = injectBeforeParagraph(contentHtml, paragraph, html);
  }
  for (const { paragraph, html } of adAfterParagraphBlocks) {
    contentHtml = injectAfterParagraph(contentHtml, paragraph, html);
  }
  if (adBeforeContent) contentHtml = adBeforeContent + contentHtml;
  if (adAfterContent) contentHtml = contentHtml + adAfterContent;

  // "You may also like" — a compact inline block of related-post links
  // injected after paragraph N, matching _build_may_you_like_html() +
  // _inject_after_paragraph() in post.php.
  if (pt.may_you_like && relatedPosts.length > 0) {
    const mayLikePosts = relatedPosts.slice(0, pt.may_you_like_count);
    const mayLikeHtml = `<div class="pst-may-like"><strong>You may also like:</strong><ul>${mayLikePosts
      .map((rp) => `<li><a href="${postUrl(rp.slug)}">${rp.title}</a></li>`)
      .join("")}</ul></div>`;
    contentHtml = injectAfterParagraph(contentHtml, pt.may_you_like_after_paragraph, mayLikeHtml);
  }

  let faq: { q: string; a: string }[] = [];
  if (post.faqJson) {
    try {
      const parsedFaq = JSON.parse(post.faqJson);
      if (Array.isArray(parsedFaq)) faq = parsedFaq;
    } catch {
      // malformed faq_json — skip rendering rather than crash the page
    }
  }

  const postFullTitle = chapterTitle ? `${chapterTitle} — ${post.title}` : post.title;
  const fullPostUrl = `${siteConfig.siteUrl.replace(/\/+$/, "")}${chapter > 0 ? chapterUrl(slug, chapter) : postUrl(slug)}`;
  const showSidebar = pt.sidebar && (pt.sidebar_latest || pt.sidebar_trending);

  return (
    <>
      <PostJsonLd
        post={{
          title: post.title,
          date: post.date,
          updatedAt: post.updatedAt,
          authorName: post.authorName,
          bannerPath: post.bannerPath,
          bannerAlt: post.bannerAlt,
          metaDescription: post.metaDescription,
          fbDescription: post.fbDescription,
        }}
        siteConfig={siteConfig}
        canonicalPath={chapter > 0 ? chapterUrl(slug, chapter) : postUrl(slug)}
        faq={faq}
        chapterInfo={hasChapters && chapter > 0 && chapterTitle ? { postTitle: post.title, postUrl: postUrl(slug), chapterTitle, chapterNumber: chapter } : null}
      />
      <main className={`pst-layout${showSidebar ? " pst-layout--with-sidebar" : ""}`}>
    <div
      className="pst-wrap"
      style={
        {
          "--pt-title-size": `${pt.font_title}px`,
          "--pt-h2-size": `${pt.font_h2}px`,
          "--pt-h3-size": `${pt.font_h3}px`,
          "--pt-h4-size": `${pt.font_h4}px`,
          "--pt-h5-size": `${pt.font_h5}px`,
          "--pt-h6-size": `${pt.font_h6}px`,
          "--pt-p-size": `${pt.font_p}px`,
          "--pt-breadcrumb-size": `${pt.breadcrumb_font_size}px`,
        } as React.CSSProperties
      }
    >
      {/* Real bugs fixed here, verified against the actual post.php:
          1. The post-title link before "Chapter N of M" was missing
             entirely — only the small "Chapter N of M" text showed,
             with no way to click back to the post from a chapter page.
          2. The H1 below used to show `postFullTitle` (chapter title +
             " — " + post title combined) — that combined form is only
             ever used for the <title>/meta tags and ShareButtons in the
             reference, never as the visible on-page heading. The visible
             H1 on a chapter page is the chapter's OWN title alone. */}
      {pt.breadcrumb && hasChapters && chapter > 0 && (
        <nav className="pst-bc pst-bc-chapter-row" aria-label="Breadcrumb">
          <Link href={postUrl(slug)}>{post.title}</Link>{" "}
          <span className="pst-bc-sep">&middot;</span>{" "}
          <span className="pst-bc-chapter">
            Chapter {chapter} of {totalChapters}
          </span>
        </nav>
      )}
      {hasChapters && chapter > 0 && (
        <div className="chapter-progress-bar-container">
          <div className="chapter-progress-bar" style={{ width: `${(chapter / totalChapters) * 100}%` }} />
        </div>
      )}

      {adBeforePost && <AdminHtml html={adBeforePost} className="ad-slot ad-slot--before-post" allowFrame />}

      {/* Real gap fixed here: the reference shows a centered "date ·
          N CHAPTERS" hero line above the title on a chaptered post's
          intro page (chapter === 0), plus a "Read from start" button
          right below the title — both entirely missing previously. */}
      {hasChapters && chapter === 0 ? (
        <div className="pst-story-hero">
          <div className="pst-bc pst-story-hero-meta">
            <time dateTime={post.date ? new Date(post.date).toISOString().slice(0, 10) : undefined}>{pubDate.toUpperCase()}</time>
            <span className="pst-story-hero-dot" aria-hidden="true">
              &middot;
            </span>
            <span>
              {totalChapters} CHAPTER{totalChapters !== 1 ? "S" : ""}
            </span>
          </div>
          <h1 className="pst-title pst-story-hero-title">
            {post.title}
          </h1>
        </div>
      ) : (
        <h1 className="pst-title">
          {hasChapters && chapter > 0 ? chapterTitle : postFullTitle}
        </h1>
      )}

      {/* Real gap fixed here: this project had one banner-display path
          for chapter pages (Phase 57), but completely missed this
          SEPARATE one — the reference has a dedicated intro-page banner,
          controlled by its own "intro_thumbnail" toggle, shown ONLY on
          chapter===0 when that setting is on: `$show_intro_banner =
          $chapter === 0 && $banner_src && !empty($_pt['intro_thumbnail'])`.
          This is why enabling "Show banner image on intro page" in Post
          Template Settings had no visible effect at all — this code path
          simply didn't exist yet, regardless of the toggle's value. */}
      {hasChapters && chapter === 0 && pt.intro_thumbnail && post.bannerPath && (
        <>
          {adBeforeFeaturedImage && <AdminHtml html={adBeforeFeaturedImage} className="ad-slot ad-slot--before-featured-image" allowFrame />}
          <div className="pst-featured-img-wrap pst-intro-featured-img-wrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolveMediaUrl(post.bannerPath)}
              alt={post.bannerAlt ?? post.title}
              className="pst-featured-img pst-intro-featured-img"
              width={800}
              height={450}
              fetchPriority="high"
            />
          </div>
          {adAfterFeaturedImage && <AdminHtml html={adAfterFeaturedImage} className="ad-slot ad-slot--after-featured-image" allowFrame />}
        </>
      )}

      {hasChapters && chapter === 0 && (
        <div className="pst-read-from-start-wrap">
          <Link href={chapterUrl(slug, 1)} className="read-from-start-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
            </svg>
            Read from start
          </Link>
        </div>
      )}
      {/* Real bug fixed here — the actual root cause of the mobile
          Chapters button not showing, found by a session with a
          different AI tool (Manus AI) working directly on the live
          site: ChapterListDrawer used to be nested INSIDE this
          `pt.post_meta &&` block. If the "Post Meta" toggle in Post
          Template Settings was off, the ENTIRE block — including the
          chapter button, which has nothing to do with post meta at all
          — never rendered, full stop. All the CSS/JS positioning work
          in earlier phases was investigating a symptom that couldn't
          actually be the cause here: the component wasn't in the DOM
          to begin with. Moved to render unconditionally on
          `hasChapters`, independent of the post_meta toggle. */}
      {pt.post_meta && (
        <div className="pst-meta">
          {post.authorSlug && <Link href={authorUrl(post.authorSlug)}>{post.authorName}</Link>}
          <span>{pubDate}</span>
          <span>{readingMinutes} min read</span>
          <Link href={categoryUrl(post.categorySlug)}>{post.categoryName}</Link>
        </div>
      )}
      {hasChapters && <ChapterListDrawer slug={slug} chapters={chapters} currentChapter={chapter} />}

      {/* Real bug fixed here: this condition was backwards — it only
          showed the featured image on the INTRO page (chapter === 0)
          and skipped it on every actual chapter, when the reference
          does the exact opposite: `$skip_inline_banner = ($has_chapters
          && $chapter === 0)`, i.e. skip ONLY on the intro page, and
          show it prepended to the content on every real chapter (and
          on non-chaptered single-page posts, which never skip at all).
          Matches the reference's .pst-img-wrap class (with its shimmer/
          loading-placeholder styling) instead of the unrelated
          .pst-banner class used here before. */}
      {post.bannerPath && !(hasChapters && chapter === 0) && (
        <>
          {adBeforeFeaturedImage && <AdminHtml html={adBeforeFeaturedImage} className="ad-slot ad-slot--before-featured-image" allowFrame />}
          <div className="pst-img-wrap loaded">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resolveMediaUrl(post.bannerPath)} alt={post.bannerAlt ?? post.title} width={800} height={450} fetchPriority="high" decoding="async" />
          </div>
          {adAfterFeaturedImage && <AdminHtml html={adAfterFeaturedImage} className="ad-slot ad-slot--after-featured-image" allowFrame />}
        </>
      )}

      {/* Author-authored HTML from the post editor — same trust model as
          the original PHP, which echoed post content directly. Also
          carries any in-content Ad Inserter blocks injected via
          injectAfterParagraph()/injectBeforeParagraph() above (before/
          after paragraph N, before/after content) — AdminHtml (not
          allowFrame, matching Global Header/Footer/Code Snippets) makes
          any <script> tags in either the post body or an injected ad
          block actually execute. */}
      <AdminHtml html={contentHtml} className="entry-content" />

      {hasChapters && chapter === 0 && pt.read_from_start && <ChapterStartNav slug={slug} chapters={chapters} />}
      {hasChapters && chapter > 0 && (
        <ChapterNav slug={slug} postTitle={post.title} chapters={chapters} chapter={chapter} />
      )}

      {faq.length > 0 && (
        <div className="pst-faq">
          <h2 className="pst-faq-h">Frequently Asked Questions</h2>
          {faq.map((item, i) => (
            <div className="pst-faq-item" key={i}>
              <div className="pst-faq-q">{item.q}</div>
              <div className="pst-faq-a">{item.a}</div>
            </div>
          ))}
        </div>
      )}

      {pt.related_posts && relatedPosts.length > 0 && (
        <div>
          <h2 className="section-heading">You may also like</h2>
          <div className="post-grid">
            {relatedPosts.map((rp) => (
              <article className="post-card" key={rp.id}>
                <Link href={postUrl(rp.slug)} className="post-card-link">
                  {rp.bannerPath && (
                    <div className="post-banner">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={resolveMediaUrl(rp.bannerPath)} alt={rp.title} loading="lazy" />
                    </div>
                  )}
                  <div className="post-card-content">
                    <h3 className="post-card-title">{rp.title}</h3>
                  </div>
                </Link>
              </article>
            ))}
          </div>
        </div>
      )}

      {pt.author_box && post.authorBio && (
        <div className="author-bio">
          {post.authorProfileImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={resolveMediaUrl(post.authorProfileImage)} alt={post.authorName} width={64} height={64} />
          )}
          <div>
            <strong>{post.authorName}</strong>
            <p>{post.authorBio}</p>
          </div>
        </div>
      )}

      {adAfterPost && <AdminHtml html={adAfterPost} className="ad-slot ad-slot--after-post" allowFrame />}

      {/* Share buttons moved here, per explicit request: they used to sit
          directly after the content, ABOVE the previous/next chapter
          navigation — which pushed the chapter buttons (the thing a
          reader mid-story actually wants next) further down the page.
          The reference puts them just above the comments box instead,
          which is also where they read as "you finished, now react to
          it" rather than interrupting the read. */}
      {pt.share_buttons && <ShareButtons url={fullPostUrl} title={postFullTitle} />}

      {adBeforeComments && <AdminHtml html={adBeforeComments} className="ad-slot ad-slot--before-comments" allowFrame />}
      {pt.comments_section && <CommentsSection postId={post.id} />}
      {adAfterComments && <AdminHtml html={adAfterComments} className="ad-slot ad-slot--after-comments" allowFrame />}

      {/* Real bug fixed here: this only ever rendered for posts WITH
          detected chapters (hasChapters) — a plain single-page post
          (no H1 chapter structure) never got a tracker at all, so its
          views were never counted anywhere. Single-page posts now track
          as "chapter 1" (the whole page counts as one unit for stats
          purposes) — matching the track-view route's own updated
          handling of hasChapters=false posts. */}
      {!preview && <ChapterViewTracker postId={post.id} slug={slug} chapterNumber={hasChapters ? chapter : 1} />}
      {preview && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, background: "#7c3aed", color: "#fff", textAlign: "center", padding: "8px", fontSize: "14px", fontWeight: 600, zIndex: 9999 }}>
          Preview mode — this {post.date ? "post" : "content"} is not live yet
        </div>
      )}
    </div>
    {showSidebar && (
      <PostSidebar pt={pt} excludePostId={post.id}>
        {hasChapters && <DesktopTocSidebar slug={slug} title={post.title} chapters={chapters} currentChapter={chapter} />}
      </PostSidebar>
    )}
    </main>
    </>
  );
}
