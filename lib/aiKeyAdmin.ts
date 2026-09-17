"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { requireUser, canManageAllPosts, resolvePermissions } from "./auth";
import type { AiProvider } from "@prisma/client";
import type { OrphanedMedia, FailRateRow } from "./adminTypes";

// NOTE: keys are stored as-is in the `api_key` column here, matching the
// original schema. In production this should be encrypted at rest
// (e.g. via a KMS-backed envelope) before insert — left as a TODO since it
// depends on which secrets-management approach the deployment uses.

/**
 * Ports the $allowedToModifyTarget gate for add_key/edit_key/delete_key in
 * admin/ai-features.php: API key management is admin/editor-only, full
 * stop — unlike feature-settings actions, there's no "manage your own"
 * exception here. An author can never add/edit/delete a key, even their
 * own; an admin/editor sets keys up on their behalf via the target-user
 * selector.
 */
/**
 * Real bug fixed here — two distinct issues, both security-relevant:
 *
 * 1. Both this and the sibling `resolveTargetUserId()` below checked
 *    `canManageAllPosts(..., "edit")` — the `blogs.edit_all` permission,
 *    about editing every post on the site, which has nothing to do with
 *    API-key management. An editor explicitly granted the real
 *    `settings.api_keys` permission still got "Only an admin or editor
 *    can manage API keys" here, because that permission was never what
 *    was actually being checked.
 * 2. This function never validated `requestedTargetUserId` against
 *    anything at all — whenever `canManageAllUsers` was true, it
 *    returned WHATEVER id the form sent, with no check that the caller
 *    was actually allowed to manage that specific person. Any user
 *    holding `blogs.edit_all` (regardless of whether they were ever
 *    meant to reach anyone else's keys) could write a key for an
 *    arbitrary user id by hand-crafting the form submission — a real
 *    privilege-escalation path, not just a permission mismatch.
 *
 * Fixed with the same three-tier scope used on Dashboard/Analytics: an
 * admin may target anyone; an editor holding `settings.api_keys` may
 * target themselves or their own `createdById`-assigned authors; anyone
 * else may only ever target themselves, and any other requested id is
 * rejected outright rather than silently narrowed to "just use my own"
 * (which would mask the caller's mistake or a tampered request instead
 * of surfacing it).
 */
async function resolveKeyManagementTarget(requestedTargetUserId: number | null): Promise<number> {
  const user = await requireUser();
  if (!user) redirect("/admin-login");

  const target = requestedTargetUserId ?? user.id;
  if (target === user.id) return target;

  const permissions = resolvePermissions(user);
  const canManageOthers = user.role === "admin" || (user.role === "editor" && Boolean(permissions.settings.api_keys));
  if (!canManageOthers) {
    throw new Error("You can only manage your own API keys.");
  }
  if (user.role !== "admin") {
    const managedCount = await prisma.user.count({ where: { id: target, createdById: user.id } });
    if (managedCount === 0) throw new Error("You can only manage API keys for authors assigned to you.");
  }
  return target;
}

/**
 * Ports the $isOwnTarget exception for save_feature_settings/reset_to_default:
 * anyone can manage their OWN personal toggles; an admin or an editor
 * holding `settings.api_keys` can additionally manage one of their own
 * assigned authors' — same scope and same validation as
 * resolveKeyManagementTarget() above, so the two can't drift apart.
 */
async function resolveTargetUserId(requestedTargetUserId: number | null): Promise<{ callerId: number; targetUserId: number }> {
  const user = await requireUser();
  if (!user) redirect("/admin-login");

  const targetUserId = await resolveKeyManagementTarget(requestedTargetUserId);
  return { callerId: user.id, targetUserId };
}

