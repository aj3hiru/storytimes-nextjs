"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useAdminDialogs } from "./AdminDialogProvider";
import { resolveMediaUrl } from "@/lib/urls";

export interface PostRow {
  id: number;
  title: string;
  slug: string;
  status: string;
  date: Date | null;
  views: number;
  authorName: string;
  bannerImage: string | null;
}

/**
 * Ports the exact desktop table (.table-card/.data-table, thumbnail +
 * hover-reveal row actions UNDER the title rather than a separate
 * actions column) and the mobile card list (.mobile-post-list) from
 * admin/blogs-manager.php — a real, visible layout difference from an
 * earlier pass of this port, which used a plain always-visible actions
 * column on both desktop and mobile.
 */
export function PostsTable({
  posts,
  canEditAll,
  onDelete,
  onBulkDelete,
}: {
  posts: PostRow[];
  canEditAll: boolean;
  onDelete: (postId: number) => Promise<void>;
  onBulkDelete: (ids: number[]) => Promise<{ deleted: number; skipped: number }>;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const { confirm } = useAdminDialogs();

  const allIds = posts.map((p) => p.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(allIds));
  }
  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  async function handleBulkDelete() {
    if (selected.size === 0) return;
    if (!(await confirm(`Delete ${selected.size} selected post(s)? This cannot be undone.`))) return;
    startTransition(async () => {
      const result = await onBulkDelete(Array.from(selected));
      setMessage(`Deleted ${result.deleted}, skipped ${result.skipped}.`);
      setSelected(new Set());
    });
  }
  async function handleDeleteOne(id: number, title: string) {
    if (!(await confirm(`Delete "${title}"? This cannot be undone.`))) return;
    startTransition(() => onDelete(id));
  }

  return (
    <>
      {selected.size > 0 ? (
        <div className="alert alert-info" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <span>{selected.size} selected</span>
          <button type="button" className="btn btn-danger btn-sm" onClick={handleBulkDelete} disabled={isPending}>
            {isPending ? "Deleting…" : "Delete Selected"}
          </button>
        </div>
      ) : (
        message && (
          <div className="alert alert-success" style={{ marginBottom: "1rem" }}>
            {message}
          </div>
        )
      )}

      {/* Desktop table */}
      <div className="table-card">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
                <th>Title</th>
                {canEditAll && <th>Author</th>}
                <th>Status</th>
                <th>Views</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id}>
                  <td>
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} />
                  </td>
                  <td className="dt-title-td">
                    <div className="dt-title-row">
                      {p.bannerImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={resolveMediaUrl(p.bannerImage)} alt="" className="post-thumb" loading="lazy" />
                      ) : (
                        <div className="post-thumb-placeholder">{p.title.charAt(0).toUpperCase()}</div>
                      )}
                      <div className="dt-title-info">
                        <Link href={`/admin/post-manager/${p.id}/edit`} className="pt-title">
                          {p.title}
                        </Link>
                        <div className="pt-author">{p.authorName}</div>
                      </div>
                    </div>
                    <div className="row-actions">
                      <Link href={`/admin/post-manager/${p.id}/edit`} className="ra-link ra-edit">
                        <i className="fas fa-pen" /> Edit
                      </Link>
                      <Link href={`/${p.slug}`} target="_blank" className="ra-link ra-view">
                        <i className="fas fa-eye" /> View
                      </Link>
                      {p.status !== "published" && (
                        <Link href={`/admin/draft/${p.slug}`} target="_blank" className="ra-link ra-preview">
                          <i className="fas fa-low-vision" /> Preview
                        </Link>
                      )}
                      <button type="button" className="ra-link ra-delete" onClick={() => handleDeleteOne(p.id, p.title)} disabled={isPending}>
                        <i className="fas fa-trash" /> Delete
                      </button>
                    </div>
                  </td>
                  {canEditAll && <td className="text-muted">{p.authorName}</td>}
                  <td>
                    <span className={`badge badge-${p.status}`}>{p.status}</span>
                  </td>
                  <td className="text-muted">
                    <i className="fas fa-eye" style={{ fontSize: "0.7rem", marginRight: 3 }} />
                    {p.views.toLocaleString()}
                  </td>
                  <td className="text-muted" style={{ whiteSpace: "nowrap" }}>
                    <i className="fas fa-calendar-check" style={{ fontSize: "0.7rem", marginRight: 3 }} />
                    {p.date ? new Date(p.date).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile card list */}
      <div className="mobile-post-list">
        {posts.map((p) => (
          <div className="mobile-post-card" key={p.id}>
            <div className="mpc-top">
              <input type="checkbox" className="mpc-bulk-check" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)} />
              {p.bannerImage ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={resolveMediaUrl(p.bannerImage)} alt="" className="mpc-thumb" loading="lazy" />
              ) : (
                <div className="mpc-thumb-placeholder">{p.title.charAt(0).toUpperCase()}</div>
              )}
              <div className="mpc-info">
                <Link href={`/admin/post-manager/${p.id}/edit`} className="pt-title">
                  {p.title}
                </Link>
                <div className="mpc-meta-row">
                  <span className="mpc-author">{p.authorName}</span>
                  <span className={`badge badge-${p.status}`}>{p.status}</span>
                  <span className="mpc-views">
                    <i className="fas fa-eye" /> {p.views.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
            <div className="mpc-actions">
              <Link href={`/admin/post-manager/${p.id}/edit`} className="ra-link ra-edit">
                <i className="fas fa-pen" /> Edit
              </Link>
              <Link href={`/${p.slug}`} target="_blank" className="ra-link ra-view">
                <i className="fas fa-eye" /> View
              </Link>
              <button type="button" className="ra-link ra-delete" onClick={() => handleDeleteOne(p.id, p.title)} disabled={isPending}>
                <i className="fas fa-trash" /> Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
