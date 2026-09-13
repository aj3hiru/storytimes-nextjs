import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireUser, canEditPost, resolvePermissions } from "@/lib/auth";
import { PostForm } from "@/components/admin/PostForm";

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const postId = parseInt(id, 10);
  if (!Number.isFinite(postId)) notFound();

  const user = await requireUser();
  if (!user) redirect("/admin-login");
  const permissions = resolvePermissions(user);

  const allowed = await canEditPost(user.role, permissions, user.id, postId);
  if (!allowed) {
    return (
      <div className="empty-state">
        <h3>Access denied</h3>
        <p>You don&apos;t have permission to edit this post.</p>
      </div>
    );
  }

  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: {
      postTags: { include: { tag: true } },
      featuredImage: { select: { filePath: true } },
      postMeta: { where: { metaKey: { in: ["description", "keywords", "fb_description", "thumbnail_prompt"] } } },
    },
  });
  if (!post) notFound();

  const metaByKey = Object.fromEntries(post.postMeta.map((m) => [m.metaKey, m.metaValue ?? ""]));

  return (
    <PostForm
      post={{
          id: post.id,
          title: post.title,
          slug: post.slug,
          content: post.content,
          categoryId: post.categoryId,
          authorId: post.authorId,
          status: post.status,
          faqJson: post.faqJson,
          tags: post.postTags.map((pt) => pt.tag.name),
          featuredImagePath: post.featuredImage?.filePath ?? null,
          metaDescription: metaByKey.description ?? "",
          metaKeywords: metaByKey.keywords ?? "",
          fbDescription: metaByKey.fb_description ?? "",
          thumbnailPrompt: metaByKey.thumbnail_prompt ?? "",
        }}
      />
  );
}