export async function addAiKey(formData: FormData): Promise<void> {
  const targetUserIdRaw = String(formData.get("targetUserId") ?? "").trim();
  const targetUserId = await resolveKeyManagementTarget(targetUserIdRaw ? parseInt(targetUserIdRaw, 10) : null);

  const provider = String(formData.get("provider") ?? "gemini") as AiProvider;
  const label = String(formData.get("label") ?? "").trim() || null;
  const apiKey = String(formData.get("apiKey") ?? "").trim();
  const cfAccountId = String(formData.get("cfAccountId") ?? "").trim() || null;

  if (!apiKey) throw new Error("API key is required.");
  if (provider === "cloudflare" && !cfAccountId) throw new Error("Cloudflare account ID is required.");

  await prisma.aiApiKey.create({
    data: { userId: targetUserId, provider, label, apiKey, cfAccountId },
  });

  revalidatePath("/admin/ai-features");
}

/** Ports the 'edit_key' action — updates label/account id/active flag
 *  without deleting and recreating the row (keeps success/fail counters). */
export async function editAiKey(keyId: number, formData: FormData): Promise<void> {
  const targetUserIdRaw = String(formData.get("targetUserId") ?? "").trim();
  const targetUserId = await resolveKeyManagementTarget(targetUserIdRaw ? parseInt(targetUserIdRaw, 10) : null);

  const label = String(formData.get("label") ?? "").trim() || null;
  const cfAccountId = String(formData.get("cfAccountId") ?? "").trim() || null;
  const apiKey = String(formData.get("apiKey") ?? "").trim();

  await prisma.aiApiKey.updateMany({
    where: { id: keyId, userId: targetUserId },
    data: { label, cfAccountId, ...(apiKey ? { apiKey } : {}) },
  });

  revalidatePath("/admin/ai-features");
}

export async function toggleAiKey(keyId: number, isActive: boolean, targetUserId?: number): Promise<void> {
  const resolved = await resolveKeyManagementTarget(targetUserId ?? null);
  await prisma.aiApiKey.updateMany({ where: { id: keyId, userId: resolved }, data: { isActive } });
  revalidatePath("/admin/ai-features");
}

export async function deleteAiKey(keyId: number, targetUserId?: number): Promise<void> {
  const resolved = await resolveKeyManagementTarget(targetUserId ?? null);
  await prisma.aiApiKey.deleteMany({ where: { id: keyId, userId: resolved } });
  revalidatePath("/admin/ai-features");
}

export async function saveFeatureSettings(formData: FormData): Promise<void> {
  const targetUserIdRaw = String(formData.get("targetUserId") ?? "").trim();

  const data = {
    generateTitle: formData.get("generateTitle") === "on",
    generateContent: formData.get("generateContent") === "on",
    generateSeo: formData.get("generateSeo") === "on",
    generateThumbnail: formData.get("generateThumbnail") === "on",
  };

  const { targetUserId } = await resolveTargetUserId(targetUserIdRaw ? parseInt(targetUserIdRaw, 10) : null);
  await prisma.aiFeatureSettings.upsert({
    where: { userId: targetUserId },
    create: { userId: targetUserId, ...data },
    update: data,
  });

  revalidatePath("/admin/ai-features");
}

/** Ports the 'reset_to_default' action — deletes the user's own override
 *  row so they fall back to inheriting the admin's global default again. */
