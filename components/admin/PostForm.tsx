import { prisma } from "@/lib/db";
import { requireUser, canManageAllPosts, resolvePermissions } from "@/lib/auth";
import { createPost, updatePost } from "@/lib/postEditor";
import { resolveMediaUrl, postUrl as buildPostUrl } from "@/lib/urls";
import { resolveSiteConfig } from "@/lib/config";
import { getPostTemplateSettings } from "@/lib/postTemplateSettings";
import { PostFormClient } from "./PostFormClient";

export interface PostFormPost {
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
}

/**
 * Rebuilt against the ACTUAL newbase.fast2tricks.com reference (both its
 * rendered screenshots and view-source), not a written description of
 * it. Real gaps fixed in this pass — see PostFormClient.tsx for detail:
 * dead-end AI Generate link replaced with a real modal; SEO & Meta
 * reduced to just Meta Description (FB Description/Thumbnail Prompt are
 * modal-based chips in the action row instead); Featured Image now uses
 * one unified upload-or-browse picker instead of a raw file input plus
 * a separate library button; Categories reduced to just Main Category
 * (Additional Categories/State didn't exist in the reference); Excerpt
 * removed entirely (not in the reference); FAQs are a real row-by-row
 * modal instead of a raw JSON textarea; Publish box matches the
 * reference's Save Draft/Preview + inline-edit Status/Author pattern.
 *
 * Disclosed simplification kept: the content editor is Tiptap, not
 * TinyMCE with an HTML-source tab (though it does have a Visual/Text
 * toggle matching the reference's UI, just backed by a different editor
 * engine).
 */
export async function PostForm({ post }: { post?: PostFormPost }) {
  const user = await requireUser();
  const permissions = user ? resolvePermissions(user) : null;
  const canAssignAuthor = user ? canManageAllPosts(user.role, permissions, "edit") : false;

  const [categories, authors, siteConfig] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    canAssignAuthor
      ? prisma.author.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, userId: true } })
      : Promise.resolve([]),
    resolveSiteConfig(""),
  ]);
  const pt = await getPostTemplateSettings();

  const action = post ? updatePost.bind(null, post.id) : createPost;
  const fullPostUrl = post ? `${siteConfig.siteUrl.replace(/\/+$/, "")}${buildPostUrl(post.slug)}` : "";
  const authorLabel = canAssignAuthor ? (authors.find((a) => a.id === post?.authorId)?.name ?? authors[0]?.name ?? "") : user?.username ?? "";

  return (
    <PostFormClient
      action={action}
      post={
        post ? { ...post, featuredImagePath: post.featuredImagePath ? resolveMediaUrl(post.featuredImagePath) : "" } : undefined
      }
      categories={categories}
      authors={authors}
      canAssignAuthor={canAssignAuthor}
      authorLabel={authorLabel}
      fullPostUrl={fullPostUrl}
      fbCommentEnabled={pt.fb_comment_copy}
      fbCommentText={pt.fb_comment_copy_text}
      isNew={!post}
    />
  );
}
