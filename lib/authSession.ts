import "server-only";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { prisma } from "./db";

// No other file in this codebase imports a bare model type (e.g. `User`)
// directly from "@prisma/client" — every other file either infers it or
// derives it from a query's own return type instead, suggesting this
// project's Prisma generator config doesn't export bare model types the
// same way some configurations do. Following that same established
// convention here rather than introducing a new import pattern this
// codebase doesn't otherwise use.
type AuthUser = NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>>;

/**
 * Database-backed session model — see the AuthSession Prisma model's
 * own comment for the full "why" (a detailed root-cause specification
 * for the recurring "baar baar logout" reports). The short version: the
 * cookie now carries only an opaque random token, never structured
 * session data, and a request is authenticated only when that token's
 * hash matches an unrevoked, unexpired database row belonging to an
 * active user — real, individually-revocable, auditable sessions
 * instead of one all-or-nothing encrypted cookie.
 *
 * `__Host-` prefix requires the browser to enforce Secure + Path=/ +
 * no Domain attribute on this exact cookie — makes the exact drift bugs
 * the spec called out (a stray Domain attribute, an inconsistent Path,
 * `secure` silently depending on an env var) structurally impossible
 * rather than just documented-against. Renamed from the old
 * `storytimes_session` deliberately, not reused: an old cookie under
 * that name from before this migration is simply a different cookie the
 * browser sends alongside this one, never confused for it, and gets
 * explicitly cleared on next logout regardless.
 */
const COOKIE_NAME = "__Host-storytimes_session_v2";
const OLD_COOKIE_NAMES = ["storytimes_session"];
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 days — "until you log out," same as before
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000; // only write lastSeenAt at most once per 5 minutes per session

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function generateRawToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function cookieOptions() {
  return {
    httpOnly: true,
    // Real bug fixed here: this used to be
    // `process.env.APP_ENV === "production"` — a deployment mistake
    // (env var missing/misspelled) could silently produce a non-Secure
    // auth cookie. This site is HTTPS-only (Cloudflare in front of the
    // origin) unconditionally, so the flag is now unconditional too —
    // it does not depend on any environment variable being set correctly.
    secure: true,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

/**
 * Called from the login Route Handler only (Route Handlers may set
 * cookies; Server Components may not) — creates a real, persisted
 * session row and sets the opaque-token cookie for it.
 */
export async function createAuthSession(
  userId: number,
  meta: { userAgent?: string | null; ipAddress?: string | null }
): Promise<void> {
  const rawToken = generateRawToken();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await prisma.authSession.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt,
      userAgent: meta.userAgent?.slice(0, 500) || null,
      ipAddress: meta.ipAddress || null,
    },
  });

  const jar = await cookies();
  jar.set(COOKIE_NAME, rawToken, cookieOptions());
}

/**
 * The one shared, canonical authentication check — every server
 * component/action/route in this project should call this (or
 * `requireUser()`, which wraps it) rather than reading the cookie
 * directly. Performs every check the spec's `getAuthenticatedUser()`
 * contract calls for: missing cookie, invalid/unknown token, revoked,
 * expired, missing user, inactive user. Does NOT mutate anything during
 * an ordinary read except a throttled `lastSeenAt` touch (real writes —
 * creating or revoking a session — only ever happen from a Route
 * Handler or Server Action, never from a plain page render).
 */
export async function getAuthenticatedUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const rawToken = jar.get(COOKIE_NAME)?.value;
  if (!rawToken) return null;

  const tokenHash = hashToken(rawToken);
  const session = await prisma.authSession.findUnique({ where: { tokenHash } });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt < new Date()) return null;

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status !== "active") return null;

  // Throttled touch — avoids a write on every single request while still
  // keeping lastSeenAt meaningfully fresh for the "active sessions" view.
  if (Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    await prisma.authSession.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } }).catch(() => {
      // Best-effort — never fail the actual auth check over a stats write.
    });
  }

  return user;
}

/** Revokes the CURRENT browser's session specifically (ordinary logout)
 *  and clears its cookie — every OTHER session for this same user (a
 *  different browser/device) is left untouched, matching "log out just
 *  this device," not "log out everywhere." Route Handler only. */
export async function revokeCurrentSession(): Promise<void> {
  const jar = await cookies();
  const rawToken = jar.get(COOKIE_NAME)?.value;
  if (rawToken) {
    const tokenHash = hashToken(rawToken);
    await prisma.authSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  jar.delete({ name: COOKIE_NAME, path: "/" });
  // Clear any stale pre-migration cookie too, so a browser that still
  // has the old iron-session cookie alongside the new one doesn't keep
  // carrying it around indefinitely.
  for (const name of OLD_COOKIE_NAMES) jar.delete({ name, path: "/" });
}

/** For "log out this user everywhere" (e.g. an admin suspending/editing
 *  another user, or a user changing their own password) — revokes every
 *  one of THIS user's sessions, not anyone else's. */
export async function revokeAllSessionsForUser(userId: number): Promise<void> {
  await prisma.authSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * For a genuinely global "log everyone out" action (e.g. Backup
 * Restore, which replaces every user account wholesale) — revokes
 * every active session for every user. Real bug fixed here: the
 * previous mechanism (bumping a single `app_config.session_version`
 * value) was the SAME global switch this function now is, but it was
 * effectively "always armed" — any code path that happened to touch
 * that config row (intentionally or not) invalidated every session on
 * every domain at once, with no record of which sessions were affected
 * or why. This is now an explicit, auditable action (real revokedAt
 * timestamps on real rows) reserved for genuinely global events only.
 */
export async function revokeAllSessions(): Promise<void> {
  await prisma.authSession.updateMany({
    where: { revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Best-effort cleanup of long-expired, already-unusable rows — safe to
 *  call from a cron job or lazily on login; never required for
 *  correctness (an expired row is already rejected by
 *  getAuthenticatedUser() regardless of whether it's been deleted yet). */
export async function pruneExpiredSessions(): Promise<number> {
  const result = await prisma.authSession.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
  });
  return result.count;
}

export { COOKIE_NAME as AUTH_SESSION_COOKIE_NAME };
