import { NextResponse } from "next/server";
import { getOrCreateCsrfToken } from "@/lib/csrf";

// Deliberately never cached (the original PHP made the same guarantee) —
// the whole point of this endpoint is that it always returns a token
// matching the CURRENT visitor's own session, even when the surrounding
// page HTML is served from a shared cache.
export const dynamic = "force-dynamic";

export async function GET() {
  const token = await getOrCreateCsrfToken();
  return NextResponse.json({ token });
}
