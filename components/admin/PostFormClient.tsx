"use client";

import { useState } from "react";
import { RichTextEditor } from "./RichTextEditor";
import { CopyLinksPanel } from "./CopyLinksPanel";
import { FeaturedImageBox } from "./FeaturedImageBox";
import { AiGenerateModal, type AiGenerateResult } from "./AiGenerateModal";
import { useAdminDialogs } from "./AdminDialogProvider";

interface Category {
  id: number;
  name: string;
}
interface StateOption {
  id: number;
  stateName: string;
}
interface AuthorOption {
  id: number;
  name: string;
}

/** Mirrors lib/postEditor.ts's server-side slugify() exactly — kept as a
 *  pure, dependency-free duplicate here so the slug field can update
 *  LIVE as the title is typed (matching the newbase reference's actual
 *  behavior), without needing a round-trip to the server on every
 *  keystroke. The server-side version remains the source of truth at
 *  submit time (handles uniqueness-suffixing, which this client-side
 *  preview intentionally doesn't need to). */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Live H1 count for the "chapters detected" badge — matches the
 *  reference's actual behavior (counting, not a static message). Uses
 *  the browser's built-in DOMParser rather than the server-side
 *  node-html-parser-based lib/chapters.ts (that one also handles the
 *  "div wrapping a single h1" edge case for the real public-facing
 *  chapter split; a plain H1-tag count is the right amount of precision
 *  for a live editor counter). */
function countH1Chapters(html: string): number {
  if (typeof window === "undefined" || !html) return 0;
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.querySelectorAll("h1").length;
  } catch {
    return 0;
  }
}

/**
 * Real gap fixed here: AI Generate used to be a plain `<Link
 * href="/admin/ai-features">` — a dead-end link to a completely
 * different page, doing nothing on this form at all — even though the
 * backend (/api/ai/generate) already existed and did everything needed.
 * This client wrapper owns the state every AI-populable field needs
 * (title, content, meta description, FB description, thumbnail prompt,
 * featured image) so a single successful generation can fill in the
 * whole form at once, exactly like the actual reference site.
 */
