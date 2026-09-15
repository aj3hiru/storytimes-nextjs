import "server-only";
import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import { createAuthSession } from "./authSession";
import { resolvePermissions } from "./auth";

const MAX_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 900; // 15 minutes

interface LoginAttemptSession {
  attempts?: number;
  lockoutUntil?: number; // unix seconds
}

function requireSecretKey(): string {
  const key = process.env.SECRET_KEY;
  if (!key || key.length < 32) {
    throw new Error("SECRET_KEY env var must be a random string of at least 32 characters.");
  }
  return key;
}

const attemptSessionOptions: SessionOptions = {
  cookieName: "storytimes_login_attempts",
  password: requireSecretKey(),
  cookieOptions: {
    secure: process.env.APP_ENV === "production",
    httpOnly: true,
    sameSite: "lax",
  },
};

export interface LoginResult {
  success: boolean;
  error?: string;
}

export async function checkLockout(): Promise<{ locked: boolean; secondsLeft: number }> {
  const session = await getIronSession<LoginAttemptSession>(await cookies(), attemptSessionOptions);
  const now = Math.floor(Date.now() / 1000);
  const lockoutUntil = session.lockoutUntil ?? 0;
  if (lockoutUntil > now) {
    return { locked: true, secondsLeft: lockoutUntil - now };
  }
  return { locked: false, secondsLeft: 0 };
}

export async function attemptLogin(
  usernameOrEmail: string,
  password: string,
  ip: string,
  userAgent: string
): Promise<LoginResult> {
  const attemptSession = await getIronSession<LoginAttemptSession>(await cookies(), attemptSessionOptions);

  const { locked } = await checkLockout();
  if (locked) {
    return { success: false, error: "Too many failed attempts. Please try again later." };
  }

  if (!usernameOrEmail || !password) {
    return { success: false, error: "Username and password are required." };
  }

  // Real gap fixed here: only ever matched against `username`, so a
  // staff member who naturally typed their email address (a normal
  // thing to expect a login form to accept, per explicit request) was
  // always told "invalid credentials" no matter how correct their
  // password was. Matches either field now — a login field genuinely
  // does not know in advance which one the person will type.
  const user = await prisma.user.findFirst({
    where: {
      OR: [{ username: usernameOrEmail }, { email: usernameOrEmail }],
      role: { in: ["admin", "editor", "author"] },
    },
  });

  // Always run bcrypt.compare, even for a missing user, against a dummy
  // hash — mirrors the original's constant-time-ish approach to avoid
  // leaking "user exists" via response timing.
  const dummyHash = "$2a$10$invaliddummyhashXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX";
  const passOk = await bcrypt.compare(password, user?.passwordHash ?? dummyHash);

  if (!user || !passOk) {
    const attempts = (attemptSession.attempts ?? 0) + 1;
    attemptSession.attempts = attempts;
    if (attempts >= MAX_ATTEMPTS) {
      attemptSession.lockoutUntil = Math.floor(Date.now() / 1000) + LOCKOUT_SECONDS;
      await attemptSession.save();
      await logActivity(null, "login_failed", `Failed login for: ${usernameOrEmail} (locked out)`, ip, userAgent);
      return { success: false, error: "Too many failed attempts. Please try again later." };
    }
    await attemptSession.save();
    await logActivity(null, "login_failed", `Failed login for: ${usernameOrEmail} (attempt ${attempts})`, ip, userAgent);
    const remaining = MAX_ATTEMPTS - attempts;
    return {
      success: false,
      error: `Invalid username or password. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`,
    };
  }

  if (user.status === "suspended") {
    await logActivity(user.id, "login_blocked", `Suspended account login attempt: ${user.username}`, ip, userAgent);
    return { success: false, error: "Your account has been suspended. Contact the administrator." };
  }
  if (user.status === "pending") {
    await logActivity(user.id, "login_blocked", `Pending account login attempt: ${user.username}`, ip, userAgent);
    return { success: false, error: "Your account is pending approval. Please wait for admin activation." };
  }

  const permissions = resolvePermissions(user);
  if (!permissions.dashboard_access) {
    await logActivity(user.id, "login_denied", `No dashboard_access: ${user.username}`, ip, userAgent);
    return { success: false, error: "You do not have permission to access the admin panel." };
  }

  // Success — reset attempt counter, create the real session.
  attemptSession.attempts = 0;
  attemptSession.lockoutUntil = 0;
  await attemptSession.save();

  // Real bug fixed here: this used to hand-build an iron-session object
  // (userId/username/role/sessionVersion all baked directly into the
  // encrypted cookie) — the cookie itself WAS the complete
  // authentication authority, with no way to revoke just this one login
  // independently of every other session for every user. Now creates a
  // real, individually-revocable database row instead (see
  // lib/authSession.ts's own comment for the full root-cause context);
  // the cookie carries only an opaque token, nothing else.
  await createAuthSession(user.id, { userAgent, ipAddress: ip });

  await logActivity(user.id, "login_success", `Logged in as ${user.role}: ${user.username}`, ip, userAgent);

  return { success: true };
}

async function logActivity(
  userId: number | null,
  actionType: string,
  description: string,
  ip: string,
  userAgent: string
) {
  try {
    await prisma.activityLog.create({
      data: { userId, actionType, description, ipAddress: ip, userAgent },
    });
  } catch (err) {
    console.error("Failed to write activity log:", err);
  }
}

/** Validates a `redirect_to` param the same way admin/login.php's
 *  safe_admin_redirect() does — only allow paths under /admin/. */
export function safeAdminRedirect(target: string | null | undefined): string {
  const DEFAULT = "/admin/dashboard";
  if (!target) return DEFAULT;
  const t = target.trim();
  if (t === "" || t[0] !== "/") return DEFAULT;
  if (t.startsWith("//")) return DEFAULT;
  if (!/^\/admin(\/[a-zA-Z0-9\-_/]*)?(\?[^\s]*)?$/.test(t)) return DEFAULT;
  return t;
}
