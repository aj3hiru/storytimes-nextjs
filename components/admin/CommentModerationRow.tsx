"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { approveComment, rejectComment, deleteComment, replyToComment, toggleCommentVisibility } from "@/lib/commentAdmin";
import { postUrl } from "@/lib/urls";
import { useAdminDialogs } from "./AdminDialogProvider";

interface ModerationComment {
  id: number;
  name: string;
  email: string;
  content: string;
  status: string;
  date: Date | null;
  postTitle: string;
  postSlug: string;
  /** New feature, no PHP equivalent — see the toggle button below. */
  hidden: boolean;
}

/** Ported to the exact .cm-table/.author-wrap/.ra-btn markup from
 *  admin/comments-manager.php — an earlier pass used a generic table. */
export function CommentModerationRow({ comment }: { comment: ModerationComment }) {
  const [isPending, startTransition] = useTransition();
  const [replying, setReplying] = useState(false);
  const replyAction = replyToComment.bind(null, comment.id);
  const { confirm } = useAdminDialogs();
  const isPending_ = comment.status === "pending";

  return (
    <>
      <tr className={isPending_ ? "row-pending" : undefined} style={comment.hidden ? { opacity: 0.55 } : undefined}>
        <td>
          <div className="td-inner">
            <div className="author-wrap">
              <div className="author-av">{comment.name.charAt(0).toUpperCase()}</div>
              <div className="author-detail">
                <span className="author-name-text" title={comment.name}>
                  {comment.name}
                </span>
                <span className="author-email-text" title={comment.email}>
                  {comment.email}
                </span>
              </div>
            </div>
          </div>
        </td>
        <td className="content-cell">
          <div className="td-inner">
            <div className="comment-text">{comment.content}</div>
            <div className="row-actions" style={{ marginTop: "0.5rem" }}>
              {comment.status === "approved" ? (
                <button type="button" className="ra-btn ra-btn-unapprove" disabled={isPending} onClick={() => startTransition(() => rejectComment(comment.id))}>
                  <i className="fas fa-check" /> Unapprove
                </button>
              ) : (
                <button type="button" className="ra-btn ra-btn-approve" disabled={isPending} onClick={() => startTransition(() => approveComment(comment.id))}>
                  <i className="fas fa-check" /> Approve
                </button>
              )}
              <button type="button" className="ra-btn ra-btn-reply" onClick={() => setReplying((v) => !v)}>
                <i className="fas fa-reply" /> {replying ? "Cancel" : "Reply"}
              </button>
              {/* New feature, no PHP equivalent — per explicit request: a
                  per-comment Show/Hide toggle, independent of the
                  Approve/Unapprove moderation status above it. Lets an
                  admin quietly hide one specific comment from the public
                  post page (see getCommentTree() in lib/comments.ts)
                  without deleting it or touching its approval status. */}
              <button
                type="button"
                className={`ra-btn ${comment.hidden ? "ra-btn-approve" : "ra-btn-unapprove"}`}
                disabled={isPending}
                onClick={() => startTransition(() => toggleCommentVisibility(comment.id))}
                title={comment.hidden ? "Hidden from the post — click to show it again" : "Visible on the post — click to hide it"}
              >
                <i className={`fas ${comment.hidden ? "fa-eye" : "fa-eye-slash"}`} /> {comment.hidden ? "Show" : "Hide"}
              </button>
              <button
                type="button"
                className="ra-btn ra-btn-delete"
                disabled={isPending}
                onClick={async () => {
                  if (await confirm("This will delete the comment and all its replies.")) {
                    startTransition(() => deleteComment(comment.id));
                  }
                }}
              >
                <i className="fas fa-trash" /> Delete
              </button>
            </div>
            {replying && (
              <form
                action={async (formData) => {
                  await replyAction(formData);
                  setReplying(false);
                }}
                style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}
              >
                <textarea name="reply" className="form-control" rows={2} placeholder={`Reply to ${comment.name}...`} required style={{ flex: 1 }} />
                <button type="submit" className="btn btn-primary">
                  Send Reply
                </button>
              </form>
            )}
          </div>
        </td>
        <td className="post-cell">
          <div className="td-inner">
            <Link href={postUrl(comment.postSlug)} target="_blank" className="post-cell-link" title={comment.postTitle}>
              {comment.postTitle}
            </Link>
          </div>
        </td>
        <td>
          <div className="td-inner" style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
            <span className={`status-badge status-${comment.status}`}>{comment.status === "approved" ? "Approved" : "Pending"}</span>
            {comment.hidden && (
              <span className="status-badge" style={{ background: "var(--gray-200)", color: "var(--gray-600)" }}>
                <i className="fas fa-eye-slash" style={{ fontSize: "0.65rem", marginRight: "0.25rem" }} /> Hidden
              </span>
            )}
          </div>
        </td>
        <td>
          <div className="td-inner">
            <span className="post-cell-time" style={{ color: "var(--gray-600)", fontSize: "0.8125rem" }}>
              {comment.date ? new Date(comment.date).toLocaleDateString() : "—"}
            </span>
          </div>
        </td>
      </tr>
    </>
  );
}
