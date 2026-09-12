import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getPostBySlug, getRelatedPosts, estimateReadingMinutes, stripTags } from "@/lib/postDetail";
import { parseChaptersFromContent } from "@/lib/chapters";
import { postUrl, chapterUrl, authorUrl, categoryUrl, resolveMediaUrl } from "@/lib/urls";
import { resolveSiteConfig } from "@/lib/config";
import { getPostTemplateSettings } from "@/lib/postTemplateSettings";
import { getAdInserterConfig } from "@/lib/adInserterSettings";
import { ChapterNav, ChapterStartNav } from "./ChapterNav";
import { ChapterListDrawer } from "./ChapterListDrawer";
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

export async function buildPostMetadata(slug: string, chapter: number): Promise<Metadata> {
  const post = await getPostBySlug(slug);
  if (!post) return {};
  const siteConfig = await resolveSiteConfig("");
  const pt = await getPostTemplateSettings();
  const parsed = pt.chapters
    ? parseChaptersFromContent(post.content)
    : { hasChapters: false, introHtml: "", chapters: [], total: 0 };

  if (parsed.hasChapters && chapter > 0) {
    const ch = parsed.chapters[chapter - 1];
    if (!ch) return {};
    return {
      title: `${ch.title} — ${post.title} | ${siteConfig.siteName}`,
      description: stripTags(ch.contentHtml).slice(0, 160),
    };
  }

  const description =
    post.metaDescription?.trim() ||
    stripTags(parsed.hasChapters ? parsed.introHtml : post.content).slice(0, 160);

  return {
    title: `${post.title} | ${siteConfig.siteName}`,
    description,
    keywords: post.metaKeywords?.trim() || undefined,
    openGraph: {
      description: post.fbDescription?.trim() || description,
      images: post.bannerPath ? [`/${post.bannerPath.replace(/^\/+/, "")}`] : undefined,
    },
  };
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
  const ads = await getAdInserterConfig();
  const siteConfig = await resolveSiteConfig("");

  // In-content ad blocks — each enabled block gets inserted after its
  // configured paragraph number, same mechanism as "you may also like"
  // (ports the 'insertion'/'paragraph' fields from admin/ad-inserter.php's
  // per-block config, applied to every post page — the original also
  // supports per-page-type targeting via a 'pages' array, not carried over
  // here since this port only targets the post reader).
  for (const block of ads.blocks) {
    if (!block.enabled || !block.code.trim()) continue;
    const adHtml = `<div class="ad-slot ad-slot--in-content" data-block="${block.id}">${block.code}</div>`;
    contentHtml = injectAfterParagraph(contentHtml, block.insertAfterParagraph, adHtml);
  }

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
    <main className={`pst-layout${showSidebar ? " pst-layout--with-sidebar" : ""}`}>
    <div
      className="pst-wrap"
      style={{ "--pt-p-size": `${pt.font_p}px`, "--pt-h2-size": `${pt.font_h2}px` } as React.CSSProperties}
    >
      {pt.breadcrumb && hasChapters && chapter > 0 && (
        <div>
          <span className="pst-bc-chapter">
            Chapter {chapter} of {totalChapters}
          </span>
          <div className="chapter-progress-track">
            <div className="chapter-progress-bar" style={{ width: `${(chapter / totalChapters) * 100}%` }} />
          </div>
        </div>
      )}

      <h1 className="pst-title" style={{ fontSize: pt.font_title }}>
        {postFullTitle}
      </h1>
      {pt.post_meta && (
        <div className="pst-meta">
          {post.authorSlug && <Link href={authorUrl(post.authorSlug)}>{post.authorName}</Link>}
          <span>{pubDate}</span>
          <span>{readingMinutes} min read</span>
          <Link href={categoryUrl(post.categorySlug)}>{post.categoryName}</Link>
          {hasChapters && <ChapterListDrawer slug={slug} chapters={chapters} currentChapter={chapter} />}
        </div>
      )}

      {pt.whatsapp_banner && (
        <div className="pst-whatsapp-banner">
          {/* Real production bug fix: this was previously an <a href="#">
              with an onClick={preventDefault} handler on a SERVER
              component (PostReader has no "use client") — Next.js
              rejects passing event-handler functions as props from a
              server component to a plain DOM element at runtime
              ("Event handlers cannot be passed to Client Component
              props"), which crashed every single post page with a 500.
              This is purely a decorative label (no real destination
              configured yet), so a non-interactive <span> is both the
              fix and the more honest element for it. */}
          <span>📱 Join our WhatsApp channel for daily updates</span>
        </div>
      )}

      {post.bannerPath && chapter === 0 && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="pst-banner" src={resolveMediaUrl(post.bannerPath)} alt={post.bannerAlt ?? post.title} width={800} height={450} />
      )}

      {/* Author-authored HTML from the post editor — same trust model as
          the original PHP, which echoed post content directly. */}
      <div className="entry-content" dangerouslySetInnerHTML={{ __html: contentHtml }} />

      {pt.share_buttons && <ShareButtons url={fullPostUrl} title={postFullTitle} />}

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
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      className="post-banner"
                      src={resolveMediaUrl(rp.bannerPath)}
                      alt={rp.title}
                      loading="lazy"
                    />
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

      {pt.comments_section && <CommentsSection postId={post.id} />}

      {!preview && hasChapters && <ChapterViewTracker postId={post.id} slug={slug} chapterNumber={chapter} />}
      {preview && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, background: "#7c3aed", color: "#fff", textAlign: "center", padding: "8px", fontSize: "14px", fontWeight: 600, zIndex: 9999 }}>
          Preview mode — this {post.date ? "post" : "content"} is not live yet
        </div>
      )}
    </div>
    {showSidebar && <PostSidebar pt={pt} excludePostId={post.id} />}
    </main>
  );
}
