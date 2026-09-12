"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { requireUser, canEditPost, canManageAllPosts, resolvePermissions } from "./auth";

/**
 * "Cache warming" — right after a post is published, this fires a single
 * background request to the post's own public URL so Next.js generates
 * and caches that page BEFORE any real visitor arrives, instead of the
 * very first human hit paying for a cold render. Fire-and-forget: never
 * awaited, and any failure here (site not reachable from itself yet,
 * etc.) is swallowed rather than breaking the publish flow — worst
 * case, the first real visitor just gets a normal (still fast, just not
 * pre-warmed) ISR render instead.
 *
 * Real bug fixed here: this used to fall back to hardcoded
 * "http://localhost:3000" whenever APP_URL wasn't set, which meant every
 * single publish/update fired a request to localhost in production —
 * visibly showing up repeatedly wherever that request or its failure got
 * logged. There's no reliable way to detect the real public domain from
 * here (this runs from a Server Action, with no incoming request to read
 * a Host header from) — so if APP_URL isn't set, this now skips cache
 * warming entirely instead of guessing wrong. Set APP_URL in .env.local
 * to enable it.
 */
function warmPostCache(slug: string): void {
  const appUrl = process.env.APP_URL?.trim();
  if (!appUrl) return; // no reliable base URL available — skip rather than guess wrong
  const baseUrl = appUrl.replace(/\/+$/, "");
  fetch(`${baseUrl}/${slug}`, { headers: { "x-cache-warm": "1" } }).catch(() => {});
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function resolveSlug(desired: string, excludePostId?: number): Promise<string> {
  let slug = slugify(desired) || `post-${Date.now()}`;
  let suffix = 1;
  for (;;) {
    const existing = await prisma.post.findFirst({
      where: { slug, ...(excludePostId ? { id: { not: excludePostId } } : {}) },
      select: { id: true },
    });
    if (!existing) return slug;
    suffix += 1;
    slug = `${slugify(desired)}-${suffix}`;
  }
}

interface ParsedPostForm {
  title: string;
  slug: string;
  content: string;
  excerpt: string | null;
  categoryId: number;
  additionalCategoryIds: number[];
  stateId: number | null;
  status: "draft" | "published" | "archived";
  faqJson: string | null;
  tagNames: string[];
  featuredImageId: number | undefined;
  metaDescription: string;
  metaKeywords: string;
  fbDescription: string;
  thumbnailPrompt: string;
}

async function parsePostForm(formData: FormData, excludePostId?: number): Promise<ParsedPostForm> {
  const title = String(formData.get("title") ?? "").trim();
  const categoryId = parseInt(String(formData.get("categoryId") ?? ""), 10);
  if (!title || !categoryId) {
    throw new Error("Title and category are required.");
  }

  const slug = await resolveSlug(String(formData.get("slug") ?? title) || title, excludePostId);
  const tagNames = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
  const featuredImageIdRaw = String(formData.get("featuredImageId") ?? "").trim();
  const stateIdRaw = String(formData.get("stateId") ?? "").trim();
  const additionalCategoryIds = formData
    .getAll("additionalCategoryIds")
    .map((v) => parseInt(String(v), 10))
    .filter((n) => Number.isFinite(n) && n !== categoryId);

  return {
    title,
    slug,
    content: String(formData.get("content") ?? ""),
    excerpt: String(formData.get("excerpt") ?? "") || null,
    categoryId,
    additionalCategoryIds,
    stateId: stateIdRaw ? parseInt(stateIdRaw, 10) : null,
    status: String(formData.get("status") ?? "draft") as "draft" | "published" | "archived",
    faqJson: String(formData.get("faqJson") ?? "") || null,
    tagNames,
    featuredImageId: featuredImageIdRaw ? parseInt(featuredImageIdRaw, 10) : undefined,
    metaDescription: String(formData.get("metaDescription") ?? "").trim(),
    metaKeywords: String(formData.get("metaKeywords") ?? "").trim(),
    fbDescription: String(formData.get("fbDescription") ?? "").trim(),
    thumbnailPrompt: String(formData.get("thumbnailPrompt") ?? "").trim(),
  };
}

async function savePostMeta(postId: number, parsed: ParsedPostForm) {
  await prisma.postMeta.deleteMany({ where: { postId } });
  const entries: { metaKey: string; metaValue: string }[] = [];
  if (parsed.metaKeywords) entries.push({ metaKey: "keywords", metaValue: parsed.metaKeywords });
  if (parsed.metaDescription) entries.push({ metaKey: "description", metaValue: parsed.metaDescription });
  if (parsed.fbDescription) entries.push({ metaKey: "fb_description", metaValue: parsed.fbDescription });
  if (parsed.thumbnailPrompt) entries.push({ metaKey: "thumbnail_prompt", metaValue: parsed.thumbnailPrompt });
  if (entries.length > 0) {
    await prisma.postMeta.createMany({ data: entries.map((e) => ({ postId, ...e })) });
  }
}

async function linkOrphanedEditorImages(postId: number, userId: number, content: string) {
  const candidates = await prisma.media.findMany({
    where: { postId: null, uploadedBy: userId },
    select: { id: true, filePath: true },
    orderBy: { uploadedAt: "desc" },
    take: 50,
  });
  const matchingIds = candidates.filter((m) => content.includes(m.filePath)).map((m) => m.id);
  if (matchingIds.length > 0) {
    await prisma.media.updateMany({ where: { id: { in: matchingIds } }, data: { postId } });
  }
}

async function syncCategories(postId: number, categoryId: number, additionalCategoryIds: number[]) {
  await prisma.postCategory.deleteMany({ where: { postId } });
  const allIds = [categoryId, ...additionalCategoryIds];
  await prisma.postCategory.createMany({
    data: allIds.map((categoryId) => ({ postId, categoryId })),
    skipDuplicates: true,
  });
}

async function syncTags(postId: number, tagNames: string[]) {
  await prisma.postTag.deleteMany({ where: { postId } });
  for (const name of tagNames) {
    const slug = slugify(name);
    if (!slug) continue;
    const tag = await prisma.tag.upsert({ where: { slug }, create: { name, slug }, update: {} });
    await prisma.postTag.create({ data: { postId, tagId: tag.id } }).catch(() => {});
  }
}

export async function createPost(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!user) redirect("/admin-login");

  const permissions = resolvePermissions(user);
  if (!permissions.blogs.create) {
    throw new Error("You do not have permission to create posts.");
  }

  const parsed = await parsePostForm(formData);

  const canAssignAuthor = canManageAllPosts(user.role, permissions, "edit");
  const authorIdRaw = String(formData.get("authorId") ?? "").trim();
  let authorId: number;
  if (canAssignAuthor && authorIdRaw) {
    authorId = parseInt(authorIdRaw, 10);
  } else {
    const author = await prisma.author.findUnique({ where: { userId: user.id } });
    if (!author) {
      throw new Error("No author profile is linked to your account yet — ask an admin to create one.");
    }
    authorId = author.id;
  }

  const post = await prisma.post.create({
    data: {
      title: parsed.title,
      slug: parsed.slug,
      content: parsed.content,
      excerpt: parsed.excerpt,
      categoryId: parsed.categoryId,
      stateId: parsed.stateId,
      authorId,
      status: parsed.status,
      faqJson: parsed.faqJson,
      ...(parsed.featuredImageId ? { featuredImageId: parsed.featuredImageId } : {}),
    },
  });

  await Promise.all([
    syncCategories(post.id, parsed.categoryId, parsed.additionalCategoryIds),
    syncTags(post.id, parsed.tagNames),
    savePostMeta(post.id, parsed),
    linkOrphanedEditorImages(post.id, user.id, parsed.content),
  ]);

  await prisma.activityLog.create({
    data: { userId: user.id, actionType: "post_create", description: `Created Post: ${parsed.title} (ID: ${post.id})` },
  });

  // Invalidate the ISR cache for this post's public URL + the homepage/
  // category listings it now appears in, so the new post is visible
  // immediately instead of waiting for the time-based revalidate window
  // (see `export const revalidate` in the public post/homepage routes).
  revalidatePath("/admin/blogs-manager");
  revalidatePath(`/${parsed.slug}`);
  revalidatePath("/");
  if (parsed.status === "published") warmPostCache(parsed.slug);
  redirect(`/admin/post-manager/${post.id}/edit?success=created`);
}

