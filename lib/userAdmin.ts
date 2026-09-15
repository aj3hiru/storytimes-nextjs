"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { requireUser, resolvePermissions } from "./auth";
import { getDefaultPermissionsForRole, buildPermissionsFromFormData } from "./permissions";
import type { UserRole, UserStatus } from "@prisma/client";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Real gap fixed here — a genuine privilege-escalation risk found by a
 * different AI session working directly from the reference PHP: this
 * used to return only the acting admin's `User` row. Every caller that
 * needs to decide whether a create/edit submission's own custom
 * "Advance Access" checkbox picks should actually be trusted (vs. an
 * admin without `users.manage_permissions` forging
 * `permissions[...]` form fields to grant themselves or anyone else
 * elevated access the UI never even shows them) needs the ACTING
 * admin's own resolved permissions too, not just their identity.
 */
async function requirePermission(action: "create" | "edit" | "delete" | "change_roles") {
  const user = await requireUser();
  if (!user) redirect("/admin-login");
  const permissions = resolvePermissions(user);
  if (!permissions.users[action]) {
    throw new Error("You do not have permission to manage users.");
  }
  return { user, permissions };
}

/**
 * Builds the permissions JSON to actually save for a created/edited user:
 * uses the caller's own Advance Access checkbox picks ONLY if the acting
 * admin has `users.manage_permissions` — otherwise silently falls back to
 * the plain role defaults, regardless of what the submitted form
 * contains. See requirePermission()'s own comment for the full "why."
 */
function resolveSubmittedPermissions(
  formData: FormData,
  role: UserRole,
  actingAdminCanManagePermissions: boolean
): string {
  const permissions = actingAdminCanManagePermissions
    ? buildPermissionsFromFormData(formData)
    : getDefaultPermissionsForRole(role);
  return JSON.stringify(permissions);
}

/**
 * Reads the extended author-profile fields the reference's own Add/Edit
 * User modal collects (mobile, address, designation, experience,
 * languages, qualifications, certifications, featured flag, author
 * status). Every one of these already existed as a real column on this
 * project's `Author` model — they simply were never wired into the admin
 * create/edit forms, so they could only ever be set by editing the
 * database directly. No schema change needed.
 */
function readAuthorProfileFields(formData: FormData) {
  const s = (k: string) => String(formData.get(k) ?? "").trim() || null;
  return {
    mobileNumber: s("mobileNumber"),
    address: s("address"),
    designation: s("designation"),
    experience: s("experience"),
    languagesKnown: s("languagesKnown"),
    qualifications: s("qualifications"),
    certifications: s("certifications"),
    isFeatured: formData.get("isFeatured") === "on" || formData.get("isFeatured") === "true",
    authorStatus: (String(formData.get("authorStatus") ?? "active") === "pending" ? "pending" : "active") as "active" | "pending",
  };
}

