import "server-only";
import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";

/**
 * The original PHP endpoints throttle per-visitor using a rolling window of
 * timestamps stored in $_SESSION, e.g.:
 *
 *   $_SESSION['track_hits'] = array_filter($_SESSION['track_hits'] ?? [],
 *       fn($t) => (time() - $t) < 60);
 *   if (count($_SESSION['track_hits']) >= 60) { http_response_code(429); ... }
 *
 * This is the exact same pattern, backed by its own signed session cookie
 * (kept separate from the auth session so rate-limit buckets don't bloat
 * or get wiped by login/logout).
 */

interface RateLimitBuckets {
  [bucket: string]: number[] | undefined;
}

const rlSessionOptions: SessionOptions = {
  cookieName: "storytimes_rl",
  password: requireSecretKey(),
  cookieOptions: {
    secure: true, // this deployment is HTTPS-only; not conditional on any env var (see lib/authSession.ts for the same fix on the main auth cookie)
    httpOnly: true,
    sameSite: "lax",
  },
};

function requireSecretKey(): string {
  const key = process.env.SECRET_KEY;
  if (!key || key.length < 32) {
    throw new Error("SECRET_KEY env var must be a random string of at least 32 characters.");
  }
  return key;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
}

/**
 * @param bucket        unique name for this limiter, e.g. "track_hits", "comment_times"
 * @param windowSeconds e.g. 60
 * @param max           max hits allowed inside the window, e.g. 60
 */
export async function checkRateLimit(
  bucket: string,
  windowSeconds: number,
  max: number
): Promise<RateLimitResult> {
  const session = await getIronSession<RateLimitBuckets>(await cookies(), rlSessionOptions);
  const now = Date.now() / 1000;

  const existing = (session[bucket] ?? []).filter((t) => now - t < windowSeconds);

  if (existing.length >= max) {
    session[bucket] = existing;
    await session.save();
    return { allowed: false, remaining: 0 };
  }

  existing.push(now);
  session[bucket] = existing;
  await session.save();
  return { allowed: true, remaining: max - existing.length };
}

/** Simple single-slot throttle, e.g. "only one contact-form submit per 20s". */
export async function checkThrottle(bucket: string, seconds: number): Promise<boolean> {
  const session = await getIronSession<Record<string, number | undefined>>(
    await cookies(),
    rlSessionOptions
  );
  const now = Date.now() / 1000;
  const last = session[bucket] ?? 0;
  if (now - last < seconds) return false;
  session[bucket] = now;
  await session.save();
  return true;
}
