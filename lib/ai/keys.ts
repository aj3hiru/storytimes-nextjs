import { prisma } from "../db";
import type { AiApiKey, AiProvider, AiTask } from "@prisma/client";

/**
 * Returns a user's active API keys for a provider, ordered so the
 * healthiest key (fewest recent fails) is tried first, with last_used_at
 * ASC as a tiebreaker for round-robin load spreading across equally
 * healthy keys. Ports ai_get_user_keys() exactly.
 */
export async function getUserKeys(userId: number, provider: AiProvider): Promise<AiApiKey[]> {
  return prisma.aiApiKey.findMany({
    where: { userId, provider, isActive: true },
    orderBy: [{ failCount: "asc" }, { lastUsedAt: "asc" }],
  });
}

/**
 * Records the outcome of using a specific key (rolling fail/success
 * counters that feed back into getUserKeys()'s ordering) and writes a row
 * to ai_generation_log. Logging failures never block generation — ports
 * ai_record_key_result() exactly, including the best-effort try/catch.
 */
export async function recordKeyResult(
  userId: number,
  keyId: number | null,
  provider: AiProvider,
  task: AiTask,
  ok: boolean,
  error?: string | null
): Promise<void> {
  const truncatedError = error ? error.slice(0, 250) : null;

  if (keyId !== null) {
    try {
      if (ok) {
        await prisma.aiApiKey.update({
          where: { id: keyId },
          data: { successCount: { increment: 1 }, lastUsedAt: new Date(), lastError: null },
        });
      } else {
        await prisma.aiApiKey.update({
          where: { id: keyId },
          data: { failCount: { increment: 1 }, lastUsedAt: new Date(), lastError: truncatedError },
        });
      }
    } catch (err) {
      console.error("Failed to update AI key stats:", err);
    }
  }

  try {
    await prisma.aiGenerationLog.create({
      data: {
        userId,
        apiKeyId: keyId,
        provider,
        task,
        status: ok ? "success" : "fail",
        errorMessage: truncatedError,
      },
    });
  } catch {
    // logging is best-effort, never block generation on it
  }
}

export interface AiFeatureToggles {
  generateTitle: boolean;
  generateContent: boolean;
  generateSeo: boolean;
  generateThumbnail: boolean;
}

/** Resolves the effective feature toggles: the user's own settings row if
 *  one exists, otherwise everything defaults to ON. Ports the current
 *  ai_get_feature_settings() exactly — there is no site-wide global
 *  default row anymore; every user manages their own toggles
 *  independently (this was simplified from an earlier version that did
 *  have a shared admin default — verified against your latest script). */
export async function getFeatureSettings(userId: number): Promise<AiFeatureToggles> {
  const row = await prisma.aiFeatureSettings.findUnique({ where: { userId } });

  return {
    generateTitle: row ? row.generateTitle : true,
    generateContent: row ? row.generateContent : true,
    generateSeo: row ? row.generateSeo : true,
    generateThumbnail: row ? row.generateThumbnail : true,
  };
}

export async function userHasOwnSettings(userId: number): Promise<boolean> {
  const row = await prisma.aiFeatureSettings.findUnique({ where: { userId } });
  return Boolean(row);
}