export async function createUser(formData: FormData): Promise<void> {
  const { user: admin, permissions: adminPermissions } = await requirePermission("create");

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
  const profile = readAuthorProfileFields(formData);

  if (!username || !email) throw new Error("Username and email are required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Invalid email address.");
  if (!password) throw new Error("Password is required for new users.");

  const passwordHash = await bcrypt.hash(password, 10);
  const permissions = resolveSubmittedPermissions(formData, role, adminPermissions.users.manage_permissions);

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
      mobileNumber: profile.mobileNumber,
      address: profile.address,
      designation: profile.designation,
      experience: profile.experience,
      languagesKnown: profile.languagesKnown,
      qualifications: profile.qualifications,
      certifications: profile.certifications,
      isFeatured: profile.isFeatured,
      status: profile.authorStatus,
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
  const { user: admin, permissions: adminPermissions } = await requirePermission("edit");

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
  const profile = readAuthorProfileFields(formData);

  const data: Record<string, unknown> = {
    username,
    email,
    role,
    status,
    permissions: resolveSubmittedPermissions(formData, role, adminPermissions.users.manage_permissions),
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
      mobileNumber: profile.mobileNumber,
      address: profile.address,
      designation: profile.designation,
      experience: profile.experience,
      languagesKnown: profile.languagesKnown,
      qualifications: profile.qualifications,
      certifications: profile.certifications,
      isFeatured: profile.isFeatured,
      status: profile.authorStatus,
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
  // Real bug fixed here — found by a different AI session working
  // directly from the reference PHP's own toggle_role action, which
  // only ever updates the `role` column: this used to ALSO silently
  // reset `permissions` back to the plain role defaults every time,
  // discarding any custom Advance Access picks an admin had
  // specifically set for that user. This is the quick role dropdown on
  // the users table (not the full Edit User modal, which legitimately
  // does let an admin choose to reset/re-customize permissions) — it
  // should change only what it visibly changes.
  await prisma.user.update({
    where: { id: userId },
    data: { role },
  });
  revalidatePath("/admin/user-manager");
}

export async function deleteUser(userId: number): Promise<{ error?: string }> {
  const { user: admin } = await requirePermission("delete");
  if (userId === admin.id) {
    return { error: "You cannot delete your own account." };
  }

  const author = await prisma.author.findUnique({ where: { userId } });
  const [postCount, mediaCount, aiLogCount] = await Promise.all([
    author ? prisma.post.count({ where: { authorId: author.id } }) : Promise.resolve(0),
    prisma.media.count({ where: { uploadedBy: userId } }),
    // Real bug fixed here: this pre-check never counted
    // ai_generation_log rows, which have a real, non-nullable FK back
    // to the user (production DB: ON DELETE RESTRICT) — a user who had
    // ever used the AI-generate feature, even with zero posts/media,
    // passed this check cleanly and then hit an UNHANDLED exception at
    // the actual prisma.user.delete() call below (no try/catch existed
    // either), which looked like "delete button does nothing" with no
    // error shown anywhere.
    prisma.aiGenerationLog.count({ where: { userId } }),
  ]);
  if (postCount > 0 || mediaCount > 0 || aiLogCount > 0) {
    return {
      error: `This user still owns ${postCount} post(s), ${mediaCount} media file(s), and ${aiLogCount} AI generation log(s). Transfer their content to another user first.`,
    };
  }

  try {
    await prisma.user.delete({ where: { id: userId } });
  } catch (err) {
    // Real bug fixed here: this call was never wrapped — any OTHER FK
    // this pre-check doesn't know to look for (now or in the future)
    // would throw an unhandled exception here instead of a normal,
    // friendly error result the caller can actually show.
    console.error("Failed to delete user:", err);
    return { error: "Delete failed — this user may still be referenced elsewhere. Please try transferring their content first." };
  }
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
  aiLogs: number;
}

/** Ports the ajax=user_content lookup in admin/user-manager.php: how much
 *  content a user owns, for the transfer-before-delete UI. */
export async function getUserContentCounts(userId: number): Promise<ContentCounts> {
  // Real gap fixed here: this had NO permission check at all — any
  // logged-in user (any role) could call it and see how much content
  // any OTHER user owns, regardless of whether they're allowed to
  // delete/manage users at all.
  await requirePermission("delete");
  const author = await prisma.author.findUnique({ where: { userId } });
  const [posts, media, logs, aiLogs] = await Promise.all([
    author ? prisma.post.count({ where: { authorId: author.id } }) : Promise.resolve(0),
    prisma.media.count({ where: { uploadedBy: userId } }),
    prisma.activityLog.count({ where: { userId } }),
    // Real gap fixed here: not counted at all before, so the
    // transfer-before-delete UI never even knew to appear for a user
    // whose only "content" was AI-generation history — deleteUser()'s
    // own pre-check now catches this too, but the UI needs to know
    // in advance to show the transfer modal rather than a plain
    // confirm dialog.
    prisma.aiGenerationLog.count({ where: { userId } }),
  ]);
  return { posts, media, logs, aiLogs };
}

/**
 * Ports the transfer_content AJAX handler: moves a user's posts (via their
 * author profile), uploaded media, activity logs, and AI generation logs to
 * another user, then logs it. Does NOT delete the source user — call
 * deleteUser() separately afterward.
 */
export async function transferUserContent(
  fromUserId: number,
  toUserId: number
): Promise<{ error?: string; postsMoved?: number; mediaMoved?: number; logsMoved?: number; aiLogsMoved?: number }> {
  const { user: admin } = await requirePermission("delete");
  if (!fromUserId || !toUserId || fromUserId === toUserId) {
    return { error: "Invalid users selected." };
  }

  const toAuthor = await prisma.author.findUnique({ where: { userId: toUserId } });
  if (!toAuthor) {
    return { error: "Target user has no author profile to receive posts." };
  }
  const fromAuthor = await prisma.author.findUnique({ where: { userId: fromUserId } });

  // Real gap fixed here: this only ever transferred posts + media —
  // activity_log and ai_generation_log rows (both with a real FK back
  // to the user) were left behind entirely. For ai_generation_log
  // specifically, that's not just "history lost", it's the actual
  // reason deleteUser() would fail afterward for a user who'd ever
  // used AI-generate: transferring the ROWS (not deleting them) is
  // what lets the FK be satisfied once the source user is deleted.
  const [postsResult, mediaResult, logsResult, aiLogsResult] = await Promise.all([
    fromAuthor
      ? prisma.post.updateMany({ where: { authorId: fromAuthor.id }, data: { authorId: toAuthor.id } })
      : Promise.resolve({ count: 0 }),
    prisma.media.updateMany({ where: { uploadedBy: fromUserId }, data: { uploadedBy: toUserId } }),
    prisma.activityLog.updateMany({ where: { userId: fromUserId }, data: { userId: toUserId } }),
    prisma.aiGenerationLog.updateMany({ where: { userId: fromUserId }, data: { userId: toUserId } }),
  ]);

  await prisma.activityLog.create({
    data: {
      userId: admin.id,
      actionType: "content_transfer",
      description: `Transferred all content from user ID ${fromUserId} to user ID ${toUserId} before deletion`,
    },
  });

  revalidatePath("/admin/user-manager");
  return { postsMoved: postsResult.count, mediaMoved: mediaResult.count, logsMoved: logsResult.count, aiLogsMoved: aiLogsResult.count };
}
