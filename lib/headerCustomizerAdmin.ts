"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { requireUser } from "./auth";

async function saveSiteSetting(key: string, value: string) {
  await prisma.siteSetting.upsert({
    where: { settingKey: key },
    create: { settingKey: key, settingValue: value },
    update: { settingValue: value },
  });
}
async function saveAppConfig(key: string, value: string) {
  await prisma.appConfig.upsert({
    where: { configKey: key },
    create: { configKey: key, configValue: value },
    update: { configValue: value },
  });
}

export async function saveHeaderSettings(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!user || user.role !== "admin") throw new Error("Admin access required.");

  const headerDesign = String(formData.get("headerDesign") ?? "modern") === "classic" ? "classic" : "modern";
  const displayMode = String(formData.get("displayMode") ?? "logo") === "text" ? "text" : "logo";
  const showSearchBtn = formData.get("showSearchBtn") === "on" ? "1" : "0";
  const showDarkmode = formData.get("showDarkmode") === "on" ? "1" : "0";
  const showTagline = formData.get("showTagline") === "on" ? "1" : "0";

  await Promise.all([
    saveSiteSetting("header_design", headerDesign),
    saveSiteSetting("display_mode", displayMode),
    saveSiteSetting("show_search_btn", showSearchBtn),
    saveSiteSetting("show_darkmode", showDarkmode),
    saveSiteSetting("show_tagline", showTagline),
  ]);

  revalidateTag("header-settings", "max");
  revalidatePath("/admin/header-customizer");
  redirect("/admin/header-customizer?success=1");
}

export async function saveNavMenuItems(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!user || user.role !== "admin") throw new Error("Admin access required.");

  const labels = formData.getAll("navLabel") as string[];
  const urls = formData.getAll("navUrl") as string[];
  const items = labels
    .map((label, i) => ({ label: label.trim(), url: (urls[i] ?? "").trim() }))
    .filter((item) => item.label && item.url);

  await saveAppConfig("nav_menu_items", JSON.stringify(items));

  revalidateTag("nav-items", "max");
  revalidatePath("/admin/header-customizer");
  redirect("/admin/header-customizer?success=nav");
}
