"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { requireUser, resolvePermissions } from "./auth";

function slugifyCat(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function uniqueCatSlug(base: string, excludeId = 0): Promise<string> {
  let slug = base;
  let i = 1;
  while (true) {
    const existing = await prisma.category.findFirst({ where: { slug, id: { not: excludeId } } });
    if (!existing) return slug;
    slug = `${base}-${i++}`;
  }
}

async function requirePermission() {
  const user = await requireUser();
  if (!user) redirect("/admin-login");
  const permissions = resolvePermissions(user);
  if (!permissions.blogs.manage_categories) {
    throw new Error("You do not have permission to manage categories.");
  }
  return user;
}

export async function saveCategory(formData: FormData): Promise<void> {
  const user = await requirePermission();

  const editId = parseInt(String(formData.get("editId") ?? "0"), 10);
  const name = String(formData.get("name") ?? "").trim();
  const slugRaw = String(formData.get("slug") ?? "").trim();
  const metaTitle = String(formData.get("metaTitle") ?? "").trim() || null;
  const metaDescription = String(formData.get("metaDescription") ?? "").trim() || null;
  const metaKeywords = String(formData.get("metaKeywords") ?? "").trim() || null;

  if (!name) throw new Error("Category name is required.");

  const baseSlug = slugifyCat(slugRaw || name);
  const slug = await uniqueCatSlug(baseSlug, editId);

  if (editId > 0) {
    await prisma.category.update({
      where: { id: editId },
      data: { name, slug, metaTitle, metaDescription, metaKeywords },
    });
    await prisma.activityLog.create({
      data: { userId: user.id, actionType: "category_update", description: `Updated Category: ${name} (ID: ${editId})` },
    });
  } else {
    const cat = await prisma.category.create({
      data: { name, slug, metaTitle, metaDescription, metaKeywords },
    });
    await prisma.activityLog.create({
      data: { userId: user.id, actionType: "category_create", description: `Created Category: ${name} (ID: ${cat.id})` },
    });
  }

  revalidatePath("/admin/categories-manager");
  redirect(`/admin/categories-manager?success=${editId > 0 ? "updated" : "created"}`);
}

export async function deleteCategory(categoryId: number): Promise<void> {
  const user = await requirePermission();

  if (categoryId === 1) {
    throw new Error("The Default Category cannot be deleted.");
  }

  const cat = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!cat) return;

  await prisma.$transaction([
    prisma.post.updateMany({ where: { categoryId }, data: { categoryId: 1 } }),
    prisma.postCategory.deleteMany({ where: { categoryId } }),
    prisma.category.delete({ where: { id: categoryId } }),
    prisma.activityLog.create({
      data: {
        userId: user.id,
        actionType: "category_delete",
        description: `Deleted Category: ${cat.name} (ID: ${categoryId}) — posts moved to Default`,
      },
    }),
  ]);

  revalidatePath("/admin/categories-manager");
}
