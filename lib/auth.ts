import "server-only";
import { cookies } from "next/headers";
import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import { prisma } from "./db";
import type { UserRole } from "@prisma/client";

// ── Session shape (replaces PHP $_SESSION) ─────────────────────────────────

export interface SessionData {
  userId?: number;
  username?: string;
  role?: UserRole;
  /** stamp compared against app_config.session_version — bump it anywhere
   *  to force-logout every session at once (admin/force-logout-all.php) */
  sessionVersion?: string;
}

const sessionOptions: SessionOptions = {
  cookieName: "storytimes_session",
  password: requireSecretKey(),
  cookieOptions: {
    secure: process.env.APP_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
    maxAge: undefined, // session cookie, matches PHP's lifetime => 0
  },
};

function requireSecretKey(): string {
  const key = process.env.SECRET_KEY;
  if (!key || key.length < 32) {
    // Fail loudly in dev so nobody ships with the placeholder secret.
    throw new Error(
      "SECRET_KEY env var must be set to a random string of at least 32 characters."
    );
  }
  return key;
}

export async function getSession(): Promise<IronSession<SessionData>> {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

/**
 * Mirrors the session_version invalidation block in config.php: if the
 * DB's app_config.session_version has been bumped since this session was
 * issued, the session is treated as logged out.
 *
 * Real bug fixed here: this used to call `session.destroy()` on a
 * mismatch, which — under the hood — writes to the response's Set-Cookie
 * header. This function is called (via requireUser()) from many admin
 * page.tsx Server Components during render, and Next.js explicitly
 * disallows mutating cookies from a plain Server Component render path
 * (only Server Actions and Route Handlers may do so) — calling it there
 * throws at runtime, which surfaced in production as pages randomly
 * "logging the user out" (really: crashing) when opened. Clearing just
 * the in-memory `userId` field (without attempting to write the cookie)
 * is enough for requireUser() to correctly treat the caller as logged
 * out; the cookie itself gets cleared next time the user actually hits
 * the logout route or logs in fresh (both real Route Handlers, where
 * `session.destroy()` is safe to call).
 */
export async function getValidSession(): Promise<IronSession<SessionData>> {
  const session = await getSession();
  if (!session.userId) return session;

  const versionRow = await prisma.appConfig.findUnique({
    where: { configKey: "session_version" },
  });
  const currentVersion = versionRow?.configValue ?? "1";

  if (!session.sessionVersion || session.sessionVersion !== currentVersion) {
    session.userId = undefined;
    return session;
  }
  return session;
}

export async function requireUser() {
  const session = await getValidSession();
  if (!session.userId) return null;
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status !== "active") return null;
  return user;
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
