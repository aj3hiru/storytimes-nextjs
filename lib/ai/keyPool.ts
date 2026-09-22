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
 * 3. Failures are handled by what they actually mean — and for a 429,
 *    by what Google SAYS it means (the QuotaFailure quotaId it sends back),
 *    never by guessing:
 *    - 429, per-DAY quota: that key's quota is gone for today. It rests an
 *      hour and the task moves on to other keys (only keys from other
 *      Google Cloud projects can help).
 *    - 429, per-MINUTE limit (or unstated): the whole pool waits out
 *      Google's delay (at least 1.5 s, at most 60 s), then continues, and
 *      calls allowed at once are halved. Every key in a project shares
 *      that project's per-minute limit, so jumping to another key right
 *      away would only spend more requests on the same exhausted window.
 *      If Google didn't say which quota it was and the same key refuses
 *      again after a wait of 30 s or more, it's treated as per-day.
 *    - 503 / "overloaded" / network timeout: that key rests 60 seconds.
 *    - Anything else (invalid key, permission): the key rests 10 minutes.
 *    Phase 154 treated "two 429s in a row" as a used-up daily quota. With
 *    a per-minute limit Google said would reset in 135 ms, that set every
 *    key aside for 30 minutes and the article failed with "run out of
 *    quota" while the quota was fine.
 *    When every key a task could use is resting for a long time, acquire()
 *    returns immediately so the caller can fail with a clear message.
 *    Rest periods live at module level, so they hold across requests in
 *    this server process.
 */

export const MAX_PARALLEL = 5;
const OVERLOAD_COOLDOWN_MS = 60_000;
const HARD_FAILURE_COOLDOWN_MS = 10 * 60_000;
const DAILY_QUOTA_COOLDOWN_MS = 60 * 60_000;
const DEFAULT_RATE_LIMIT_WAIT_MS = 20_000;
const MIN_RATE_LIMIT_WAIT_MS = 1_500;
const MAX_SINGLE_WAIT_MS = 60_000;
/** A task gives up on waiting when every key it could use rests longer than this. */
const GIVE_UP_WAIT_MS = 90_000;

const benchedUntil = new Map<number, number>();
/** The last rate-limit wait each key was given, for the unstated-quota case. */
const lastRateLimitWait = new Map<number, number>();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface KeyOutcome {
  ok: boolean;
  overloaded?: boolean;
  rateLimited?: boolean;
  quotaScope?: "minute" | "day";
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
   * and isn't in `exclude`. Waits — rather than firing at a resting key —
   * when every usable key is resting briefly. Returns null when this task
   * has no key left to try, or when every key it could use is resting for
   * a long time (quota used up), so the caller can fail with a clear
   * message instead of hanging.
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
      const idle = candidates.filter((k) => !this.busy.has(k.id));
      if (this.busy.size < this.limit) {
        const rested = idle.find((k) => (benchedUntil.get(k.id) ?? 0) <= now);
        if (rested) {
          this.busy.add(rested.id);
          this.queue = [...this.queue.filter((k) => k.id !== rested.id), rested];
          return rested;
        }
      }
      if (idle.length === candidates.length) {
        // Nothing in flight that could free up — only resting keys remain.
        const soonest = Math.min(...idle.map((k) => benchedUntil.get(k.id) ?? 0));
        if (soonest - now > GIVE_UP_WAIT_MS) return null;
        await this.waitForChange(Math.min(Math.max(soonest - now, 250), MAX_SINGLE_WAIT_MS));
        continue;
      }
      await this.waitForChange(MAX_SINGLE_WAIT_MS);
    }
  }

  release(keyId: number, outcome: KeyOutcome): void {
    this.busy.delete(keyId);
    const now = Date.now();
    if (outcome.ok) {
      benchedUntil.delete(keyId);
      lastRateLimitWait.delete(keyId);
    } else if (outcome.rateLimited) {
      const previousWait = lastRateLimitWait.get(keyId) ?? 0;
      const daily = outcome.quotaScope === "day" || (outcome.quotaScope === undefined && previousWait >= 30_000);
      if (daily) {
        benchedUntil.set(keyId, now + DAILY_QUOTA_COOLDOWN_MS);
        lastRateLimitWait.delete(keyId);
      } else {
        const wait = Math.min(
          Math.max(outcome.retryAfterMs ?? DEFAULT_RATE_LIMIT_WAIT_MS, MIN_RATE_LIMIT_WAIT_MS),
          MAX_SINGLE_WAIT_MS
        );
        benchedUntil.set(keyId, now + wait);
        lastRateLimitWait.set(keyId, wait);
        this.pausedUntil = Math.max(this.pausedUntil, now + wait);
        this.limit = Math.max(1, Math.ceil(this.limit / 2));
      }
    } else if (outcome.overloaded) {
      benchedUntil.set(keyId, now + OVERLOAD_COOLDOWN_MS);
    } else {
      benchedUntil.set(keyId, now + HARD_FAILURE_COOLDOWN_MS);
    }
    this.notifyAll();
  }
}
