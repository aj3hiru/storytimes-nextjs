"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { requireUser } from "./auth";
import { applyRuleToPast, forgetRules } from "./viewAdjust";

const ALLOWED_PERCENTS = [5, 10, 20, 30, 40, 50];

/**
 * Admins manage every rule. An editor manages only "specific user" rules
 * for the authors assigned to them (users they created).
 */
async function requireRuleManager() {
  const user = await requireUser();
  if (!user || (user.role !== "admin" && user.role !== "editor")) {
    throw new Error("Only admins and editors can manage traffic adjustment.");
  }
  if (user.role === "admin") return { user, managed: null as Set<number> | null };
  const authors = await prisma.user.findMany({ where: { createdById: user.id }, select: { id: true } });
  return { user, managed: new Set(authors.map((a) => a.id)) };
}

function canTouch(managed: Set<number> | null, rule: { scope: string; userId: number | null }): boolean {
  return managed === null || (rule.scope === "user" && rule.userId !== null && managed.has(rule.userId));
}

export async function saveAdjustmentRule(formData: FormData): Promise<void> {
  const { user: admin, managed } = await requireRuleManager();

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
  const scope = managed !== null || String(formData.get("scope") ?? "all") === "user" ? "user" : "all";
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

  if (managed !== null && (!userId || !managed.has(userId))) {
    throw new Error("You can only add rules for authors assigned to you.");
  }
  if (managed !== null && editId > 0) {
    const existing = await prisma.analyticsAdjustmentRule.findUnique({ where: { id: editId } });
    if (!existing || !canTouch(managed, existing)) throw new Error("You can only change rules of your assigned authors.");
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
    const applyToPast = String(formData.get("applyToPast") ?? "0") === "1";
    const created = await prisma.analyticsAdjustmentRule.create({
      data: { country, isGlobal, excludedCountries, scope, userId, reductionPercent, enabled, createdBy: admin.id, applyToPast },
    });
    // "Past traffic too": the traffic recorded before this rule is reduced right now, once.
    if (applyToPast && enabled) await applyRuleToPast(created.id);
    await prisma.activityLog.create({
      data: {
        userId: admin.id,
        actionType: "analytics_rule_create",
        description: `Created traffic adjustment rule: ${ruleLabel} -${reductionPercent}% (${scope === "all" ? "all users" : `user #${userId}`})`,
      },
    });
  }

  forgetRules();
  revalidatePath("/admin/analytics-adjustment");
  redirect("/admin/analytics-adjustment?success=1");
}

export async function toggleAdjustmentRule(id: number): Promise<void> {
  const { user: admin, managed } = await requireRuleManager();
  const rule = await prisma.analyticsAdjustmentRule.findUnique({ where: { id } });
  if (!rule) return;
  if (!canTouch(managed, rule)) throw new Error("You can only change rules of your assigned authors.");
  await prisma.analyticsAdjustmentRule.update({ where: { id }, data: { enabled: !rule.enabled } });
  forgetRules();
  await prisma.activityLog.create({
    data: { userId: admin.id, actionType: "analytics_rule_toggle", description: `Toggled adjustment rule #${id}` },
  });
  revalidatePath("/admin/analytics-adjustment");
}

export async function deleteAdjustmentRule(id: number): Promise<void> {
  const { user: admin, managed } = await requireRuleManager();
  const rule = await prisma.analyticsAdjustmentRule.findUnique({ where: { id } });
  if (!rule) return;
  if (!canTouch(managed, rule)) throw new Error("You can only delete rules of your assigned authors.");
  await prisma.analyticsAdjustmentRule.delete({ where: { id } });
  forgetRules();
  await prisma.activityLog.create({
    data: { userId: admin.id, actionType: "analytics_rule_delete", description: `Deleted adjustment rule #${id}` },
  });
  revalidatePath("/admin/analytics-adjustment");
}
