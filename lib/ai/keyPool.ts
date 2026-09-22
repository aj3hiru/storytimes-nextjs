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
 *    - HTTP 429 (quota / rate limit). That key rests for as long as Google
 *      says to wait, and the task moves to another rested key — useful
 *      when keys come from different Google Cloud projects, each with its
 *      own quota. If the same key hits 429 again right after resting, its
 *      quota is treated as used up (a daily cap, not a per-minute one)
 *      and it rests 30 minutes. The number of calls allowed at once is
 *      halved after a 429, since a burst is what trips a per-minute limit.
 *      Phase 152 paused the WHOLE pool instead and never set a key aside,
 *      so a key whose daily free-tier quota was gone got retried six times
 *      in a row ("rate limit was hit 6 time(s) for this part").
 *    - HTTP 503 / "overloaded" / network timeout: temporary trouble. That
 *      key rests 60 seconds.
 *    - Anything else (invalid key, permission): the key rests 10 minutes.
 *    When every key a task could use is resting for a long time, acquire()
 *    returns null straight away instead of waiting minutes for nothing.
 *    Rest periods live at module level, so they hold across requests in
 *    this server process.
 */

export const MAX_PARALLEL = 5;
const OVERLOAD_COOLDOWN_MS = 60_000;
const HARD_FAILURE_COOLDOWN_MS = 10 * 60_000;
const QUOTA_EXHAUSTED_COOLDOWN_MS = 30 * 60_000;
const DEFAULT_RATE_LIMIT_WAIT_MS = 20_000;
const MAX_SINGLE_WAIT_MS = 60_000;
/** A task gives up on waiting when every key it could use rests longer than this. */
const GIVE_UP_WAIT_MS = 90_000;

const benchedUntil = new Map<number, number>();
/** Consecutive 429s per key — two in a row means its quota is used up. */
const consecutive429 = new Map<number, number>();

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
      consecutive429.delete(keyId);
    } else if (outcome.rateLimited) {
      const streak = (consecutive429.get(keyId) ?? 0) + 1;
      consecutive429.set(keyId, streak);
      const wait =
        streak >= 2
          ? QUOTA_EXHAUSTED_COOLDOWN_MS
          : Math.min(outcome.retryAfterMs ?? DEFAULT_RATE_LIMIT_WAIT_MS, MAX_SINGLE_WAIT_MS);
      benchedUntil.set(keyId, now + wait);
      this.limit = Math.max(1, Math.ceil(this.limit / 2));
    } else if (outcome.overloaded) {
      benchedUntil.set(keyId, now + OVERLOAD_COOLDOWN_MS);
    } else {
      benchedUntil.set(keyId, now + HARD_FAILURE_COOLDOWN_MS);
    }
    this.notifyAll();
  }
}
