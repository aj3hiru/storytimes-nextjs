import "server-only";
import { prisma } from "./db";
import type { UserRole } from "@prisma/client";
import { getAuthenticatedUser } from "./authSession";

// ── Session/auth — see lib/authSession.ts for the actual database-backed
//    implementation (a detailed root-cause specification for the
//    recurring "baar baar logout" reports called for replacing the
//    previous pure-encrypted-cookie model with real, revocable session
//    rows). requireUser() keeps its exact previous name/signature/
//    behavior (returns User | null) so every one of its many existing
//    callers across this codebase keeps working unchanged — only the
//    mechanism underneath changed. ───────────────────────────────────

export async function requireUser() {
  return getAuthenticatedUser();
}

// ── Permissions (mirrors getDefaultPermissionsForRole() in
//    admin/user-manager.php and the canManage*/canEdit*/canDelete* helpers
//    in admin/blogs-manager.php). The actual type/skeleton/defaults now
//    live in lib/permissions.ts (a plain, non-"server-only" module) so the
//    Advance Access checkbox panel — a client component — can import the
//    same source of truth instead of duplicating it. Re-exported here so
//    every existing `from "@/lib/auth"` import keeps working. ────────────
import {
  type Permissions,
  PERMISSION_SKELETON,
  getDefaultPermissionsForRole,
  mergePermissions as mergePermissionsImpl,
} from "./permissions";
export type { Permissions };
export { getDefaultPermissionsForRole };

/**
 * True only for people who may manage EVERY post on the site.
 *
 * Real over-permission fixed here: this returned true for `role ===
 * "editor"`, so every editor could edit and delete every post including
 * other editors' teams'. On a site with several editors that's not a
 * hierarchy at all. An editor is now scoped to their own posts plus
 * those of the authors assigned to them — see userManagesPost() below,
 * which is what the edit/delete checks actually fall through to.
 * Site-wide management is now an explicit permission (`blogs.edit_all` /
 * `blogs.delete_all`) that an admin can still grant deliberately.
 */
export function canManageAllPosts(
  role: UserRole,
  permissions: Permissions | null,
  action: "edit" | "delete" = "edit"
): boolean {
  if (role === "admin") return true;
  const key = action === "delete" ? "delete_all" : "edit_all";
  return Boolean(permissions?.blogs?.[key as keyof Permissions["blogs"]]);
}

export async function userOwnsPost(postId: number, userId: number): Promise<boolean> {
  const count = await prisma.post.count({
    where: { id: postId, author: { userId } },
  });
  return count > 0;
}

/**
 * Does this user own the post, OR does it belong to an author assigned
 * to them? The assignment is the same `createdById` relationship that
 * scopes the User Manager list and the analytics view, reused here
 * deliberately so "who I manage", "whose traffic I see" and "whose posts
 * I can edit" can never drift apart.
 */
export async function userManagesPost(postId: number, userId: number): Promise<boolean> {
  if (await userOwnsPost(postId, userId)) return true;
  const count = await prisma.post.count({
    where: { id: postId, author: { user: { createdById: userId } } },
  });
  return count > 0;
}

export async function canEditPost(
  role: UserRole,
  permissions: Permissions | null,
  userId: number,
  postId: number
): Promise<boolean> {
  if (canManageAllPosts(role, permissions, "edit")) return true;
  return userManagesPost(postId, userId);
}

export async function canDeletePost(
  role: UserRole,
  permissions: Permissions | null,
  userId: number,
  postId: number
): Promise<boolean> {
  if (canManageAllPosts(role, permissions, "delete")) return true;
  return userManagesPost(postId, userId);
}

/**
 * Deep-merges a possibly-partial permissions object onto a full skeleton,
 * so every key is guaranteed to exist afterward. This is what actually
 * prevents crashes like `Cannot read properties of undefined (reading
 * 'access_file_manager')`: that happens when a stored permissions JSON
 * predates a permission category being added (or was hand-written/seeded
 * incompletely) and code elsewhere reads `permissions.files.x` assuming
 * `files` always exists. Missing keys fail CLOSED (default false) rather
 * than crashing or silently granting access. (Implementation lives in
 * lib/permissions.ts; re-exported so existing imports keep working.)
 */
const mergePermissions = mergePermissionsImpl;

export function parsePermissions(json: string | null): Permissions | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    // Merge onto the safe all-false skeleton — guarantees every section
    // (including ones added after this JSON was originally written)
    // exists, so reading permissions.files.access_file_manager etc. can
    // never throw regardless of how old or hand-edited the stored JSON is.
    return mergePermissions(PERMISSION_SKELETON, parsed);
  } catch {
    return null;
  }
}

/**
 * The canonical way to get a user's effective permissions — merges
 * whatever is actually stored in `user.permissions` onto the FULL
 * role-appropriate defaults (not the all-false skeleton), so missing
 * keys inherit a sensible value for that role (e.g. an admin missing a
 * newly-added `files` section still gets `files.access_file_manager =
 * true`, not `false`) rather than either crashing or silently
 * under-permissioning a legitimate admin/editor. Replaces the
 * `parsePermissions(user.permissions) ?? getDefaultPermissionsForRole(user.role)`
 * pattern used throughout this codebase — that pattern only covers a
 * completely-null permissions field; it does NOT protect against a
 * non-null-but-partial permissions JSON (e.g. from an older schema
 * version, or a hand-written seed script), which is exactly what caused
 * a real "Cannot read properties of undefined (reading
 * 'access_file_manager')" crash — parsePermissions() still returned a
 * valid non-null object in that case, so the `??` fallback never ran.
 */
export function resolvePermissions(user: { permissions: string | null; role: UserRole }): Permissions {
  const roleDefaults = getDefaultPermissionsForRole(user.role);
  if (!user.permissions) return roleDefaults;
  try {
    const parsed = JSON.parse(user.permissions);
    return mergePermissions(roleDefaults, parsed);
  } catch {
    return roleDefaults;
  }
}
