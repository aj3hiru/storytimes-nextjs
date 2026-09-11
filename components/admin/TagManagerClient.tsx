"use client";

import { useState } from "react";
import { createTag, updateTag } from "@/lib/tagAdmin";
import { DeleteTagButton } from "./DeleteTagButton";

export interface TagRow {
  id: number;
  name: string;
  slug: string;
  isActive: boolean;
  postCount: number;
  views: number;
}

/** Ports the modal-based Add/Edit flow from admin/tag-manager.php (the
 *  original doesn't use an inline form — "New Tag" opens a modal, and
 *  each row's Edit button opens a pre-filled modal). */
export function TagManagerClient({ tags, search, sort }: { tags: TagRow[]; search?: string; sort?: string }) {
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<TagRow | null>(null);

  return (
    <>
      <div className="tm-header-row">
        <div className="summary-bar" style={{ marginBottom: 0, flex: 1 }}>
          <div className="summary-item">
            <span className="summary-label">Total Tags</span>
            <span className="summary-value">{tags.length}</span>
          </div>
          <div className="summary-divider" />
          <div className="summary-item">
            <span className="summary-label">Total Views</span>
            <span className="summary-value" style={{ color: "var(--info)" }}>
              {tags.reduce((sum, t) => sum + t.views, 0)}
            </span>
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setAddOpen(true)}>
          <i className="fas fa-plus" /> New Tag
        </button>
      </div>

      <div className="tm-toolbar">
        <form className="tm-search" method="GET">
          <input type="text" name="search" placeholder="Search tags..." defaultValue={search} />
          <button type="submit">
            <i className="fas fa-search" />
          </button>
        </form>
        <form method="GET">
          <select
            name="sort"
            className="tm-sort"
            defaultValue={sort ?? "newest"}
            onChange={(e) => e.currentTarget.form?.submit()}
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="popular">Most Used</option>
            <option value="views">Most Viewed</option>
            <option value="name">Name (A-Z)</option>
          </select>
        </form>
      </div>

      <div className="table-wrap">
        <table className="tags-table">
          <thead>
            <tr>
              <th style={{ width: "5%" }}>ID</th>
              <th style={{ width: "25%" }}>Tag Name</th>
              <th style={{ width: "20%" }}>Slug</th>
              <th style={{ width: "12%" }}>Linked Posts</th>
              <th style={{ width: "10%" }}>Views</th>
              <th style={{ width: "10%" }}>Status</th>
              <th style={{ width: "18%", textAlign: "right" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tags.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: 50, color: "#888", fontSize: 16 }}>
                  No tags found matching your criteria.
                </td>
              </tr>
            ) : (
              tags.map((tag) => (
                <tr key={tag.id}>
                  <td>{tag.id}</td>
                  <td className="tag-name">{tag.name}</td>
                  <td className="tag-slug">{tag.slug}</td>
                  <td>
                    <span className="tag-count">
                      <i className="fas fa-link" style={{ fontSize: "0.65rem" }} /> {tag.postCount}
                    </span>
                  </td>
                  <td>{tag.views}</td>
                  <td>
                    <span className={`badge ${tag.isActive ? "badge-active" : "badge-inactive"}`}>{tag.isActive ? "Active" : "Inactive"}</span>
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div className="row-actions" style={{ justifyContent: "flex-end" }}>
                      <button type="button" className="btn-link" onClick={() => setEditing(tag)}>
                        <i className="fas fa-edit" /> Edit
                      </button>
                      <DeleteTagButton tagId={tag.id} name={tag.name} />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className={`modal${addOpen ? " open" : ""}`} onClick={() => setAddOpen(false)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <button type="button" className="close" onClick={() => setAddOpen(false)}>
            ×
          </button>
          <h2>Add New Tag</h2>
          <form
            action={async (formData) => {
              await createTag(formData);
              setAddOpen(false);
            }}
          >
            <div className="form-group">
              <label>Tag Name *</label>
              <input type="text" name="name" required placeholder="e.g. Technology" />
            </div>
            <div className="form-group">
              <label>Slug (Optional)</label>
              <input type="text" name="slug" placeholder="e.g. technology (leave blank to auto-generate)" />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>
              Create Tag
            </button>
          </form>
        </div>
      </div>

      <div className={`modal${editing ? " open" : ""}`} onClick={() => setEditing(null)}>
        {editing && (
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="close" onClick={() => setEditing(null)}>
              ×
            </button>
            <h2>Edit Tag</h2>
            <form
              action={async (formData) => {
                await updateTag(editing.id, formData);
                setEditing(null);
              }}
            >
              <div className="form-group">
                <label>Tag Name</label>
                <input type="text" name="name" required defaultValue={editing.name} />
              </div>
              <div className="form-group">
                <label>Slug</label>
                <input type="text" name="slug" required defaultValue={editing.slug} />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select name="isActive" defaultValue={editing.isActive ? "on" : ""}>
                  <option value="on">Active</option>
                  <option value="">Inactive</option>
                </select>
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: "100%" }}>
                Update Tag
              </button>
            </form>
          </div>
        )}
      </div>
    </>
  );
}
