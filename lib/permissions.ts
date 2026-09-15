import type { UserRole } from "@prisma/client";

// ── Permissions (mirrors getDefaultPermissionsForRole() / DEFAULT_PERMISSIONS
//    in the reference admin/user-manager.php). Deliberately excludes the
//    `push_notifications` and `ecommerce` groups from that reference — this
//    is a blog/news CMS, not an e-commerce site, and neither feature exists
//    here, so those permission groups would just be dead checkboxes. ──────────

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
  /* Tools + Templates & Pages — added because the admin sidebar exposes
     these sections but the permission model had no way to grant or
     withhold them, so they silently fell back to role defaults with no
     per-user control at all. */
  tools: { import_export: boolean; backup_restore: boolean; cache_manager: boolean };
  templates: { post_template: boolean; sidebar_settings: boolean; manage_pages: boolean };
  security: { view_logs: boolean; manage_blacklist: boolean; manage_recaptcha: boolean };
}

export function allTrue<T extends object>(obj: T): T {
  const out = {} as T;
  for (const k of Object.keys(obj) as (keyof T)[]) {
    const v = obj[k];
    out[k] = (typeof v === "object" && v !== null ? allTrue(v) : (true as never)) as T[keyof T];
  }
  return out;
}

export const PERMISSION_SKELETON: Permissions = {
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
  tools: { import_export: false, backup_restore: false, cache_manager: false },
  templates: { post_template: false, sidebar_settings: false, manage_pages: false },
  security: { view_logs: false, manage_blacklist: false, manage_recaptcha: false },
};

/** Group + field labels shown in the "Advance Access" panel — matches the
 *  reference's $labels array so the UI reads the same way. */
export const PERMISSION_LABELS: {
  [K in keyof Permissions]: Permissions[K] extends boolean ? string : Record<keyof Permissions[K], string>;
} = {
  dashboard_access: "Dashboard Access",
  blogs: {
    create: "Create", edit_own: "Edit Own", edit_all: "Edit All",
    delete_own: "Delete Own", delete_all: "Delete All", publish: "Publish",
    unpublish: "Unpublish", schedule: "Schedule", feature: "Feature",
    manage_categories: "Categories", manage_tags: "Tags", manage_comments: "Comments",
    view_drafts: "View Drafts", manage_seo: "Manage SEO",
  },
  media: { upload: "Upload", delete: "Delete", manage_all: "Manage All" },
  users: { create: "Create", edit: "Edit", delete: "Delete", suspend: "Suspend", change_roles: "Change Roles", manage_permissions: "Manage Permissions" },
  authors: { create: "Create", edit: "Edit", delete: "Delete", approve: "Approve", feature: "Feature" },
  analytics: { view_basic: "Basic Analytics", view_advanced: "Advanced Analytics" },
  ads: { manage_ads: "Manage Ads", view_revenue: "View Revenue" },
  settings: { general: "General", seo: "SEO", smtp: "SMTP", api_keys: "API Keys", maintenance_mode: "Maintenance" },
  pages: { create: "Create", edit: "Edit", delete: "Delete" },
  files: { access_file_manager: "File Manager" },
  tools: { import_export: "Import & Export", backup_restore: "Backup & Restore", cache_manager: "Cache Manager" },
  templates: { post_template: "Post Template", sidebar_settings: "Sidebar Settings", manage_pages: "Pages" },
  security: { view_logs: "View Logs", manage_blacklist: "Blacklist", manage_recaptcha: "reCAPTCHA" },
};

export const PERMISSION_GROUP_ICONS: Record<keyof Permissions, string> = {
  dashboard_access: "fa-tachometer-alt",
  blogs: "fa-blog",
  media: "fa-photo-video",
  users: "fa-users",
  authors: "fa-feather-alt",
  analytics: "fa-chart-bar",
  ads: "fa-ad",
  settings: "fa-cog",
  pages: "fa-file-alt",
  files: "fa-folder",
  tools: "fa-toolbox",
  templates: "fa-sitemap",
  security: "fa-shield-alt",
};

export const PERMISSION_GROUP_LABELS: Record<keyof Permissions, string> = {
  dashboard_access: "Dashboard Access",
  blogs: "Blogs",
  media: "Media",
  users: "Users",
  authors: "Authors",
  analytics: "Analytics",
  ads: "Ads",
  settings: "Settings",
  pages: "Pages",
  files: "Files",
  tools: "Tools",
  templates: "Templates & Pages",
  security: "Security",
};

/** Order groups are rendered in the panel — matches PERMISSION_SKELETON's
 *  own key order (object.keys order is insertion order in JS, but this is
 *  kept explicit so re-ordering the skeleton later can't silently reorder
 *  the UI). */
export const PERMISSION_GROUP_ORDER = Object.keys(PERMISSION_SKELETON) as (keyof Permissions)[];

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
    Object.assign(p.templates, { post_template: true, sidebar_settings: true, manage_pages: true });
    // Deliberately NOT granting tools.* to editors: Import/Export, Backup
    // & Restore and Cache Manager are site-wide destructive operations,
    // not content work. Admins get them via allTrue(); an editor who
    // genuinely needs one can be granted it individually.
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

/**
 * Deep-merges a possibly-partial permissions object onto a full skeleton,
 * so every key is guaranteed to exist afterward. Missing keys fail CLOSED
 * (default false) rather than crashing or silently granting access.
 */
export function mergePermissions(base: Permissions, partial: unknown): Permissions {
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
    return mergePermissions(PERMISSION_SKELETON, parsed);
  } catch {
    return null;
  }
}

/**
 * Reads `permissions[group][subkey]` (and flat `permissions[dashboard_access]`)
 * checkbox entries off a submitted FormData and builds a full Permissions
 * object — mirrors buildPermissionsJson() in the reference PHP. Browsers
 * don't nest bracketed field names the way PHP's $_POST does, so each
 * checkbox arrives as a literal "permissions[blogs][create]" key; we look
 * each one up individually against the skeleton (unchecked boxes are simply
 * absent from FormData, which is standard HTML checkbox behavior).
 */
export function buildPermissionsFromFormData(formData: FormData): Permissions {
  const result = structuredClone(PERMISSION_SKELETON) as unknown as Record<string, unknown>;
  for (const key of Object.keys(result)) {
    const baseVal = result[key];
    if (typeof baseVal === "boolean") {
      result[key] = formData.has(`permissions[${key}]`);
    } else if (typeof baseVal === "object" && baseVal !== null) {
      const section = { ...(baseVal as Record<string, unknown>) };
      for (const subKey of Object.keys(section)) {
        section[subKey] = formData.has(`permissions[${key}][${subKey}]`);
      }
      result[key] = section;
    }
  }
  return result as unknown as Permissions;
}
