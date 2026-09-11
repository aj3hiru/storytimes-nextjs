"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { requireUser } from "./auth";

async function saveAppConfig(key: string, value: string) {
  await prisma.appConfig.upsert({
    where: { configKey: key },
    create: { configKey: key, configValue: value },
    update: { configValue: value },
  });
}

async function saveSiteSetting(key: string, value: string) {
  await prisma.siteSetting.upsert({
    where: { settingKey: key },
    create: { settingKey: key, settingValue: value },
    update: { settingValue: value },
  });
}

export async function saveGeneralSettings(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!user || user.role !== "admin") throw new Error("Admin access required.");

  const siteTitle = String(formData.get("siteTitle") ?? "").trim();
  const siteTagline = String(formData.get("siteTagline") ?? "").trim();
  const siteUrl = String(formData.get("siteUrl") ?? "").trim();
  const adminEmail = String(formData.get("adminEmail") ?? "").trim();
  const metaDescription = String(formData.get("metaDescription") ?? "").trim();
  const metaKeywords = String(formData.get("metaKeywords") ?? "").trim();
  const homepageSidebarEnabled = formData.get("homepageSidebarEnabled") === "on" ? "1" : "0";
  const siteLogo = String(formData.get("siteLogo") ?? "").trim();
  const siteFavicon = String(formData.get("siteFavicon") ?? "").trim();
  const logoWidth = String(Math.max(40, Math.min(300, parseInt(String(formData.get("logoWidth") ?? "150"), 10) || 150)));
  const logoHeight = String(Math.max(20, Math.min(100, parseInt(String(formData.get("logoHeight") ?? "48"), 10) || 48)));
  const siteLanguage = String(formData.get("siteLanguage") ?? "en").trim() || "en";
  const timezone = String(formData.get("timezone") ?? "UTC").trim() || "UTC";
  const dateFormat = String(formData.get("dateFormat") ?? "M j, Y").trim() || "M j, Y";
  const timeFormat = String(formData.get("timeFormat") ?? "g:i A").trim() || "g:i A";
  const weekStarts = String(formData.get("weekStarts") ?? "monday").trim() || "monday";

  await Promise.all([
    saveAppConfig("site_title", siteTitle),
    saveAppConfig("site_tagline", siteTagline),
    saveAppConfig("site_url", siteUrl),
    saveAppConfig("admin_email", adminEmail),
    saveAppConfig("meta_description", metaDescription),
    saveAppConfig("meta_keywords", metaKeywords),
    saveAppConfig("homepage_sidebar_enabled", homepageSidebarEnabled),
    saveAppConfig("site_language", siteLanguage),
    saveAppConfig("timezone", timezone),
    saveAppConfig("date_format", dateFormat),
    saveAppConfig("time_format", timeFormat),
    saveAppConfig("week_starts", weekStarts),
    saveAppConfig("site_favicon", siteFavicon),
    saveSiteSetting("site_title", siteTitle),
    saveSiteSetting("site_logo", siteLogo),
    saveSiteSetting("logo_width", logoWidth),
    saveSiteSetting("logo_height", logoHeight),
  ]);

  revalidateTag("app-config", "max");
  revalidateTag("site-settings", "max");
  revalidateTag("header-settings", "max"); // site_title/logo also feed the header
  revalidatePath("/admin/general-settings");
  redirect("/admin/general-settings?success=1");
}
