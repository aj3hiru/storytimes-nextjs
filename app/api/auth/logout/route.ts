import { getSession } from "@/lib/auth";

/**
 * Real bug fixed here — the SAME "URL turns into localhost" class of bug
 * as the login route and middleware: `new URL(path, request.url)`
 * resolves against whatever host Next.js believes it's running on,
 * which behind a reverse proxy can be an internal address rather than
 * the public domain. Logout is one of the most common actions a logged-
 * in user takes, so this was a very visible way to hit the bug. A
 * relative Location header sidesteps it — the browser resolves it
 * against the page's own current origin, never a server-side guess.
 */
async function doLogout() {
  const session = await getSession();
  session.destroy();
  return new Response(null, { status: 303, headers: { Location: "/admin-login" } });
}

export async function POST() {
  return doLogout();
}

// The AdminBar's logout link is a plain <a href> (matching the original
// PHP's admin/api/logout.php, which was also a plain GET-able link) —
// supporting GET here too means it works with no JS required.
export async function GET() {
  return doLogout();
}
