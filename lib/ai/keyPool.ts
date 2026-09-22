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
 * 3. Failures are handled by what they actually mean:
 *    - HTTP 429 (rate limit / quota). Gemini applies these per Google
 *      Cloud PROJECT, not per API key — keys created in the same project
 *      share one limit. So on a 429 the WHOLE pool pauses for as long as
 *      Google says to wait (its RetryInfo delay, or 20 seconds), and the
 *      number of calls allowed at once is halved for the rest of this
 *      generation. The first version of this pool instead jumped straight
 *      to the next key — with same-project keys, every one of those
 *      returned 429 too, and a part burned through all its attempts in a
 *      few seconds. That was the "tried 4 of your keys and every one was
 *      busy" error, reported while Google wasn't actually busy.
 *    - HTTP 503 / "overloaded": temporary trouble on Google's side. That
 *      key rests 60 seconds; other keys carry on.
 *    - Anything else (invalid key, permission): the key rests 10 minutes.
 *    Rest periods live at module level, so they hold across requests in
 *    this server process, not just inside one generation.
 */

export const MAX_PARALLEL = 5;
const OVERLOAD_COOLDOWN_MS = 60_000;
const HARD_FAILURE_COOLDOWN_MS = 10 * 60_000;
const DEFAULT_RATE_LIMIT_WAIT_MS = 20_000;
const MAX_SINGLE_WAIT_MS = 60_000;

const benchedUntil = new Map<number, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface KeyOutcome {
  ok: boolean;
  overloaded?: boolean;
  rateLimited?: boolean;
  retryAfterMs?: number;
}

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
  private pausedUntil = 0;
  private limit: number;
  readonly size: number;

  constructor(keys: AiApiKey[]) {
    this.queue = [...keys];
    this.size = keys.length;
    this.limit = Math.min(MAX_PARALLEL, keys.length);
  }

  /** How many calls may run at once right now (drops after a 429). */
  get maxConcurrent(): number {
    return this.limit;
  }

  /** Wakes every waiting task so each re-checks the pool. Waking all (not
   *  just one) matters: a task may also be sleeping on a timer, and a
   *  single wake-up handed to it would otherwise be lost. */
  private notifyAll(): void {
    const waiting = this.waiters;
    this.waiters = [];
    for (const w of waiting) w();
  }

  private waitForChange(maxMs: number): Promise<void> {
    return Promise.race([new Promise<void>((resolve) => this.waiters.push(resolve)), sleep(maxMs)]);
  }

  /**
   * Hands out the next key in rotation that isn't busy, isn't resting,
   * and isn't in `exclude` (keys that hard-failed for this task). Waits —
   * rather than firing at a resting key — whenever the pool is paused or
   * every usable key is resting. Returns null only when this task has no
   * key left it's allowed to try.
   */
  async acquire(exclude: Set<number>): Promise<AiApiKey | null> {
    for (;;) {
      const candidates = this.queue.filter((k) => !exclude.has(k.id));
      if (candidates.length === 0) return null;

      const now = Date.now();
      if (now < this.pausedUntil) {
        await sleep(Math.min(this.pausedUntil - now, MAX_SINGLE_WAIT_MS));
        continue;
      }

      if (this.busy.size < this.limit) {
        const idle = candidates.filter((k) => !this.busy.has(k.id));
        const rested = idle.find((k) => (benchedUntil.get(k.id) ?? 0) <= now);
        if (rested) {
          this.busy.add(rested.id);
          this.queue = [...this.queue.filter((k) => k.id !== rested.id), rested];
          return rested;
        }
        if (idle.length > 0) {
          const soonest = Math.min(...idle.map((k) => benchedUntil.get(k.id) ?? 0));
          await this.waitForChange(Math.min(Math.max(soonest - now, 250), MAX_SINGLE_WAIT_MS));
          continue;
        }
      }
      await this.waitForChange(MAX_SINGLE_WAIT_MS);
    }
  }

  release(keyId: number, outcome: KeyOutcome): void {
    this.busy.delete(keyId);
    const now = Date.now();
    if (outcome.ok) {
      benchedUntil.delete(keyId);
    } else if (outcome.rateLimited) {
      const wait = Math.min(outcome.retryAfterMs ?? DEFAULT_RATE_LIMIT_WAIT_MS, MAX_SINGLE_WAIT_MS);
      benchedUntil.set(keyId, now + wait);
      this.pausedUntil = Math.max(this.pausedUntil, now + wait);
      this.limit = Math.max(1, Math.ceil(this.limit / 2));
    } else if (outcome.overloaded) {
      benchedUntil.set(keyId, now + OVERLOAD_COOLDOWN_MS);
    } else {
      benchedUntil.set(keyId, now + HARD_FAILURE_COOLDOWN_MS);
    }
    this.notifyAll();
  }
}
