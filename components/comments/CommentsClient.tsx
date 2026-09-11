"use client";

import { useState } from "react";
import type { CommentNode } from "@/lib/comments";

interface ApiCommentNode {
  id: number;
  name: string;
  content: string;
  date: string | null;
  parentId: number | null;
  parentName: string | null;
  children: ApiCommentNode[];
}

function formatDate(d: string | Date | null): string {
  if (!d) return "";
  return new Date(d).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CommentsClient({
  postId,
  initialComments,
  initialTotal,
}: {
  postId: number;
  initialComments: CommentNode[];
  initialTotal: number;
}) {
  const [comments, setComments] = useState<ApiCommentNode[]>(initialComments as ApiCommentNode[]);
  const [total, setTotal] = useState(initialTotal);
  const [loadingMore, setLoadingMore] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: number; name: string } | null>(null);

  const topLevelCount = comments.length;

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/comments/load?pId=${postId}&offset=${topLevelCount}`);
      const data = await res.json();
      if (Array.isArray(data.comments)) {
        setComments((prev) => [...prev, ...data.comments]);
        setTotal(data.total ?? total);
      }
    } finally {
      setLoadingMore(false);
    }
  }

  function handlePosted(newComment: { id: number; name: string; content: string; date: string }, parentName: string | null) {
    const node: ApiCommentNode = {
      id: newComment.id,
      name: newComment.name,
      content: newComment.content,
      date: newComment.date,
      parentId: replyTo?.id ?? null,
      parentName,
      children: [],
    };

    if (replyTo) {
      setComments((prev) => addReply(prev, replyTo.id, node));
    } else {
      setComments((prev) => [...prev, node]);
    }
    setTotal((t) => t + 1);
    setReplyTo(null);
  }

  return (
    <div className="blog-comments-section">
      <h2 className="section-heading">Comments ({total})</h2>

      <div className="blog-comments-container">
        {comments.map((c) => (
          <CommentItem key={c.id} comment={c} depth={0} onReply={setReplyTo} />
        ))}
      </div>

      {topLevelCount < total && (
        <div className="load-more-btn-cont">
          <button type="button" className="load-more-cmt-btn" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more comments"}
          </button>
        </div>
      )}

      <CommentForm postId={postId} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} onPosted={handlePosted} />
    </div>
  );
}

function addReply(nodes: ApiCommentNode[], parentId: number, reply: ApiCommentNode): ApiCommentNode[] {
  return nodes.map((n) => {
    if (n.id === parentId) return { ...n, children: [...n.children, reply] };
    if (n.children.length) return { ...n, children: addReply(n.children, parentId, reply) };
    return n;
  });
}

function CommentItem({
  comment,
  depth,
  onReply,
}: {
  comment: ApiCommentNode;
  depth: number;
  onReply: (target: { id: number; name: string }) => void;
}) {
  return (
    <div
      className={depth > 0 ? "blog-comment-item blog-comment-reply" : "blog-comment-item"}
      data-comment-id={comment.id}
    >
      <div className="blog-comment-header">
        <span className="blog-comment-author">{comment.name}</span>
        <span className="blog-comment-date">{formatDate(comment.date)}</span>
      </div>
      {comment.parentId && comment.parentName && (
        <div className="blog-comment-replying-to active">
          Replying to <strong>{comment.parentName}</strong>
        </div>
      )}
      <div className="blog-comment-content">{comment.content}</div>
      <div className="blog-comment-actions">
        <button
          type="button"
          className="blog-comment-reply-btn"
          onClick={() => onReply({ id: comment.id, name: comment.name })}
        >
          Reply
        </button>
      </div>
      {comment.children.map((child) => (
        <CommentItem key={child.id} comment={child} depth={depth + 1} onReply={onReply} />
      ))}
    </div>
  );
}

function CommentForm({
  postId,
  replyTo,
  onCancelReply,
  onPosted,
}: {
  postId: number;
  replyTo: { id: number; name: string } | null;
  onCancelReply: () => void;
  onPosted: (comment: { id: number; name: string; content: string; date: string }, parentName: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const tokenRes = await fetch("/api/csrf-token");
      const { token } = await tokenRes.json();

      const form = new FormData();
      form.set("name", name);
      form.set("email", email);
      form.set("content", content);
      form.set("website", ""); // honeypot — must stay empty
      form.set("cTkn", token ?? "");
      if (replyTo) form.set("parent_id", String(replyTo.id));

      const res = await fetch(`/api/comments?id=${postId}`, { method: "POST", body: form });
      const data = await res.json();

      if (!data.success) {
        setError(data.message ?? "Failed to post comment.");
        return;
      }

      onPosted(data.comment, data.parentName ?? null);
      setContent("");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="blog-comment-form-container">
      <h2>Leave a Comment</h2>
      <form id="blog-comment-form" onSubmit={handleSubmit}>
        {replyTo && (
          <div className="blog-comment-replying-to active">
            <span>
              Replying to <strong>{replyTo.name}</strong>
            </span>
            <button type="button" className="blog-comment-cancel-reply" onClick={onCancelReply}>
              Cancel
            </button>
          </div>
        )}
        <div className="blog-comment-form-group">
          <label htmlFor="comment-name">Name</label>
          <input
            id="comment-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            required
          />
        </div>
        <div className="blog-comment-form-group">
          <label htmlFor="comment-email">Email (not published)</label>
          <input
            id="comment-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        {/* Honeypot field — hidden from real users via CSS, left blank by
            them; bots that auto-fill every field trip the server-side check. */}
        <input type="text" name="website" tabIndex={-1} autoComplete="off" style={{ display: "none" }} />
        <div className="blog-comment-form-group">
          <label htmlFor="comment-content">Comment</label>
          <textarea
            id="comment-content"
            placeholder="No links allowed"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={1000}
            required
          />
        </div>
        {error && <div className="blog-comment-alert blog-comment-alert-error show">{error}</div>}
        <button type="submit" className="blog-comment-submit-btn" disabled={submitting}>
          {submitting ? "Posting…" : "Post Comment"}
        </button>
      </form>
    </div>
  );
}
