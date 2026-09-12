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
 * Rebuilt against the ACTUAL newbase.fast2tricks.com reference (both its
 * rendered screenshots and view-source), not a written description of
 * it. Real gaps fixed in this pass, all inside PostFormClient.tsx now:
 * - "AI Generate" was a dead-end `<Link href="/admin/ai-features">` —
 *   now a real in-page modal calling the existing /api/ai/generate
 *   backend (which already did everything needed; only the UI was
 *   missing), populating title/content/SEO fields/thumbnail in one shot.
 * - "SEO & Meta" had Meta Keywords / Facebook Description / Thumbnail
 *   Prompt as large permanent textareas — the reference only shows Meta
 *   Description there; FB Description/Thumbnail Prompt are compact
 *   reveal+copy chips in the action row instead (still fully editable,
 *   just not presented as big textareas).
 * - Featured Image was a plain file input with no AI regenerate wired
 *   into the UI, even though the backend for it
 *   (/api/ai/regenerate-thumbnail) already existed — now has the
 *   reference's "Set Featured Image" / "Regenerate Thumbnail (AI)"
 *   button pair.
 *
 * Disclosed simplification kept from before: the content editor is
 * Tiptap, not TinyMCE with an HTML-source tab; FAQs are a raw JSON
 * textarea, not the reference's row-by-row FAQ builder modal.
 */
export async function PostForm({ post }: { post?: PostFormPost }) {
  const user = await requireUser();
  const permissions = user ? resolvePermissions(user) : null;
  const canAssignAuthor = user ? canManageAllPosts(user.role, permissions, "edit") : false;

  const [categories, states, authors, siteConfig] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.state.findMany({ orderBy: { stateName: "asc" }, select: { id: true, stateName: true } }),
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
    <form action={action}>
      <input type="hidden" name="editId" value={post?.id ?? 0} />
      <PostFormClient
        post={
          post
            ? { ...post, featuredImagePath: post.featuredImagePath ? resolveMediaUrl(post.featuredImagePath) : "" }
            : undefined
        }
        categories={categories}
        states={states}
        authors={authors}
        canAssignAuthor={canAssignAuthor}
        authorLabel={authorLabel}
        fullPostUrl={fullPostUrl}
        fbCommentEnabled={pt.fb_comment_copy}
        fbCommentText={pt.fb_comment_copy_text}
        isNew={!post}
      />
    </form>
  );
}
