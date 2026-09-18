"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { requireUser } from "./auth";

const ALLOWED_PERCENTS = [5, 10, 20, 30, 40, 50];

async function requireAdmin() {
  const user = await requireUser();
  if (!user || user.role !== "admin") {
    throw new Error("Admin access required.");
  }
  return user;
}

export async function saveAdjustmentRule(formData: FormData): Promise<void> {
  const admin = await requireAdmin();

  // New feature, no PHP equivalent — per explicit request: a rule can
  // target ALL countries at once instead of one specific country, with an
  // optional exclude-list (e.g. "All Countries except India").
  const isGlobal = formData.get("isGlobal") === "on";
  const country = isGlobal ? null : String(formData.get("country") ?? "").trim().toUpperCase();
  const excludedCountries = isGlobal
    ? String(formData.get("excludedCountries") ?? "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => /^[A-Z]{2}$/.test(s))
        .join(",") || null
    : null;
  const scope = String(formData.get("scope") ?? "all") === "user" ? "user" : "all";
  const userIdRaw = String(formData.get("userId") ?? "").trim();
  const userId = scope === "user" ? parseInt(userIdRaw, 10) : null;
  const reductionPercent = parseInt(String(formData.get("reductionPercent") ?? "0"), 10);
  const enabled = formData.get("enabled") === "on";
  const editId = parseInt(String(formData.get("editId") ?? "0"), 10);

  if (!isGlobal && !/^[A-Z]{2}$/.test(country ?? "")) throw new Error("Please choose a valid country.");
  if (!ALLOWED_PERCENTS.includes(reductionPercent)) {
    throw new Error(`Reduction must be one of: ${ALLOWED_PERCENTS.join(", ")}%.`);
  }
  if (scope === "user" && (!userId || userId <= 0)) {
    throw new Error("Please choose a user for a user-specific rule.");
  }

  const ruleLabel = isGlobal ? `All Countries${excludedCountries ? ` (except ${excludedCountries})` : ""}` : (country as string);

  if (editId > 0) {
    await prisma.analyticsAdjustmentRule.update({
      where: { id: editId },
      data: { country, isGlobal, excludedCountries, scope, userId, reductionPercent, enabled },
    });
    await prisma.activityLog.create({
      data: {
        userId: admin.id,
        actionType: "analytics_rule_update",
        description: `Updated traffic adjustment rule #${editId}: ${ruleLabel} -${reductionPercent}%`,
      },
    });
  } else {
    await prisma.analyticsAdjustmentRule.create({
      data: { country, isGlobal, excludedCountries, scope, userId, reductionPercent, enabled, createdBy: admin.id },
    });
    await prisma.activityLog.create({
      data: {
        userId: admin.id,
        actionType: "analytics_rule_create",
        description: `Created traffic adjustment rule: ${ruleLabel} -${reductionPercent}% (${scope === "all" ? "all users" : `user #${userId}`})`,
      },
    });
  }

  revalidatePath("/admin/analytics-adjustment");
  redirect("/admin/analytics-adjustment?success=1");
}

export async function toggleAdjustmentRule(id: number): Promise<void> {
  const admin = await requireAdmin();
  const rule = await prisma.analyticsAdjustmentRule.findUnique({ where: { id } });
  if (!rule) return;
  await prisma.analyticsAdjustmentRule.update({ where: { id }, data: { enabled: !rule.enabled } });
  await prisma.activityLog.create({
    data: { userId: admin.id, actionType: "analytics_rule_toggle", description: `Toggled adjustment rule #${id}` },
  });
  revalidatePath("/admin/analytics-adjustment");
}

export async function deleteAdjustmentRule(id: number): Promise<void> {
  const admin = await requireAdmin();
  await prisma.analyticsAdjustmentRule.delete({ where: { id } });
  await prisma.activityLog.create({
    data: { userId: admin.id, actionType: "analytics_rule_delete", description: `Deleted adjustment rule #${id}` },
  });
  revalidatePath("/admin/analytics-adjustment");
}
