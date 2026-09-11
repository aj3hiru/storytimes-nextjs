"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { requireUser, resolvePermissions } from "./auth";
import { resolveSiteConfig } from "./config";
import { postUrl } from "./urls";
import { sendReplyNotification } from "./mail/commentMailer";

async function requirePermission() {
  const user = await requireUser();
  if (!user) redirect("/admin-login");
  const permissions = resolvePermissions(user);
  if (!permissions.blogs.manage_comments) {
    throw new Error("You do not have permission to manage comments.");
  }
  return user;
}

export async function approveComment(commentId: number): Promise<void> {
  await requirePermission();
  await prisma.comment.update({ where: { id: commentId }, data: { status: "approved" } });
  revalidatePath("/admin/comments-manager");
}

export async function rejectComment(commentId: number): Promise<void> {
  await requirePermission();
  await prisma.comment.update({ where: { id: commentId }, data: { status: "pending" } });
  revalidatePath("/admin/comments-manager");
}

export async function deleteComment(commentId: number): Promise<void> {
  const user = await requirePermission();
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) return;

  await prisma.$transaction([
    prisma.comment.deleteMany({ where: { parentId: commentId } }),
    prisma.comment.delete({ where: { id: commentId } }),
    prisma.activityLog.create({
      data: { userId: user.id, actionType: "comment_delete", description: `Deleted comment #${commentId} by ${comment.name}` },
    }),
  ]);
  revalidatePath("/admin/comments-manager");
}

/** Admin reply to a comment — creates a new approved reply row and emails
 *  the original commenter, porting the admin-reply half of
 *  admin/comments-manager.php + CommentMailer::sendReplyNotification(). */
export async function replyToComment(commentId: number, formData: FormData): Promise<void> {
  const user = await requirePermission();
  const replyText = String(formData.get("reply") ?? "").trim();
  if (!replyText) throw new Error("Reply text is required.");

  const parent = await prisma.comment.findUnique({
    where: { id: commentId },
    include: { post: { select: { title: true, slug: true } } },
  });
  if (!parent) throw new Error("Comment not found.");

  const siteConfig = await resolveSiteConfig("");

  await prisma.comment.create({
    data: {
      name: `${siteConfig.siteName} Support`,
      email: siteConfig.contactEmail,
      content: replyText,
      postId: parent.postId,
      parentId: parent.id,
      date: new Date(),
      status: "approved",
      evf: true,
    },
  });

  const postLink = `${siteConfig.siteUrl.replace(/\/+$/, "")}${postUrl(parent.post.slug)}`;
  sendReplyNotification(parent.name, parent.email, parent.content, replyText, postLink).catch((err) => {
    console.error("Reply notification dispatch failed:", err);
  });

  await prisma.activityLog.create({
    data: { userId: user.id, actionType: "comment_reply", description: `Replied to comment #${commentId}` },
  });

  revalidatePath("/admin/comments-manager");
}
