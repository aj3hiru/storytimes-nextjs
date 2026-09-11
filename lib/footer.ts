import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "./db";

export interface FooterLink {
  label: string;
  url: string;
  enabled?: boolean;
}

export interface FooterGroup {
  title: string;
  enabled?: boolean;
  links: FooterLink[];
}

export interface FooterSettings {
  newsletter: {
    enabled: boolean;
    title: string;
    subtitle: string;
    placeholder: string;
    button_text: string;
    action_url: string;
  };
  brand: {
    enabled: boolean;
    logo_url: string;
    about: string;
    address: string;
    email: string;
    phone: string;
  };
  groups: FooterGroup[];
  copyright_text: string;
  sections: { newsletter: boolean; brand: boolean; groups: boolean; copyright: boolean };
}

/**
 * Fixed brand palette — ported from the new components/footer.php, which
 * deliberately strips any saved bg_color/text_color/etc keys
 * (`unset($footer['bg_color'], ...)` in the admin page) rather than
 * exposing them as settings. Purple background per your instruction.
 */
export const FOOTER_PALETTE = {
  background: "#652074",
  newsletterBackground: "#7b238b",
  surface: "#202438",
  text: "#f4f6fb",
  muted: "rgba(244,246,251,.72)",
  line: "rgba(244,246,251,.16)",
  accent: "#ffb400",
};

const DEFAULTS: FooterSettings = {
  newsletter: {
    enabled: false,
    title: "",
    subtitle: "",
    placeholder: "",
    button_text: "",
    action_url: "",
  },
  brand: {
    enabled: true,
    logo_url: "",
    about: "",
    address: "",
    email: "",
    phone: "",
  },
  groups: [],
  copyright_text: "",
  sections: { newsletter: false, brand: true, groups: false, copyright: false },
};

/** Ports the $footerDefaults merge logic in the new components/footer.php.
 *  Persistently cached (see lib/config.ts's getAppConfig comment) —
 *  invalidated via the "footer-settings" tag when Footer Customizer saves. */
const getFooterSettingsCached = unstable_cache(
  async (): Promise<FooterSettings> => {
  try {
    const row = await prisma.appConfig.findUnique({ where: { configKey: "footer_settings" } });
    if (!row?.configValue) return DEFAULTS;
    const saved = JSON.parse(row.configValue);
    if (typeof saved !== "object" || saved === null) return DEFAULTS;

    const merged: FooterSettings = {
      ...DEFAULTS,
      newsletter: { ...DEFAULTS.newsletter, ...(saved.newsletter ?? {}) },
      brand: { ...DEFAULTS.brand, ...(saved.brand ?? {}) },
      sections: { ...DEFAULTS.sections, ...(saved.sections ?? {}) },
      groups: Array.isArray(saved.groups) && saved.groups.length > 0 ? saved.groups : DEFAULTS.groups,
      copyright_text:
        typeof saved.copyright_text === "string" ? saved.copyright_text : DEFAULTS.copyright_text,
    };
    return merged;
  } catch {
    return DEFAULTS;
  }
  },
  ["footer-settings"],
  { revalidate: 300, tags: ["footer-settings"] }
);
export const getFooterSettings = cache(getFooterSettingsCached);
