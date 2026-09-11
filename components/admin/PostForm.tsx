import { prisma } from "@/lib/db";
import Link from "next/link";
import { requireUser, canManageAllPosts, resolvePermissions } from "@/lib/auth";
import { createPost, updatePost } from "@/lib/postEditor";
import { ImageUploadField } from "./ImageUploadField";
import { RichTextEditor } from "./RichTextEditor";
import { CopyLinksPanel } from "./CopyLinksPanel";
import { isStorageConfigured } from "@/lib/storage";
import { resolveMediaUrl, postUrl as buildPostUrl } from "@/lib/urls";
import { resolveSiteConfig } from "@/lib/config";
import { getPostTemplateSettings } from "@/lib/postTemplateSettings";

export interface PostFormPost {
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
  metaDescription: string;
  metaKeywords: string;
  fbDescription: string;
  thumbnailPrompt: string;
}

/**
 * Re-verified against the live admin/post-manager.php's actual rendered
 * HTML — this is a WordPress-classic-editor-style layout (2-col grid,
 * meta-panel sidebar boxes with inline-edit Status/Author rows), which an
 * earlier pass replaced with a plain single-column stacked form.
 *
 * Disclosed simplifications kept from before (not from this pass — these
 * were already known gaps, still true): the content editor is Tiptap, not
 * TinyMCE with an HTML-source tab; FAQs are a raw JSON textarea, not the
 * original's row-by-row FAQ builder modal; the "Copy FB Comment" trigger
 * fires from a plain button here rather than being conditionally disabled
 * until the post has been saved once (this port always shows it once a
 * slug exists). The original's meta_keywords/fb_description/
 * thumbnail_prompt fields are AI-generated-only "view/copy" chips, not
 * user-editable text — kept as small editable fields here instead of
 * building the separate view-modal, since the value is the same either
 * way and editing directly is strictly more capable.
 */
export async function PostForm({ post }: { post?: PostFormPost }) {
  const user = await requireUser();
  const permissions = user ? resolvePermissions(user) : null;
  const canAssignAuthor = user ? canManageAllPosts(user.role, permissions, "edit") : false;

  const [categories, states, authors, siteConfig, pt] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.state.findMany({ orderBy: { stateName: "asc" }, select: { id: true, stateName: true } }),
    canAssignAuthor
      ? prisma.author.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, userId: true } })
      : Promise.resolve([]),
    resolveSiteConfig(""),
    getPostTemplateSettings(),
  ]);

  const action = post ? updatePost.bind(null, post.id) : createPost;
  const fullPostUrl = post ? `${siteConfig.siteUrl.replace(/\/+$/, "")}${buildPostUrl(post.slug)}` : "";
  const authorLabel = canAssignAuthor ? (authors.find((a) => a.id === post?.authorId)?.name ?? authors[0]?.name ?? "") : user?.username ?? "";

  return (
    <form action={action}>
      <input type="hidden" name="editId" value={post?.id ?? 0} />

      <div className="editor-layout">
        <div className="editor-main">
          {/* Title / permalink / chapter badge / AI generate */}
          <div className="meta-panel">
            <div className="meta-panel-body" style={{ gap: "0.5rem" }}>
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "2px" }}>
                <Link href="/admin/ai-features" className="btn-ai-generate" title="Generate a full story from a video shot-list in AI Features">
                  <i className="fas fa-wand-magic-sparkles" /> AI Generate
                </Link>
              </div>
              <input
                type="text"
                name="title"
                id="title"
                className="post-title-input"
                defaultValue={post?.title}
                placeholder="Add title"
                autoComplete="off"
                required
              />
              <div className="permalink-row">
                <strong>Permalink:</strong>
                <input type="text" name="slug" id="slug-input" className="permalink-input" defaultValue={post?.slug} placeholder="post-url-slug" maxLength={120} />
              </div>
              <div style={{ marginTop: "0.35rem" }}>
                <div className="chapter-badge-row">
                  <div className="badge-grey">
                    {post ? "Chapters are detected automatically from H1 headings in the content" : "No chapters detected — will publish as a single page"}
                  </div>
                </div>
              </div>
              {post && (
                <div style={{ marginTop: "0.35rem", fontSize: "0.8rem" }}>
                  <CopyLinksPanel
                    postUrl={fullPostUrl}
                    isPublished={post.status === "published"}
                    fbCommentEnabled={pt.fb_comment_copy}
                    fbCommentText={pt.fb_comment_copy_text}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Content editor */}
          <div className="meta-panel">
            <div className="meta-panel-body" style={{ padding: 0, gap: 0 }}>
              <RichTextEditor name="content" defaultValue={post?.content ?? ""} minHeight={420} />
            </div>
          </div>

          {/* SEO & Meta */}
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
                  defaultValue={post?.metaDescription ?? ""}
                  rows={3}
                />
              </div>
              <div>
                <label htmlFor="metaKeywords">Meta Keywords</label>
                <input id="metaKeywords" name="metaKeywords" type="text" defaultValue={post?.metaKeywords ?? ""} />
              </div>
              <div>
                <label htmlFor="fbDescription">
                  Facebook Description <span className="field-hint" style={{ display: "inline" }}>— AI-generated, editable</span>
                </label>
                <textarea id="fbDescription" name="fbDescription" defaultValue={post?.fbDescription ?? ""} rows={3} />
              </div>
              <div>
                <label htmlFor="thumbnailPrompt">
                  Thumbnail Prompt <span className="field-hint" style={{ display: "inline" }}>— used by Regenerate Thumbnail</span>
                </label>
                <textarea id="thumbnailPrompt" name="thumbnailPrompt" defaultValue={post?.thumbnailPrompt ?? ""} rows={2} />
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
                  <span>{post ? "Save Changes" : "Publish Post"}</span>
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
              {isStorageConfigured() ? (
                <ImageUploadField
                  name="featuredImageUrl"
                  mediaIdFieldName="featuredImageId"
                  purpose="post"
                  label=""
                  defaultValue={post?.featuredImagePath ? resolveMediaUrl(post.featuredImagePath) : ""}
                />
              ) : (
                <div className="alert alert-info">
                  <i className="fas fa-info-circle" /> Needs R2 credentials in <code>.env.local</code> to enable.
                </div>
              )}
              <span className="field-hint">Recommended 1280×720px.</span>
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
      </div>
    </form>
  );
}
