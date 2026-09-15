import "server-only";
import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import { randomBytes } from "crypto";

interface CsrfSessionShape {
  cTkn?: string;
}

function requireSecretKey(): string {
  const key = process.env.SECRET_KEY;
  if (!key || key.length < 32) {
    throw new Error("SECRET_KEY env var must be a random string of at least 32 characters.");
  }
  return key;
}

const csrfSessionOptions: SessionOptions = {
  cookieName: "storytimes_csrf",
  password: requireSecretKey(),
  cookieOptions: {
    secure: true, // this deployment is HTTPS-only; not conditional on any env var (see lib/authSession.ts for the same fix on the main auth cookie)
    httpOnly: true,
    sameSite: "lax",
  },
};

/** Mirrors `$_SESSION['cTkn'] ??= bin2hex(random_bytes(32));` — issues a
 *  per-visitor token on first read, reuses it after. */
export async function getOrCreateCsrfToken(): Promise<string> {
  const session = await getIronSession<CsrfSessionShape>(await cookies(), csrfSessionOptions);
  if (!session.cTkn) {
    session.cTkn = randomBytes(32).toString("hex");
    await session.save();
  }
  return session.cTkn;
}

/** Constant-time-ish comparison mirroring PHP's hash_equals(). */
export async function verifyCsrfToken(submitted: string | null | undefined): Promise<boolean> {
  const session = await getIronSession<CsrfSessionShape>(await cookies(), csrfSessionOptions);
  if (!session.cTkn || !submitted) return false;
  return timingSafeEqual(session.cTkn, submitted);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
