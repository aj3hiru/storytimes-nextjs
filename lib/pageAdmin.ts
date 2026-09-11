"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { requireUser, resolvePermissions } from "./auth";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function requirePermission(action: "create" | "edit" | "delete") {
  const user = await requireUser();
  if (!user) redirect("/admin-login");
  const permissions = resolvePermissions(user);
  if (!permissions.pages[action]) {
    throw new Error("You do not have permission to manage pages.");
  }
  return user;
}

async function uniquePageSlug(base: string, excludeId = 0): Promise<string> {
  let slug = base;
  let i = 1;
  for (;;) {
    const existing = await prisma.page.findFirst({ where: { slug, id: { not: excludeId } } });
    if (!existing) return slug;
    slug = `${base}-${i++}`;
  }
}

export async function createPage(formData: FormData): Promise<void> {
  await requirePermission("create");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("Title is required.");
  const slug = await uniquePageSlug(slugify(String(formData.get("slug") ?? title)));

  await prisma.page.create({
    data: {
      title,
      slug,
      content: String(formData.get("content") ?? ""),
      status: String(formData.get("status") ?? "draft") as "draft" | "published",
      metaTitle: String(formData.get("metaTitle") ?? "").trim() || null,
      metaDescription: String(formData.get("metaDescription") ?? "").trim() || null,
    },
  });

  revalidatePath("/admin/pages-list");
  redirect(`/admin/pages-list?success=created`);
}

export async function updatePage(pageId: number, formData: FormData): Promise<void> {
  await requirePermission("edit");
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("Title is required.");
  const slug = await uniquePageSlug(slugify(String(formData.get("slug") ?? title)), pageId);

  await prisma.page.update({
    where: { id: pageId },
    data: {
      title,
      slug,
      content: String(formData.get("content") ?? ""),
      status: String(formData.get("status") ?? "draft") as "draft" | "published",
      metaTitle: String(formData.get("metaTitle") ?? "").trim() || null,
      metaDescription: String(formData.get("metaDescription") ?? "").trim() || null,
    },
  });

  revalidatePath("/admin/pages-list");
  redirect(`/admin/pages-list?success=updated`);
}

export async function deletePage(pageId: number): Promise<void> {
  await requirePermission("delete");
  await prisma.page.delete({ where: { id: pageId } });
  revalidatePath("/admin/pages-list");
}