export function PostFormClient({
  post,
  categories,
  states,
  authors,
  canAssignAuthor,
  authorLabel,
  fullPostUrl,
  fbCommentEnabled,
  fbCommentText,
  isNew,
}: {
  post?: {
    id: number;
    title: string;
    slug: string;
    content: string;
    excerpt: string | null;
    categoryId: number;
    additionalCategoryIds: number[];
    stateId: number | null;
    authorId: number;
    status: string;
    faqJson: string | null;
    tags: string[];
    featuredImagePath?: string | null;
    featuredImageId?: number | null;
    metaDescription: string;
    metaKeywords: string;
    fbDescription: string;
    thumbnailPrompt: string;
  };
  categories: Category[];
  states: StateOption[];
  authors: AuthorOption[];
  canAssignAuthor: boolean;
  authorLabel: string;
  fullPostUrl: string;
  fbCommentEnabled: boolean;
  fbCommentText: string;
  isNew: boolean;
}) {
  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(post?.slug));
  const [content, setContent] = useState(post?.content ?? "");
  const [contentKey, setContentKey] = useState(0); // bumped to force RichTextEditor to remount with new AI content
  const [liveContent, setLiveContent] = useState(post?.content ?? "");
  const [metaDescription, setMetaDescription] = useState(post?.metaDescription ?? "");
  const [metaKeywords, setMetaKeywords] = useState(post?.metaKeywords ?? "");
  const [fbDescription, setFbDescription] = useState(post?.fbDescription ?? "");
  const [thumbnailPrompt, setThumbnailPrompt] = useState(post?.thumbnailPrompt ?? "");
  const [aiThumbnail, setAiThumbnail] = useState<{ url: string; mediaId: number } | null>(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const { notice } = useAdminDialogs();
  const [savingThumbnail, setSavingThumbnail] = useState(false);

  async function handleGenerated(result: AiGenerateResult) {
    setTitle(result.title);
    if (!slugTouched) setSlug(slugify(result.title));
    setContent(result.content);
    setContentKey((k) => k + 1);
    setMetaDescription(result.metaDescription);
    setMetaKeywords(result.metaKeywords);
    setFbDescription(result.fbDescription);
    setThumbnailPrompt(result.thumbnailPrompt);

    // Matches the real ai-generate.php's soft guideline check — surfaces
    // it as a warning dialog rather than silently ignoring it, so the
    // admin knows to review a short/under-length generation before
    // publishing (never blocks using the generated content either way).
    if (result.guidelineWarning) {
      notice(result.guidelineWarning, { type: "info" });
    }

    if (result.thumbnailBase64) {
      setSavingThumbnail(true);
      try {
        const res = await fetch("/api/ai/save-generated-thumbnail", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: result.thumbnailBase64, title: result.title }),
        });
        const data = await res.json();
        if (data.success) {
          setAiThumbnail({ url: data.imageUrl, mediaId: data.mediaId });
        }
      } catch {
        // Non-fatal — the article text still generated fine; the admin
        // can use "Regenerate Thumbnail" manually if this quick save
        // step failed.
      } finally {
        setSavingThumbnail(false);
      }
    }
  }

  return (
    <div className="editor-layout">
      <div className="editor-main">
        {/* Title / permalink / chapter badge / AI generate */}
        <div className="meta-panel">
          <div className="meta-panel-body" style={{ gap: "0.5rem" }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "2px" }}>
              <button type="button" className="btn-ai-generate" title="Generate a full story from a video shot-list" onClick={() => setAiModalOpen(true)}>
                <i className="fas fa-wand-magic-sparkles" /> AI Generate
              </button>
            </div>
            <input
              type="text"
              name="title"
              id="title"
              className="post-title-input"
              value={title}
              onChange={(e) => {
                const newTitle = e.target.value;
                setTitle(newTitle);
                // Real gap fixed here: the slug used to only get derived
                // from the title on the SERVER at submit time — the
                // reference auto-fills the slug field LIVE as the title
                // is typed, while still letting the admin override it
                // manually (tracked via slugTouched — once they type
                // directly into the slug field, this stops overwriting
                // it).
                if (!slugTouched) setSlug(slugify(newTitle));
              }}
              placeholder="Add title"
              autoComplete="off"
              required
            />
            <div className="permalink-row">
              <strong>Permalink:</strong>
              <input
                type="text"
                name="slug"
                id="slug-input"
                className="permalink-input"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugTouched(true);
                }}
                placeholder="post-url-slug"
                maxLength={120}
              />
            </div>
            <div style={{ marginTop: "0.35rem" }}>
              <div className="chapter-badge-row">
                <div className="badge-grey">
                  {(() => {
                    const chapterCount = countH1Chapters(liveContent);
                    return chapterCount > 0
                      ? `${chapterCount} chapter${chapterCount === 1 ? "" : "s"} detected from H1 headings`
                      : "No chapters detected — will publish as a single page";
                  })()}
                </div>
              </div>
            </div>
            {!isNew && (
              <div style={{ marginTop: "0.35rem", fontSize: "0.8rem" }}>
                <CopyLinksPanel
                  postUrl={fullPostUrl}
                  isPublished={post?.status === "published"}
                  fbCommentEnabled={fbCommentEnabled}
                  fbCommentText={fbCommentText}
                  fbDescription={fbDescription}
                  onFbDescriptionChange={setFbDescription}
                  thumbnailPrompt={thumbnailPrompt}
                  onThumbnailPromptChange={setThumbnailPrompt}
                />
              </div>
            )}
          </div>
        </div>

        {/* Content editor */}
        <div className="meta-panel">
          <div className="meta-panel-body" style={{ padding: 0, gap: 0 }}>
            <RichTextEditor key={contentKey} name="content" defaultValue={content} minHeight={420} onContentChange={setLiveContent} />
          </div>
        </div>

        {/* SEO & Meta — real bug fixed here: Meta Keywords / Facebook
            Description / Thumbnail Prompt used to also live here as
            large always-visible textareas. The actual reference only
            keeps Meta Description in this panel; the other three are
            either AI-only internal data (Meta Keywords — still
            submitted via a hidden input, just not surfaced as its own
            field the reference doesn't show either) or the compact
            reveal+copy chips in the action row above (FB Description /
            Thumbnail Prompt). */}
        <div className="meta-panel">
          <div className="meta-panel-header">
            <span>SEO &amp; Meta</span>
            <i className="fas fa-chevron-down toggle-icon" />
          </div>
          <div className="meta-panel-body">
            <div>
              <label htmlFor="metaDescription">
                Meta Description <span className="req-star">*</span>
              </label>
              <textarea
                id="metaDescription"
                name="metaDescription"
                placeholder="Brief description for search engines (150–160 characters recommended)"
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        </div>

        <div className="meta-panel">
          <div className="meta-panel-header">
            <span>Excerpt</span>
            <i className="fas fa-chevron-down toggle-icon" />
          </div>
          <div className="meta-panel-body">
            <textarea name="excerpt" defaultValue={post?.excerpt ?? ""} rows={2} placeholder="Optional short summary" />
          </div>
        </div>

        <div className="meta-panel">
          <div className="meta-panel-header">
            <span>FAQ (JSON)</span>
            <i className="fas fa-chevron-down toggle-icon" />
          </div>
          <div className="meta-panel-body">
            <span className="field-hint" style={{ marginBottom: "0.35rem" }}>
              Format: [&#123;&quot;q&quot;:&quot;...&quot;, &quot;a&quot;:&quot;...&quot;&#125;]
            </span>
            <textarea name="faqJson" defaultValue={post?.faqJson ?? ""} rows={4} />
          </div>
        </div>

        {/* Meta Keywords is AI-populated but not shown as its own field
            in the reference — still submitted so the value survives a
            save/AI-generate round trip. */}
        <input type="hidden" name="metaKeywords" value={metaKeywords} />
      </div>

      <div className="editor-sidebar-panel">
        {/* Publish box */}
        <div className="meta-panel" id="publish-box">
          <div className="meta-panel-header">
            <span>Publish</span>
            <i className="fas fa-chevron-down toggle-icon" />
          </div>
          <div className="meta-panel-body">
            <div className="wp-pub-row">
              <i className="fas fa-check-circle wp-pub-icon" />
              <span>
                Status:{" "}
                <select name="status" id="status" defaultValue={post?.status ?? "draft"} style={{ display: "inline-block", width: "auto" }}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </span>
            </div>

            {canAssignAuthor && (
              <div className="wp-pub-row">
                <i className="fas fa-user wp-pub-icon" />
                <span>Author:</span>
                <select name="authorId" id="authorId" defaultValue={post?.authorId ?? authors[0]?.id} style={{ display: "inline-block", width: "auto", marginLeft: "auto" }}>
                  {authors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {!canAssignAuthor && authorLabel && (
              <div className="wp-pub-row">
                <i className="fas fa-user wp-pub-icon" />
                <span>
                  Author: <strong>{authorLabel}</strong>
                </span>
              </div>
            )}

            <div className="publish-actions">
              <button type="submit" className="btn btn-primary" style={{ width: "100%", borderRadius: 4 }}>
                <span className="btn-icon-svg">
                  <i className="fas fa-upload" />
                </span>
                <span>{isNew ? "Publish Post" : "Save Changes"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Featured Image box */}
        <div className="meta-panel">
          <div className="meta-panel-header">
            <span>Featured Image</span>
            <i className="fas fa-chevron-down toggle-icon" />
          </div>
          <div className="meta-panel-body" id="feat-img-box">
            <FeaturedImageBox
              name="featuredImageUrl"
              mediaIdFieldName="featuredImageId"
              defaultValue={post?.featuredImagePath ?? ""}
              title={title}
              thumbnailPrompt={thumbnailPrompt}
              externalValue={aiThumbnail}
            />
            {savingThumbnail && <span style={{ fontSize: "0.8rem", color: "var(--gray-500)" }}>Saving AI thumbnail…</span>}
          </div>
        </div>

        {/* Categories box */}
        <div className="meta-panel">
          <div className="meta-panel-header">
            <span>Categories</span>
            <i className="fas fa-chevron-down toggle-icon" />
          </div>
          <div className="meta-panel-body">
            <div>
              <label htmlFor="categoryId">
                Main Category <span className="req-star">*</span>
              </label>
              <select name="categoryId" id="categoryId" defaultValue={post?.categoryId} required>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="additionalCategoryIds">
                Additional Categories <span className="field-hint" style={{ display: "inline" }}>— optional</span>
              </label>
              <select id="additionalCategoryIds" name="additionalCategoryIds" multiple size={4} defaultValue={post?.additionalCategoryIds.map(String)}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="stateId">
                State <span className="field-hint" style={{ display: "inline" }}>— optional</span>
              </label>
              <select id="stateId" name="stateId" defaultValue={post?.stateId ?? ""}>
                <option value="">— None —</option>
                {states.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.stateName}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Tags box */}
        <div className="meta-panel">
          <div className="meta-panel-header">
            <span>Tags</span>
            <i className="fas fa-chevron-down toggle-icon" />
          </div>
          <div className="meta-panel-body">
            <div>
              <input id="tags" name="tags" type="text" defaultValue={post?.tags.join(", ")} placeholder="tag1, tag2, tag3" />
              <span className="field-hint">Separate with commas.</span>
            </div>
          </div>
        </div>
      </div>

      <AiGenerateModal open={aiModalOpen} onClose={() => setAiModalOpen(false)} onGenerated={handleGenerated} />
    </div>
  );
}
