"use client";

import { useState } from "react";
import { createPage, updatePage } from "@/lib/pageAdmin";
import { RichTextEditor } from "./RichTextEditor";

export interface PageFormData {
  id: number;
  title: string;
  slug: string;
  content: string | null;
  status: string;
  metaTitle: string | null;
  metaDescription: string | null;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-|-$/g, "");
}

const statusLabels: Record<string, string> = { draft: "Draft", published: "Published" };

/**
 * Rebuilt to use the Post Editor's own shell — the two-column
 * `editor-layout` with a wide content column and a sticky Publish panel —
 * so moving between the two doesn't feel like two different products.
 *
 * Deliberately NOT a full clone, per explicit instruction. A page is not
 * a post, and the following are omitted because they'd be dead controls
 * here rather than missing features: AI Generate and thumbnail generation
 * (pages aren't stories), chapters and the chapter counter, featured
 * image and its responsive variants, Facebook share text and copy-links,
 * categories/tags, author assignment, scheduling, and the FAQ builder.
 * What pages genuinely have — title, slug, content, status, and the two
 * SEO meta fields — is what's here.
 */
export function PageForm({ page }: { page?: PageFormData }) {
  const action = page ? updatePage.bind(null, page.id) : createPage;
  const isNew = !page;

  const [title, setTitle] = useState(page?.title ?? "");
  const [slug, setSlug] = useState(page?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(Boolean(page?.slug));
  const [status, setStatus] = useState(page?.status ?? "draft");
  const [statusEditing, setStatusEditing] = useState(false);

  return (
    <form action={action}>
      <div className="editor-layout">
        <div className="editor-main">
          <div className="meta-panel">
            <div className="meta-panel-body" style={{ gap: "0.5rem" }}>
              <input
                type="text"
                name="title"
                id="title"
                className="post-title-input"
                placeholder="Page title"
                value={title}
                onChange={(e) => {
                  const v = e.target.value;
                  setTitle(v);
                  if (!slugTouched) setSlug(slugify(v));
                }}
                required
              />
              <div className="form-group" style={{ margin: 0 }}>
                <label htmlFor="slug" style={{ fontSize: "0.75rem" }}>
                  Slug <span className="form-hint">— leave blank to auto-generate</span>
                </label>
                <input
                  id="slug"
                  name="slug"
                  className="form-control"
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value);
                  }}
                />
              </div>
            </div>
          </div>

          <div className="meta-panel">
            <div className="meta-panel-header">
              <span>Content</span>
            </div>
            <div className="meta-panel-body">
              <RichTextEditor name="content" defaultValue={page?.content ?? ""} minHeight={420} />
            </div>
          </div>

          <div className="meta-panel">
            <div className="meta-panel-header">
              <span>SEO</span>
            </div>
            <div className="meta-panel-body">
              <div className="form-group">
                <label htmlFor="metaTitle">Meta Title</label>
                <input id="metaTitle" name="metaTitle" className="form-control" defaultValue={page?.metaTitle ?? ""} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="metaDescription">Meta Description</label>
                <textarea id="metaDescription" name="metaDescription" className="form-control" rows={3} defaultValue={page?.metaDescription ?? ""} />
              </div>
            </div>
          </div>
        </div>

        <div className="editor-sidebar-panel">
          <div className="meta-panel" id="publish-box">
            <div className="meta-panel-header">
              <span>Publish</span>
            </div>
            <div className="meta-panel-body">
              <div className="wp-pub-row">
                <i className="fas fa-toggle-on wp-pub-icon" />
                <span>
                  Status: <strong>{statusLabels[status] ?? status}</strong>
                </span>
                <button
                  type="button"
                  className="wp-pub-editlink"
                  onClick={() => setStatusEditing((v) => !v)}
                >
                  Edit
                </button>
              </div>
              <div className={`wp-pub-editbox${statusEditing ? " open" : ""}`}>
                <select name={statusEditing ? "status" : undefined} value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </div>
              {/* Mirrors the post editor's own handling: the select only
                  carries `name` while its edit box is open, so this hidden
                  input guarantees `status` is always submitted either way. */}
              {!statusEditing && <input type="hidden" name="status" value={status} />}

              {page?.slug && status === "published" && (
                <div className="wp-pub-row">
                  <i className="fas fa-link wp-pub-icon" />
                  <a href={`/page/${page.slug}`} target="_blank" rel="noopener noreferrer" className="wp-pub-editlink">
                    View page
                  </a>
                </div>
              )}

              <div style={{ marginTop: "0.75rem" }}>
                <button type="submit" className="btn btn-primary" style={{ width: "100%", borderRadius: 4 }}>
                  <span className="btn-icon-svg">
                    <i className="fas fa-upload" />
                  </span>
                  <span>{isNew ? "Publish Page" : "Update Page"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
