import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "./db";

export interface NavItem {
  label: string;
  url: string;
}

export interface HeaderSettings {
  logoUrl: string;
  logoWidth: number;
  logoHeight: number;
  displayMode: "logo" | "text";
  showSearchBtn: boolean;
  showDarkmode: boolean;
  showTagline: boolean;
  siteTitle: string;
  headerDesign: "modern" | "classic";
}

const DEFAULT_NAV_ITEMS: NavItem[] = [
  { label: "Home", url: "/" },
  { label: "Categories", url: "/categories" },
  { label: "About Us", url: "/about-us" },
  { label: "Contact Us", url: "/contact-us" },
];

/**
 * Mirrors the $pdo->query(...) IN ('site_logo','logo_width',...) call at
 * the top of components/header.php. PERSISTENTLY cached (see the comment
 * on getAppConfig in lib/config.ts for why) — the header renders on
 * literally every public page, so this is the single highest-value query
 * to take off the per-request path. Invalidated via the "header-settings"
 * tag whenever Header Customizer saves.
 */
const getHeaderSettingsCached = unstable_cache(
  async (): Promise<HeaderSettings> => {
  try {
    const rows = await prisma.siteSetting.findMany({
      where: {
        settingKey: {
          in: [
            "site_logo", "logo_width", "logo_height", "display_mode",
            "show_search_btn", "show_darkmode", "show_tagline",
            "site_title", "header_design",
          ],
        },
      },
    });
    const kv = Object.fromEntries(rows.map((r) => [r.settingKey, r.settingValue ?? ""]));

    const headerDesign = kv.header_design === "classic" ? "classic" : "modern";

    return {
      logoUrl: kv.site_logo ?? "",
      logoWidth: parseInt(kv.logo_width ?? "150", 10) || 150,
      logoHeight: parseInt(kv.logo_height ?? "48", 10) || 48,
      displayMode: kv.display_mode === "text" ? "text" : "logo",
      showSearchBtn: (kv.show_search_btn ?? "1") === "1",
      showDarkmode: (kv.show_darkmode ?? "0") === "1",
      showTagline: (kv.show_tagline ?? "0") === "1",
      siteTitle: kv.site_title || "Site",
      headerDesign,
    };
  } catch {
    return {
      logoUrl: "", logoWidth: 150, logoHeight: 48, displayMode: "logo",
      showSearchBtn: true, showDarkmode: false, showTagline: false,
      siteTitle: "Site", headerDesign: "modern",
    };
  }
  },
  ["header-settings"],
  { revalidate: 300, tags: ["header-settings"] }
);
export const getHeaderSettings = cache(getHeaderSettingsCached);

/** Mirrors the app_config('nav_menu_items') JSON lookup in components/header.php.
 *  Persistently cached — same reasoning as getHeaderSettings above. */
const getNavItemsCached = unstable_cache(
  async (): Promise<NavItem[]> => {
  try {
    const row = await prisma.appConfig.findUnique({ where: { configKey: "nav_menu_items" } });
    if (!row?.configValue) return DEFAULT_NAV_ITEMS;
    const parsed = JSON.parse(row.configValue);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed.map((i) => ({ label: String(i.label ?? ""), url: String(i.url ?? "#") }));
    }
    return DEFAULT_NAV_ITEMS;
  } catch {
    return DEFAULT_NAV_ITEMS;
  }
  },
  ["nav-items"],
  { revalidate: 300, tags: ["nav-items"] }
);
export const getNavItems = cache(getNavItemsCached);
