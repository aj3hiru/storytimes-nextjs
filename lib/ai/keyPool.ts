import type { AiApiKey, AiProvider } from "@prisma/client";
import { prisma } from "../db";

/**
 * Key pool for parallel AI generation — new, no PHP equivalent. Built per
 * explicit request: spread one generation's work across up to five keys
 * at once, and keep rotating so no key ends up doing the same job every
 * time ("koi title generate kar raha hai to har time wahi na kare").
 *
 * Three rules, each for a specific reason:
 *
 * 1. Rotation is least-recently-used, in two layers. Across generations,
 *    keys are loaded ordered by lastUsedAt ASC (MySQL sorts NULL first,
 *    so a never-used key goes first), so each new generation starts on
 *    whichever keys have rested longest. Within a generation, a key moves
 *    to the back of the line the moment it's handed out, so the next task
 *    always gets a different key. Deliberately NOT ordered by failCount
 *    the way getUserKeys() is: that counter is lifetime-cumulative and
 *    never decays, so ordering by it would pin the same "healthiest" keys
 *    to the front forever and defeat rotation entirely. Short-term health
 *    is handled by rule 3 instead.
 *
 * 2. At most MAX_PARALLEL keys work at once, and one task per key at a
 *    time — never two requests stacked on the same key, which is exactly
 *    what triggers a rate limit.
 *
 * 3. A key that fails is benched: 60 seconds for a rate-limit/overload
 *    (a temporary condition on Google's side), 10 minutes for anything
 *    else (bad key, quota exhausted, permission error). The bench lives
 *    at module level, so it holds across requests in this server process,
 *    not just inside one generation.
 */

export const MAX_PARALLEL = 5;
const OVERLOAD_COOLDOWN_MS = 60_000;
const HARD_FAILURE_COOLDOWN_MS = 10 * 60_000;

const benchedUntil = new Map<number, number>();

export async function loadRotatedKeys(userId: number, provider: AiProvider): Promise<AiApiKey[]> {
  return prisma.aiApiKey.findMany({
    where: { userId, provider, isActive: true },
    orderBy: [{ lastUsedAt: "asc" }, { id: "asc" }],
  });
}

export class KeyPool {
  private queue: AiApiKey[];
  private busy = new Set<number>();
  private waiters: Array<() => void> = [];
  readonly size: number;
  readonly maxConcurrent: number;

  constructor(keys: AiApiKey[]) {
    this.queue = [...keys];
    this.size = keys.length;
    this.maxConcurrent = Math.min(MAX_PARALLEL, keys.length);
  }

  /**
   * Hands out the next key in rotation that isn't busy, isn't benched and
   * isn't in `exclude` (keys this task already failed on). Waits if every
   * usable key is currently busy. Returns null only when this task has
   * genuinely run out of keys to try.
   *
   * If every remaining key is benched, the one whose bench ends soonest
   * is used anyway — trying a key that may have recovered beats failing
   * the whole article outright.
   */
  async acquire(exclude: Set<number>): Promise<AiApiKey | null> {
    for (;;) {
      const candidates = this.queue.filter((k) => !exclude.has(k.id));
      if (candidates.length === 0) return null;

      if (this.busy.size < this.maxConcurrent) {
        const now = Date.now();
        const idle = candidates.filter((k) => !this.busy.has(k.id));
        const rested = idle.find((k) => (benchedUntil.get(k.id) ?? 0) <= now);
        const chosen =
          rested ??
          (idle.length > 0 && idle.length === candidates.length
            ? idle.reduce((a, b) => ((benchedUntil.get(a.id) ?? 0) <= (benchedUntil.get(b.id) ?? 0) ? a : b))
            : undefined);
        if (chosen) {
          this.busy.add(chosen.id);
          this.queue = [...this.queue.filter((k) => k.id !== chosen.id), chosen];
          return chosen;
        }
      }
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
  }

  release(keyId: number, outcome: { ok: boolean; overloaded?: boolean }): void {
    this.busy.delete(keyId);
    if (outcome.ok) benchedUntil.delete(keyId);
    else benchedUntil.set(keyId, Date.now() + (outcome.overloaded ? OVERLOAD_COOLDOWN_MS : HARD_FAILURE_COOLDOWN_MS));
    const next = this.waiters.shift();
    if (next) next();
  }
}
