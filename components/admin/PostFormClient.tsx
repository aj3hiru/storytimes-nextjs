"use client";

import { useRef, useState } from "react";
import { RichTextEditor } from "./RichTextEditor";
import { CopyLinksPanel } from "./CopyLinksPanel";
import { FeaturedImageBox } from "./FeaturedImageBox";
import { AiGenerateModal, type AiGenerateResult } from "./AiGenerateModal";
import { FaqModal, type FaqItem } from "./FaqModal";
import { useAdminDialogs } from "./AdminDialogProvider";

interface Category {
  id: number;
  name: string;
}
interface AuthorOption {
  id: number;
  name: string;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function countH1Chapters(html: string): number {
  if (typeof window === "undefined" || !html) return 0;
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    return doc.querySelectorAll("h1").length;
  } catch {
    return 0;
  }
}

function parseFaqJson(json: string | null): FaqItem[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.filter((f) => f && typeof f.q === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Real bugs fixed here, all found by comparing directly against the
 * actual post-manager.php (both its screenshots and view-source):
 * - Categories only ever had ONE field in the reference (Main Category)
 *   — "Additional Categories" and "State" were invented here and don't
 *   exist in the original at all.
 * - "Excerpt" doesn't exist in the reference either — removed.
 * - FAQs are a row-by-row "Manage FAQs" modal (see FaqModal.tsx), not a
 *   raw "FAQ (JSON)" textarea — and the modal lives right after Tags,
 *   matching the reference's panel order exactly.
 * - The Copy-links row (Copy Post URL/Chapter 1/FB Comment/FB
 *   Description/Thumbnail Prompt) used to be hidden entirely for a new,
 *   unsaved post — the reference always shows all five, just inert
 *   (low opacity) until the post has a real saved URL.
 * - The Publish box was a plain Status/Author dropdown pair — the
 *   reference has Save Draft/Preview buttons up top, then Status and
 *   Author as read-only rows with an inline "Edit" link that reveals a
 *   dropdown + OK/Cancel, matching WordPress's own publish-box pattern.
 */
export function PostFormClient({
  action,
  post,
  categories,
  authors,
  canAssignAuthor,
  authorLabel,
  fullPostUrl,
  fbCommentEnabled,
  fbCommentText,
  isNew,
}: {
  action: (formData: FormData) => void | Promise<void>;
  post?: {
    id: number;
    title: string;
    slug: string;
    content: string;
    categoryId: number;
    authorId: number;
    status: string;
    faqJson: string | null;
    tags: string[];
    featuredImagePath?: string | null;
    metaDescription: string;
    metaKeywords: string;
    fbDescription: string;
    thumbnailPrompt: string;
  };
  categories: Category[];
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
  const [contentKey, setContentKey] = useState(0);
  const [liveContent, setLiveContent] = useState(post?.content ?? "");
  const [metaDescription, setMetaDescription] = useState(post?.metaDescription ?? "");
  const [metaKeywords, setMetaKeywords] = useState(post?.metaKeywords ?? "");
  const [fbDescription, setFbDescription] = useState(post?.fbDescription ?? "");
  const [thumbnailPrompt, setThumbnailPrompt] = useState(post?.thumbnailPrompt ?? "");
  const [aiThumbnail, setAiThumbnail] = useState<{ url: string; mediaId: number } | null>(null);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [savingThumbnail, setSavingThumbnail] = useState(false);
  const [status, setStatus] = useState(post?.status ?? "draft");
  const [statusEditing, setStatusEditing] = useState(false);
  const [authorId, setAuthorId] = useState(post?.authorId ?? authors[0]?.id);
  const [authorEditing, setAuthorEditing] = useState(false);
  const [faqOpen, setFaqOpen] = useState(false);
  const [faqItems, setFaqItems] = useState<FaqItem[]>(parseFaqJson(post?.faqJson ?? null));
  const formRef = useRef<HTMLFormElement>(null);
  const { notice } = useAdminDialogs();

  const statusLabels: Record<string, string> = { draft: "Draft", published: "Published", scheduled: "Scheduled", archived: "Archived" };
  const authorName = authors.find((a) => a.id === authorId)?.name ?? authorLabel;
  const previewUrl = post ? fullPostUrl : "";

  async function handleGenerated(result: AiGenerateResult) {
    setTitle(result.title);
    if (!slugTouched) setSlug(slugify(result.title));
    setContent(result.content);
    setContentKey((k) => k + 1);
    setMetaDescription(result.metaDescription);
    setMetaKeywords(result.metaKeywords);
    setFbDescription(result.fbDescription);
    setThumbnailPrompt(result.thumbnailPrompt);

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
        // Non-fatal — the article text still generated fine.
      } finally {
        setSavingThumbnail(false);
      }
    }
  }

  function handleSaveDraft() {
    setStatus("draft");
    // Wait a tick for the controlled <select>'s value to actually update
    // before submitting, matching the reference's own draft-then-submit
    // sequencing (it sets the value, then synchronously clicks submit).
    requestAnimationFrame(() => formRef.current?.requestSubmit());
  }

  function handlePreview() {
    if (previewUrl) window.open(previewUrl, "_blank");
  }

  const chapterCount = countH1Chapters(liveContent);

  return (
    <form ref={formRef} action={action}>
      <input type="hidden" name="editId" value={post?.id ?? 0} />
      <div className="editor-layout">
      <div className="editor-main">
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
                  {chapterCount > 0
                    ? `${chapterCount} chapter${chapterCount === 1 ? "" : "s"} detected from H1 headings`
                    : "No chapters detected — will publish as a single page"}
                </div>
              </div>
            </div>
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
          </div>
        </div>

        <div className="meta-panel">
          <div className="meta-panel-body" style={{ padding: 0, gap: 0 }}>
            <RichTextEditor key={contentKey} name="content" defaultValue={content} minHeight={420} onContentChange={setLiveContent} />
          </div>
        </div>

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

        <input type="hidden" name="metaKeywords" value={metaKeywords} />
      </div>

      <div className="editor-sidebar-panel">
        <div className="meta-panel" id="publish-box">
          <div className="meta-panel-header">
            <span>Publish</span>
            <i className="fas fa-chevron-down toggle-icon" />
          </div>
          <div className="meta-panel-body">
            <div className="wp-pub-btn-row">
              <button type="button" className="wp-outline-btn" onClick={handleSaveDraft}>
                Save Draft
              </button>
              <button type="button" className={`wp-outline-btn${!previewUrl ? " is-disabled" : ""}`} onClick={handlePreview}>
                Preview
              </button>
            </div>

            <div className="wp-pub-row">
              <i className="fas fa-toggle-on wp-pub-icon" />
              <span>
                Status: <strong>{statusLabels[status]}</strong>
              </span>
              <a href="#" className="wp-pub-editlink" onClick={(e) => { e.preventDefault(); setStatusEditing((v) => !v); }}>
                Edit
              </a>
            </div>
            <div className={`wp-pub-editbox${statusEditing ? " open" : ""}`}>
              <select name="status" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="draft">Draft</option>
                <option value="published">Published</option>
                <option value="scheduled">Scheduled</option>
                <option value="archived">Archived</option>
              </select>
              <div className="wp-pub-editactions">
                <button type="button" className="wp-pub-ok" onClick={() => setStatusEditing(false)}>
                  OK
                </button>
                <button type="button" className="wp-pub-cancel" onClick={() => setStatusEditing(false)}>
                  Cancel
                </button>
              </div>
            </div>
            {/* Hidden select mirrors the visible one above when the editbox is
                closed, so `name="status"` always submits with the form
                regardless of whether the edit box happens to be open. */}
            {!statusEditing && <input type="hidden" name="status" value={status} />}

            {canAssignAuthor ? (
              <>
                <div className="wp-pub-row">
                  <i className="fas fa-user wp-pub-icon" />
                  <span>
                    Author: <strong>{authorName}</strong>
                  </span>
                  <a href="#" className="wp-pub-editlink" onClick={(e) => { e.preventDefault(); setAuthorEditing((v) => !v); }}>
                    Edit
                  </a>
                </div>
                <div className={`wp-pub-editbox${authorEditing ? " open" : ""}`}>
                  <select name="authorId" value={authorId} onChange={(e) => setAuthorId(Number(e.target.value))}>
                    {authors.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  <div className="wp-pub-editactions">
                    <button type="button" className="wp-pub-ok" onClick={() => setAuthorEditing(false)}>
                      OK
                    </button>
                    <button type="button" className="wp-pub-cancel" onClick={() => setAuthorEditing(false)}>
                      Cancel
                    </button>
                  </div>
                </div>
                {!authorEditing && <input type="hidden" name="authorId" value={authorId} />}
              </>
            ) : (
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
                <span>{isNew ? "Publish Post" : "Update Post"}</span>
              </button>
            </div>
          </div>
        </div>

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
          </div>
        </div>

        <div className="meta-panel">
          <div className="meta-panel-header">
            <span>Tags</span>
            <i className="fas fa-chevron-down toggle-icon" />
          </div>
          <div className="meta-panel-body">
            <div>
              <input id="tags" name="tags" type="text" defaultValue={post?.tags.join(", ")} placeholder="tag1, tag2, tag3" />
              <span className="field-hint">Separate with commas or press Enter to create a new tag.</span>
            </div>
          </div>
        </div>

        <div className="meta-panel">
          <div className="meta-panel-header">
            <span>Post FAQs</span>
            <i className="fas fa-chevron-down toggle-icon" />
          </div>
          <div className="meta-panel-body">
            <div>
              <p style={{ fontSize: "0.75rem", color: "var(--gray-500)", margin: "0 0 0.5rem" }}>Add FAQs to enhance SEO schema markup.</p>
              <button type="button" className="btn btn-secondary" style={{ width: "100%" }} onClick={() => setFaqOpen(true)}>
                <i className="fas fa-circle-question" /> Manage FAQs
              </button>
              {faqItems.length > 0 ? (
                <div style={{ marginTop: "0.4rem" }}>
                  {faqItems.map((f, i) => (
                    <div className="faq-prev-item" key={i}>
                      <strong>
                        <span className="faq-prev-q-num">{i + 1}.</span>
                        {f.q}
                      </strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: "11px", color: "var(--gray-400)", fontStyle: "italic", margin: "6px 0 0" }}>No FAQs added.</p>
              )}
              <input type="hidden" name="faqJson" value={faqItems.length > 0 ? JSON.stringify(faqItems) : ""} />
            </div>
          </div>
        </div>
      </div>

      <AiGenerateModal open={aiModalOpen} onClose={() => setAiModalOpen(false)} onGenerated={handleGenerated} />
      <FaqModal open={faqOpen} onClose={() => setFaqOpen(false)} initial={faqItems} onSave={setFaqItems} />
      </div>
    </form>
  );
}
