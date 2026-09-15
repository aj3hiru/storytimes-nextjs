/**
 * Shared iron-session config for BOTH `lib/auth.ts` (Server Components/
 * Route Handlers, via next/headers' cookies()) and `middleware.ts` (Edge
 * runtime, via the request/response pair) — deliberately has NO
 * `next/headers` or `server-only` import, since middleware can't use
 * either.
 *
 * Real bug fixed here — almost certainly THE actual cause of "ek baar
 * login karte hain, thodi der baad phir se login page aa jaata hai":
 * middleware.ts had its OWN, separately-typed-out getIronSession() call
 * with just `{ cookieName, password }` — missing `cookieOptions`
 * entirely, in particular `maxAge`. iron-session's `getIronSession(req,
 * res, options)` form (the one middleware uses) RE-WRITES the session
 * cookie on every single request that touches it, using whatever
 * `cookieOptions` were passed to THAT call — not whatever `lib/auth.ts`
 * used at login time. Since middleware ran on every admin request and
 * never specified `maxAge`, it was silently re-issuing the cookie with
 * iron-session's own default expiry every time a staff member navigated
 * to another admin page — quietly overwriting the intended 90-day
 * "stay logged in" cookie with a much shorter-lived one shortly after
 * every login, regardless of what `lib/auth.ts` set at login time.
 * Sharing this ONE config object between both call sites makes that
 * kind of drift structurally impossible going forward.
 */
export function getSessionOptions(secretKey: string) {
  return {
    cookieName: "storytimes_session",
    password: secretKey,
    cookieOptions: {
      secure: process.env.APP_ENV === "production",
      httpOnly: true,
      sameSite: "lax" as const,
      // 90 days — effectively "until they explicitly log out" for how
      // this admin panel is actually used, while still expiring
      // eventually if a device is lost/abandoned rather than staying
      // valid forever.
      maxAge: 60 * 60 * 24 * 90,
    },
  };
}
