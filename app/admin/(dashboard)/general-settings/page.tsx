import { headers } from "next/headers";
import { guardPage } from "@/lib/pageGuard";
import { getAppConfig, getSiteSettings } from "@/lib/config";
import { GeneralSettingsForm } from "@/components/admin/GeneralSettingsForm";

export default async function GeneralSettingsPage({ searchParams }: { searchParams: Promise<{ success?: string }> }) {
  const denied = await guardPage((p) => p.settings.general, "Only users with Settings access can change general settings.");
  if (denied) return denied;

  const { success } = await searchParams;
  const [appConfig, siteSettings] = await Promise.all([getAppConfig(), getSiteSettings()]);
  const host = (await headers()).get("host") ?? "";

  return (
    <GeneralSettingsForm
      key={success ?? "initial"}
      saved={Boolean(success)}
      values={{
        siteTitle: appConfig.site_title ?? "",
        siteTagline: appConfig.site_tagline ?? "",
        siteUrl: appConfig.site_url?.trim() || (host ? `https://${host}` : ""),
        adminEmail: appConfig.admin_email ?? "",
        metaDescription: appConfig.meta_description ?? "",
        metaKeywords: appConfig.meta_keywords ?? "",
        homepageSidebarEnabled: (appConfig.homepage_sidebar_enabled ?? "1") === "1",
        siteLogo: siteSettings.site_logo ?? "",
        siteFavicon: appConfig.site_favicon ?? "",
        logoWidth: parseInt(siteSettings.logo_width ?? "150", 10) || 150,
        logoHeight: parseInt(siteSettings.logo_height ?? "48", 10) || 48,
        headerShowsLogo: (siteSettings.display_mode ?? "logo") !== "text",
        siteLanguage: appConfig.site_language ?? "en",
        timezone: appConfig.timezone ?? "UTC",
        dateFormat: appConfig.date_format ?? "M j, Y",
        timeFormat: appConfig.time_format ?? "g:i A",
        weekStarts: appConfig.week_starts ?? "monday",
      }}
    />
  );
}
