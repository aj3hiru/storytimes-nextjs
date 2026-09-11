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

export async function savePerformanceSettings(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!user || user.role !== "admin") throw new Error("Admin access required.");

  const systemFont = formData.get("systemFont") === "on" ? "1" : "0";
  const cacheHeaders = formData.get("cacheHeaders") === "on" ? "1" : "0";
  const cacheDuration = String(
    Math.max(0, Math.min(86400, parseInt(String(formData.get("cacheDuration") ?? "60"), 10) || 60))
  );

  await Promise.all([
    saveAppConfig("perf_system_font", systemFont),
    saveAppConfig("perf_cache_headers", cacheHeaders),
    saveAppConfig("perf_cache_duration", cacheDuration),
  ]);

  revalidateTag("app-config", "max");
  revalidatePath("/admin/performance-settings");
  redirect("/admin/performance-settings?success=1");
}