export async function resetFeatureSettingsToDefault(targetUserId?: number): Promise<void> {
  const { targetUserId: resolved } = await resolveTargetUserId(targetUserId ?? null);
  await prisma.aiFeatureSettings.deleteMany({ where: { userId: resolved } });
  revalidatePath("/admin/ai-features");
}

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 4)}${"•".repeat(Math.min(20, key.length - 8))}${key.slice(-4)}`;
}

export async function getMaskedAiKeys(userId: number) {
  const keys = await prisma.aiApiKey.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
  return keys.map((k) => ({ ...k, apiKey: maskKey(k.apiKey) }));
}

/**
 * Ports ai_find_orphaned_media()/ai_delete_orphaned_media() from
 * includes/ai_keys.php: AI-generated images (media.ai_generated = true)
 * that aren't a post's featured image, aren't linked via media.post_id,
 * and don't appear inside any post's content HTML — i.e. generated but
 * never actually used.
 */


export async function findOrphanedAiMedia(scopeToUserId: number | null): Promise<OrphanedMedia[]> {
  const user = await requireUser();
  if (!user) redirect("/admin-login");
  const permissions = resolvePermissions(user);
  const canCleanupAll = canManageAllPosts(user.role, permissions, "edit");
  const effectiveScope = canCleanupAll ? scopeToUserId : user.id;

  const candidates = await prisma.media.findMany({
    where: {
      aiGenerated: true,
      postId: null,
      ...(effectiveScope ? { uploadedBy: effectiveScope } : {}),
    },
    orderBy: { uploadedAt: "desc" },
    include: { uploader: { select: { username: true } } },
  });

  if (candidates.length === 0) return [];

  // "not a featured image" + "doesn't appear in any post's content" checks
  // — done in JS rather than a raw LIKE-per-row query, since Prisma has no
  // portable "content LIKE %path%" filter across an arbitrary set of paths.
  const [featuredImageIds, allContents] = await Promise.all([
    prisma.post.findMany({ where: { featuredImageId: { not: null } }, select: { featuredImageId: true } }),
    prisma.post.findMany({ select: { content: true } }),
  ]);
  const featuredIdSet = new Set(featuredImageIds.map((p) => p.featuredImageId));
  const combinedContent = allContents.map((p) => p.content).join("\n");

  return candidates
    .filter((m) => !featuredIdSet.has(m.id) && !combinedContent.includes(m.filePath))
    .map((m) => ({
      id: m.id,
      filePath: m.filePath,
      uploadedAt: m.uploadedAt,
      uploadedByUsername: m.uploader?.username ?? null,
    }));
}

export async function deleteOrphanedAiMedia(mediaIds: number[]): Promise<{ deleted: number }> {
  const user = await requireUser();
  if (!user) redirect("/admin-login");
  const permissions = resolvePermissions(user);
  const canCleanupAll = canManageAllPosts(user.role, permissions, "edit");

  // Re-verify the orphan condition right before deleting (matches the
  // original's race-condition guard — an image could have been attached
  // to a post moments ago).
  const stillOrphaned = await findOrphanedAiMedia(canCleanupAll ? null : user.id);
  const idsToDelete = stillOrphaned.filter((m) => mediaIds.includes(m.id)).map((m) => m.id);

  if (idsToDelete.length === 0) return { deleted: 0 };
  const result = await prisma.media.deleteMany({ where: { id: { in: idsToDelete } } });

  revalidatePath("/admin/ai-features");
  return { deleted: result.count };
}



/**
 * Ports the "Fail Rate" tab's "API Health (Last 30 Days)" table —
 * per-user, per-provider success/fail counts from ai_generation_log.
 * Admin/editor only (same gate as canViewFailRate in the original).
 */
export async function getFailRateStats(): Promise<FailRateRow[]> {
  const user = await requireUser();
  if (!user) redirect("/admin-login");
  const permissions = resolvePermissions(user);
  if (!canManageAllPosts(user.role, permissions, "edit")) {
    throw new Error("Only admin/editor can view fail-rate stats.");
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const logs = await prisma.aiGenerationLog.findMany({
    where: { createdAt: { gte: thirtyDaysAgo } },
    select: { userId: true, provider: true, status: true, user: { select: { username: true } } },
  });

  const grouped = new Map<string, { username: string; provider: string; success: number; fail: number }>();
  for (const log of logs) {
    const key = `${log.userId}:${log.provider}`;
    const entry = grouped.get(key) ?? { username: log.user?.username ?? "Unknown", provider: log.provider ?? "unknown", success: 0, fail: 0 };
    if (log.status === "success") entry.success++;
    else entry.fail++;
    grouped.set(key, entry);
  }

  return Array.from(grouped.values())
    .map((row) => ({ ...row, failRatePercent: Math.round((row.fail / Math.max(1, row.success + row.fail)) * 100) }))
    .sort((a, b) => b.success + b.fail - (a.success + a.fail));
}
