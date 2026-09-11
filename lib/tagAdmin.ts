"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { requireUser, resolvePermissions } from "./auth";

function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function requirePermission() {
  const user = await requireUser();
  if (!user) redirect("/admin-login");
  const permissions = resolvePermissions(user);
  if (!permissions.blogs.manage_tags) {
    throw new Error("You do not have permission to manage tags.");
  }
  return user;
}

export async function createTag(formData: FormData): Promise<void> {
  await requirePermission();
  const name = String(formData.get("name") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  if (!name) throw new Error("Tag name is required.");
  const slug = slugInput || generateSlug(name);

  try {
    await prisma.tag.create({ data: { name, slug, isActive: true } });
  } catch {
    throw new Error("Tag or slug already exists.");
  }
  revalidatePath("/admin/tag-manager");
}

export async function updateTag(tagId: number, formData: FormData): Promise<void> {
  await requirePermission();
  const name = String(formData.get("name") ?? "").trim();
  const slugInput = String(formData.get("slug") ?? "").trim();
  const isActive = formData.get("isActive") === "on";
  if (!name) throw new Error("Tag name is required.");
  const slug = slugInput || generateSlug(name);

  await prisma.tag.update({ where: { id: BigInt(tagId) }, data: { name, slug, isActive } });
  revalidatePath("/admin/tag-manager");
}

export async function deleteTag(tagId: number): Promise<void> {
  await requirePermission();
  await prisma.postTag.deleteMany({ where: { tagId: BigInt(tagId) } });
  await prisma.tag.delete({ where: { id: BigInt(tagId) } });
  revalidatePath("/admin/tag-manager");
}