export async function updatePost(postId: number, formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!user) redirect("/admin-login");

  const permissions = resolvePermissions(user);
  const allowed = await canEditPost(user.role, permissions, user.id, postId);
  if (!allowed) {
    throw new Error("You do not have permission to edit this post.");
  }

  const parsed = await parsePostForm(formData, postId);

  const canAssignAuthor = canManageAllPosts(user.role, permissions, "edit");
  const authorIdRaw = String(formData.get("authorId") ?? "").trim();
  const authorId = canAssignAuthor && authorIdRaw ? parseInt(authorIdRaw, 10) : undefined;

  await prisma.post.update({
    where: { id: postId },
    data: {
      title: parsed.title,
      slug: parsed.slug,
      content: parsed.content,
      excerpt: parsed.excerpt,
      categoryId: parsed.categoryId,
      stateId: parsed.stateId,
      status: parsed.status,
      faqJson: parsed.faqJson,
      ...(authorId ? { authorId } : {}),
      ...(parsed.featuredImageId ? { featuredImageId: parsed.featuredImageId } : {}),
    },
  });

  await Promise.all([
    syncCategories(postId, parsed.categoryId, parsed.additionalCategoryIds),
    syncTags(postId, parsed.tagNames),
    savePostMeta(postId, parsed),
    linkOrphanedEditorImages(postId, user.id, parsed.content),
  ]);

  await prisma.activityLog.create({
    data: { userId: user.id, actionType: "post_update", description: `Updated Post: ${parsed.title} (ID: ${postId})` },
  });

  revalidatePath("/admin/blogs-manager");
  revalidatePath(`/${parsed.slug}`);
  revalidatePath("/");
  if (parsed.status === "published") warmPostCache(parsed.slug);
  redirect(`/admin/post-manager/${postId}/edit?success=updated`);
}
