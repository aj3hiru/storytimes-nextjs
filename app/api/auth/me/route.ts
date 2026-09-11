import { NextResponse } from "next/server";
import { requireUser, resolvePermissions } from "@/lib/auth";

/**
 * Tiny "who am I" endpoint the client-side AdminBar calls on mount. Kept
 * separate from any cached page render on purpose — see the comment in
 * app/(public)/layout.tsx for why the admin bar can't be baked into the
 * ISR-cached page HTML itself. Returns { loggedIn: false } rather than
 * a 401 for the "not staff" case, since that's the expected/common
 * response for the vast majority of (anonymous) page views, not an error.
 */
export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ loggedIn: false });
  }
  return NextResponse.json({
    loggedIn: true,
    username: user.username,
    role: user.role,
    permissions: resolvePermissions(user),
  });
}
