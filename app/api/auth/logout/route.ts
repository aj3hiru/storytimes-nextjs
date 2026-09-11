import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";

async function doLogout(request: NextRequest) {
  const session = await getSession();
  session.destroy();
  return NextResponse.redirect(new URL("/admin-login", request.url));
}

export async function POST(request: NextRequest) {
  return doLogout(request);
}

// The AdminBar's logout link is a plain <a href> (matching the original
// PHP's admin/api/logout.php, which was also a plain GET-able link) —
// supporting GET here too means it works with no JS required.
export async function GET(request: NextRequest) {
  return doLogout(request);
}
