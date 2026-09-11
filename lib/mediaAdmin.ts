"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { requireUser, canManageAllPosts, resolvePermissions } from "./auth";

export async function deleteMedia(mediaId: number): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!user) redirect("/admin-login");

  const permissions = resolvePermissions(user);
  const canManageAll = canManageAllPosts(user.role, permissions, "edit") || permissions.media.manage_all;

  const media = await prisma.media.findUnique({ where: { id: mediaId } });
  if (!media) return {};
  if (!canManageAll && media.uploadedBy !== user.id) {
    return { error: "You don't have permission to delete this file." };
  }

  // NOTE: this only removes the DB row. Actual object deletion from
  // whichever storage backend is wired up (R2/S3) is a follow-up — see
  // the storage TODO in .env.example.
  await prisma.media.delete({ where: { id: mediaId } });
  revalidatePath("/admin/file-manager");
  return {};
}
