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
//    in admin/blogs-manager.php) ─────────────────────────────────────────

export interface Permissions {
  dashboard_access: boolean;
  blogs: {
    create: boolean; edit_own: boolean; edit_all: boolean;
    delete_own: boolean; delete_all: boolean; publish: boolean;
    unpublish: boolean; schedule: boolean; feature: boolean;
    manage_categories: boolean; manage_tags: boolean; manage_comments: boolean;
    view_drafts: boolean; manage_seo: boolean;
  };
  media: { upload: boolean; delete: boolean; manage_all: boolean };
  users: {
    create: boolean; edit: boolean; delete: boolean;
    suspend: boolean; change_roles: boolean; manage_permissions: boolean;
  };
  authors: { create: boolean; edit: boolean; delete: boolean; approve: boolean; feature: boolean };
  analytics: { view_basic: boolean; view_advanced: boolean };
  ads: { manage_ads: boolean; view_revenue: boolean };
  settings: {
    general: boolean; seo: boolean; smtp: boolean;
    api_keys: boolean; maintenance_mode: boolean;
  };
  pages: { create: boolean; edit: boolean; delete: boolean };
  files: { access_file_manager: boolean };
  security: { view_logs: boolean; manage_blacklist: boolean; manage_recaptcha: boolean };
}

function allTrue<T extends object>(obj: T): T {
  const out = {} as T;
  for (const k of Object.keys(obj) as (keyof T)[]) {
    const v = obj[k];
    out[k] = (typeof v === "object" && v !== null ? allTrue(v) : (true as never)) as T[keyof T];
  }
  return out;
}

const PERMISSION_SKELETON: Permissions = {
  dashboard_access: false,
  blogs: {
    create: false, edit_own: false, edit_all: false, delete_own: false, delete_all: false,
    publish: false, unpublish: false, schedule: false, feature: false,
    manage_categories: false, manage_tags: false, manage_comments: false,
    view_drafts: false, manage_seo: false,
  },
  media: { upload: false, delete: false, manage_all: false },
  users: { create: false, edit: false, delete: false, suspend: false, change_roles: false, manage_permissions: false },
  authors: { create: false, edit: false, delete: false, approve: false, feature: false },
  analytics: { view_basic: false, view_advanced: false },
  ads: { manage_ads: false, view_revenue: false },
  settings: { general: false, seo: false, smtp: false, api_keys: false, maintenance_mode: false },
  pages: { create: false, edit: false, delete: false },
  files: { access_file_manager: false },
  security: { view_logs: false, manage_blacklist: false, manage_recaptcha: false },
};

export function getDefaultPermissionsForRole(role: UserRole): Permissions {
  if (role === "admin") return allTrue(structuredClone(PERMISSION_SKELETON));

  if (role === "editor") {
    const p = structuredClone(PERMISSION_SKELETON);
    p.dashboard_access = true;
    Object.assign(p.blogs, {
      create: true, edit_own: true, edit_all: true, delete_own: true, delete_all: true,
      publish: true, unpublish: true, schedule: true, feature: true,
      manage_categories: true, manage_tags: true, manage_comments: true,
      view_drafts: true, manage_seo: true,
    });
    Object.assign(p.media, { upload: true, delete: true, manage_all: true });
    Object.assign(p.analytics, { view_basic: true, view_advanced: true });
    Object.assign(p.pages, { create: true, edit: true, delete: true });
    p.files.access_file_manager = true;
    return p;
  }

  // author: only their own posts, no site-wide settings access
  const p = structuredClone(PERMISSION_SKELETON);
  p.dashboard_access = true;
  Object.assign(p.blogs, { create: true, edit_own: true, delete_own: true, view_drafts: true });
  Object.assign(p.media, { upload: true, delete: true });
  Object.assign(p.analytics, { view_basic: true });
  return p;
}

export function canManageAllPosts(
  role: UserRole,
  permissions: Permissions | null,
  action: "edit" | "delete" = "edit"
): boolean {
  if (role === "admin" || role === "editor") return true;
  const key = action === "delete" ? "delete_all" : "edit_all";
  return Boolean(permissions?.blogs?.[key as keyof Permissions["blogs"]]);
}

export async function userOwnsPost(postId: number, userId: number): Promise<boolean> {
  const count = await prisma.post.count({
    where: { id: postId, author: { userId } },
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
  return userOwnsPost(postId, userId);
}

export async function canDeletePost(
  role: UserRole,
  permissions: Permissions | null,
  userId: number,
  postId: number
): Promise<boolean> {
  if (canManageAllPosts(role, permissions, "delete")) return true;
  return userOwnsPost(postId, userId);
}

/**
 * Deep-merges a possibly-partial permissions object onto a full skeleton,
 * so every key is guaranteed to exist afterward. This is what actually
 * prevents crashes like `Cannot read properties of undefined (reading
 * 'access_file_manager')`: that happens when a stored permissions JSON
 * predates a permission category being added (or was hand-written/seeded
 * incompletely) and code elsewhere reads `permissions.files.x` assuming
 * `files` always exists. Missing keys fail CLOSED (default false) rather
 * than crashing or silently granting access.
 */
function mergePermissions(base: Permissions, partial: unknown): Permissions {
  if (typeof partial !== "object" || partial === null) return base;
  const result = structuredClone(base) as unknown as Record<string, unknown>;
  const src = partial as Record<string, unknown>;

  for (const key of Object.keys(result)) {
    const baseVal = result[key];
    const srcVal = src[key];
    if (srcVal === undefined) continue; // missing entirely — keep the safe base value
    if (typeof baseVal === "boolean") {
      if (typeof srcVal === "boolean") result[key] = srcVal;
    } else if (typeof baseVal === "object" && baseVal !== null && typeof srcVal === "object" && srcVal !== null) {
      const mergedSection = { ...(baseVal as Record<string, unknown>) };
      for (const subKey of Object.keys(baseVal as Record<string, unknown>)) {
        const subVal = (srcVal as Record<string, unknown>)[subKey];
        if (typeof subVal === "boolean") mergedSection[subKey] = subVal;
      }
      result[key] = mergedSection;
    }
  }
  return result as unknown as Permissions;
}

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
