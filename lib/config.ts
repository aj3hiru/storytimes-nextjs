import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { resolveMediaUrl } from "./urls";

/**
 * Mirrors includes/config.php:
 *   - `app_config`   → key/value settings edited from admin/general-settings.php,
 *                      admin/performance-settings.php, admin/homepage-settings.php, etc.
 *   - `site_settings` → currently just `site_logo` in the original, kept separate
 *                      for parity/back-compat.
 *
 * PERFORMANCE: this used to be wrapped in React's `cache()` only, which
 * dedupes calls WITHIN a single request but still re-queries the DB on
 * every single page render (every visitor, every post, every navigation)
 * — the opposite of "header/footer settings are shared and don't reload".
 * `unstable_cache` is Next.js's PERSISTENT data cache: the result is
 * reused across every request/every page for up to 5 minutes, and the
 * `"app-config"` tag lets admin saves (general-settings, header/footer
 * customizer, etc.) invalidate it immediately via `revalidateTag()`
 * instead of waiting out the 5 minutes. The inner `cache()` wrapper is
 * kept too, so multiple calls within the same request/render still only
 * touch the outer cache once.
 */
const getAppConfigCached = unstable_cache(
  async (): Promise<Record<string, string>> => {
    try {
      const rows = await prisma.appConfig.findMany();
      return Object.fromEntries(rows.map((r) => [r.configKey, r.configValue ?? ""]));
    } catch {
      // Matches config.php's try/catch around the app_config query — a
      // config-table failure should not take the whole site down.
      return {};
    }
  },
  ["app-config"],
  { revalidate: 300, tags: ["app-config"] }
);
export const getAppConfig = cache(getAppConfigCached);

const getSiteSettingsCached = unstable_cache(
  async (): Promise<Record<string, string>> => {
    try {
      const rows = await prisma.siteSetting.findMany();
      return Object.fromEntries(rows.map((r) => [r.settingKey, r.settingValue ?? ""]));
    } catch {
      return {};
    }
  },
  ["site-settings"],
  { revalidate: 300, tags: ["site-settings"] }
);
export const getSiteSettings = cache(getSiteSettingsCached);

export interface ResolvedSiteConfig {
  siteName: string;
  siteUrl: string;
  siteLogo: string;
  seoDefaultImage: string;
  contactEmail: string;
  companyAddress: string;
  phoneNumber: string;
  siteTagline: string;
  seoDefaultTitle: string;
  seoDefaultDescription: string;
  headerDesign: "modern" | "classic";
}

const DEFAULT_ROBOTS =
  "index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1";
export const SEO_DEFAULT_ROBOTS = DEFAULT_ROBOTS;
export const SEO_DEFAULT_TYPE = "website";
export const POSTS_PER_PAGE = 9;
export const COMMENTS_PER_PAGE = 20;

/**
 * Resolves the same set of constants config.php `define()`s per-request
 * (SITE_NAME, SITE_URL, SEO_DEFAULT_TITLE, ...), falling back the same way
 * the PHP does when a value hasn't been configured yet.
 */
export async function resolveSiteConfig(currentDomain: string): Promise<ResolvedSiteConfig> {
  const [appConfig, siteSettings] = await Promise.all([getAppConfig(), getSiteSettings()]);

  const siteName = appConfig.site_title?.trim() || "My Site";
  // Real bug fixed here (a systemic version of the same "localhost leaks
  // into production" class of bug documented elsewhere in this project):
  // 23 different call sites across this codebase call
  // resolveSiteConfig("") — passing an empty string for `currentDomain`
  // — because most of them have no request context to detect a real
  // domain from (Server Actions, cron routes, email senders). If
  // app_config.site_url ALSO isn't set in the DB, siteUrl used to
  // resolve to `"" || "" = ""`, an empty string — harmless for most of
  // those 23 callers (empty-string concatenation just produces a
  // slightly malformed but non-crashing URL), but `new URL("")` (used by
  // app/layout.tsx's metadataBase) throws outright, which would have
  // crashed every single page. Guaranteeing a non-empty fallback HERE,
  // once, protects every caller at once rather than special-casing each
  // of the 23 call sites individually.
  const siteUrl = appConfig.site_url?.trim().replace(/\/+$/, "") || currentDomain || "http://localhost:3000";
  // site_logo is stored as a RAW local-storage key (e.g. "uploads/x.png",
  // same convention as media.filePath) when uploaded through the admin —
  // resolveMediaUrl() turns that into the actual /api/media/file URL.
  // Real bug fixed here: this used to use the raw stored value directly
  // as an <img src>, which 404'd once uploads moved to local-disk
  // storage (an absolute http(s) URL, e.g. an admin-pasted external
  // logo link, passes through resolveMediaUrl() unchanged, so that case
  // still works too).
  const rawLogo = siteSettings.site_logo?.trim();
  const siteLogo = rawLogo ? resolveMediaUrl(rawLogo) : `${siteUrl}/assets/img/logo.webp`;
  // OpenGraph/Twitter meta tags require an ABSOLUTE URL, unlike siteLogo
  // above (used as a same-origin <img src>, where a relative path is
  // fine) — prepend siteUrl unless resolveMediaUrl() already returned a
  // full external URL untouched.
  const seoDefaultImage = rawLogo
    ? /^https?:\/\//i.test(resolveMediaUrl(rawLogo))
      ? resolveMediaUrl(rawLogo)
      : `${siteUrl}${resolveMediaUrl(rawLogo)}`
    : `${siteUrl}/assets/img/seo_og_default.png`;
  const siteTagline = appConfig.site_tagline?.trim() || "";
  const contactEmail =
    appConfig.admin_email?.trim() || `contact@${safeHost(siteUrl)}`;

  return {
    siteName,
    siteUrl,
    siteLogo,
    seoDefaultImage,
    contactEmail,
    companyAddress: appConfig.company_address?.trim() || "",
    phoneNumber: appConfig.phone_number?.trim() || "",
    siteTagline,
    seoDefaultTitle: siteTagline ? `${siteName} | ${siteTagline}` : siteName,
    seoDefaultDescription:
      appConfig.meta_description?.trim() || `Read the latest stories on ${siteName}.`,
    headerDesign: appConfig.header_design === "classic" ? "classic" : "modern",
  };
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "example.com";
  }
}

/** perf_* toggles from Performance Settings (admin/performance-settings.php) */
export interface PerfSettings {
  systemFont: boolean;
  gzip: boolean;
  cacheHeaders: boolean;
  cacheDurationSeconds: number;
}

export async function getPerfSettings(): Promise<PerfSettings> {
  const appConfig = await getAppConfig();
  return {
    systemFont: appConfig.perf_system_font === "1",
    gzip: appConfig.perf_gzip === "1",
    cacheHeaders: appConfig.perf_cache_headers === "1",
    cacheDurationSeconds: parseInt(appConfig.perf_cache_duration ?? "0", 10) || 0,
  };
}
