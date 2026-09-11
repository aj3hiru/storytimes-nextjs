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

export async function saveSidebarSettings(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!user || user.role !== "admin") throw new Error("Admin access required.");

  const homepageSidebarEnabled = formData.get("homepageSidebarEnabled") === "on" ? "1" : "0";
  const homepageSidebarCount = String(
    Math.max(1, Math.min(10, parseInt(String(formData.get("homepageSidebarCount") ?? "6"), 10) || 6))
  );
  const homepageSidebarTitleFontSize = String(
    Math.max(10, Math.min(40, parseInt(String(formData.get("homepageSidebarTitleFontSize") ?? "18"), 10) || 18))
  );

  await Promise.all([
    saveAppConfig("homepage_sidebar_enabled", homepageSidebarEnabled),
    saveAppConfig("homepage_sidebar_count", homepageSidebarCount),
    saveAppConfig("homepage_sidebar_title_font_size", homepageSidebarTitleFontSize),
  ]);

  // Post-page sidebar toggles live inside post_template_settings JSON
  // (read by post.php's $_pt array, rendered by components/post/PostSidebar.tsx).
  const ptRaw = (await prisma.appConfig.findUnique({ where: { configKey: "post_template_settings" } }))?.configValue;
  let pt: Record<string, unknown> = {};
  try {
    pt = ptRaw ? JSON.parse(ptRaw) : {};
  } catch {
    pt = {};
  }
  pt.sidebar = formData.get("postSidebarEnabled") === "on";
  pt.sidebar_latest = formData.get("sidebarLatest") === "on";
  pt.sidebar_latest_count = Math.max(1, Math.min(10, parseInt(String(formData.get("sidebarLatestCount") ?? "5"), 10) || 5));
  pt.sidebar_trending = formData.get("sidebarTrending") === "on";
  pt.sidebar_trending_count = Math.max(1, Math.min(10, parseInt(String(formData.get("sidebarTrendingCount") ?? "5"), 10) || 5));
  pt.sidebar_title_font_size = Math.max(
    10,
    Math.min(40, parseInt(String(formData.get("postSidebarTitleFontSize") ?? "18"), 10) || 18)
  );
  await saveAppConfig("post_template_settings", JSON.stringify(pt));

  revalidateTag("app-config", "max");
  revalidateTag("post-template", "max");
  revalidatePath("/admin/sidebar-settings");
  redirect("/admin/sidebar-settings?success=1");
}
