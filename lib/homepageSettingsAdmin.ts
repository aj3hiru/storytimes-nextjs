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

export async function saveHomepageSettings(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!user || user.role !== "admin") throw new Error("Admin access required.");

  const breadcrumbEnabled = formData.get("breadcrumbEnabled") === "on" ? "1" : "0";
  let breadcrumbText = String(formData.get("breadcrumbText") ?? "Story").trim();
  if (!breadcrumbText) breadcrumbText = "Story";
  breadcrumbText = breadcrumbText.slice(0, 40);
  const postsPerPage = String(Math.max(1, Math.min(30, parseInt(String(formData.get("postsPerPage") ?? "9"), 10) || 9)));

  await Promise.all([
    saveAppConfig("hp_breadcrumb_enabled", breadcrumbEnabled),
    saveAppConfig("hp_breadcrumb_text", breadcrumbText),
    saveAppConfig("hp_posts_per_page", postsPerPage),
  ]);

  revalidateTag("app-config", "max");
  revalidatePath("/admin/homepage-settings");
  redirect("/admin/homepage-settings?success=1");
}
