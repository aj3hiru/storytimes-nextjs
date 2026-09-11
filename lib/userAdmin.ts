"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { requireUser, getDefaultPermissionsForRole, resolvePermissions } from "./auth";
import type { UserRole, UserStatus } from "@prisma/client";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function requirePermission(action: "create" | "edit" | "delete" | "change_roles") {
  const user = await requireUser();
  if (!user) redirect("/admin-login");
  const permissions = resolvePermissions(user);
  if (!permissions.users[action]) {
    throw new Error("You do not have permission to manage users.");
  }
  return user;
}

export async function createUser(formData: FormData): Promise<void> {
  const admin = await requirePermission("create");

  const username = String(formData.get("username") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = (String(formData.get("role") ?? "author") as UserRole) ?? "author";
  const fullName = String(formData.get("fullName") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const facebook = String(formData.get("facebook") ?? "").trim();
  const twitter = String(formData.get("twitter") ?? "").trim();
  const instagram = String(formData.get("instagram") ?? "").trim();
  const linkedin = String(formData.get("linkedin") ?? "").trim();
  const threads = String(formData.get("threads") ?? "").trim();

  if (!username || !email) throw new Error("Username and email are required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Invalid email address.");
  if (!password) throw new Error("Password is required for new users.");

  const passwordHash = await bcrypt.hash(password, 10);
  const permissions = JSON.stringify(getDefaultPermissionsForRole(role));

  const newUser = await prisma.user.create({
    data: { username, email, passwordHash, role, status: "active", permissions },
  });

  const apFullName = fullName || username;
  const apName = displayName || username;
  let apSlug = slugify(apName);
  const clash = await prisma.author.findUnique({ where: { slug: apSlug } });
  if (clash) apSlug = `${apSlug}-${newUser.id}`;

  await prisma.author.create({
    data: {
      fullName: apFullName,
      name: apName,
      slug: apSlug,
      bio: bio || null,
      email,
      facebook: facebook || null,
      twitter: twitter || null,
      instagram: instagram || null,
      linkedin: linkedin || null,
      threads: threads || null,
      status: "active",
      userId: newUser.id,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: admin.id,
      actionType: "user_create",
      description: `Created user: ${username} (ID: ${newUser.id}, role: ${role})`,
    },
  });

  revalidatePath("/admin/user-manager");
  redirect("/admin/user-manager?success=created");
}

export async function updateUser(userId: number, formData: FormData): Promise<void> {
  const admin = await requirePermission("edit");

  const username = String(formData.get("username") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const role = String(formData.get("role") ?? "author") as UserRole;
  const status = String(formData.get("status") ?? "active") as UserStatus;
  const fullName = String(formData.get("fullName") ?? "").trim();
  const displayName = String(formData.get("displayName") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const facebook = String(formData.get("facebook") ?? "").trim();
  const twitter = String(formData.get("twitter") ?? "").trim();
  const instagram = String(formData.get("instagram") ?? "").trim();
  const linkedin = String(formData.get("linkedin") ?? "").trim();
  const threads = String(formData.get("threads") ?? "").trim();

  if (!username || !email) throw new Error("Username and email are required.");

  const data: Record<string, unknown> = {
    username,
    email,
    role,
    status,
    permissions: JSON.stringify(getDefaultPermissionsForRole(role)),
  };
  if (password) {
    data.passwordHash = await bcrypt.hash(password, 10);
  }

  await prisma.user.update({ where: { id: userId }, data });

  // The original also updates the linked author profile's fields in the
  // same edit_user action — this port previously left the profile
  // untouched here (only /admin/my-profile could edit it), which meant
  // admin-side edits to a user's display name/bio/socials silently did
  // nothing.
  await prisma.author.updateMany({
    where: { userId },
    data: {
      ...(fullName ? { fullName } : {}),
      ...(displayName ? { name: displayName } : {}),
      email,
      bio: bio || null,
      facebook: facebook || null,
      twitter: twitter || null,
      instagram: instagram || null,
      linkedin: linkedin || null,
      threads: threads || null,
    },
  });

  await prisma.activityLog.create({
    data: { userId: admin.id, actionType: "user_edit", description: `Edited user ID: ${userId}` },
  });

  revalidatePath("/admin/user-manager");
  redirect("/admin/user-manager?success=updated");
}

export async function changeUserRole(userId: number, role: UserRole): Promise<void> {
  await requirePermission("change_roles");
  await prisma.user.update({
    where: { id: userId },
    data: { role, permissions: JSON.stringify(getDefaultPermissionsForRole(role)) },
  });
  revalidatePath("/admin/user-manager");
}

export async function deleteUser(userId: number): Promise<{ error?: string }> {
  const admin = await requirePermission("delete");
  if (userId === admin.id) {
    return { error: "You cannot delete your own account." };
  }

  const author = await prisma.author.findUnique({ where: { userId } });
  const [postCount, mediaCount] = await Promise.all([
    author ? prisma.post.count({ where: { authorId: author.id } }) : Promise.resolve(0),
    prisma.media.count({ where: { uploadedBy: userId } }),
  ]);
  if (postCount > 0 || mediaCount > 0) {
    return {
      error: `This user still owns ${postCount} post(s) and ${mediaCount} media file(s). Transfer their content to another user first.`,
    };
  }

  await prisma.user.delete({ where: { id: userId } });
  await prisma.activityLog.create({
    data: { userId: admin.id, actionType: "user_delete", description: `Deleted user ID: ${userId}` },
  });
  revalidatePath("/admin/user-manager");
  return {};
}

export interface ContentCounts {
  posts: number;
  media: number;
  logs: number;
}

/** Ports the ajax=user_content lookup in admin/user-manager.php: how much
 *  content a user owns, for the transfer-before-delete UI. */
export async function getUserContentCounts(userId: number): Promise<ContentCounts> {
  const author = await prisma.author.findUnique({ where: { userId } });
  const [posts, media, logs] = await Promise.all([
    author ? prisma.post.count({ where: { authorId: author.id } }) : Promise.resolve(0),
    prisma.media.count({ where: { uploadedBy: userId } }),
    prisma.activityLog.count({ where: { userId } }),
  ]);
  return { posts, media, logs };
}

/**
 * Ports the transfer_content AJAX handler: moves a user's posts (via their
 * author profile) and uploaded media to another user, then logs it. Does
 * NOT delete the source user — call deleteUser() separately afterward.
 */
export async function transferUserContent(
  fromUserId: number,
  toUserId: number
): Promise<{ error?: string; postsMoved?: number; mediaMoved?: number }> {
  const admin = await requirePermission("delete");
  if (!fromUserId || !toUserId || fromUserId === toUserId) {
    return { error: "Invalid users selected." };
  }

  const toAuthor = await prisma.author.findUnique({ where: { userId: toUserId } });
  if (!toAuthor) {
    return { error: "Target user has no author profile to receive posts." };
  }
  const fromAuthor = await prisma.author.findUnique({ where: { userId: fromUserId } });

  const [postsResult, mediaResult] = await Promise.all([
    fromAuthor
      ? prisma.post.updateMany({ where: { authorId: fromAuthor.id }, data: { authorId: toAuthor.id } })
      : Promise.resolve({ count: 0 }),
    prisma.media.updateMany({ where: { uploadedBy: fromUserId }, data: { uploadedBy: toUserId } }),
  ]);

  await prisma.activityLog.create({
    data: {
      userId: admin.id,
      actionType: "content_transfer",
      description: `Transferred all content from user ID ${fromUserId} to user ID ${toUserId} before deletion`,
    },
  });

  revalidatePath("/admin/user-manager");
  return { postsMoved: postsResult.count, mediaMoved: mediaResult.count };
}
