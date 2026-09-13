import { NextResponse, type NextRequest } from "next/server";
import { readLocalFile } from "@/lib/localStorage";

/**
 * Serves locally-stored uploads (see lib/localStorage.ts for why these
 * live outside `public/` and are served through an explicit route rather
 * than relying on Next's static-file serving). Public — no auth required,
 * these are meant to be publicly viewable images (featured images, logos,
 * author photos), same visibility as the R2 public-bucket path.
 *
 * Security: only serves paths starting with "uploads/" and rejects any
 * ".." traversal attempt (both checked again inside readLocalImage as a
 * second layer, not just here).
 */
export async function GET(request: NextRequest) {
  const requestedPath = request.nextUrl.searchParams.get("path");
  if (!requestedPath) {
    return new NextResponse("Missing path", { status: 400 });
  }

  const result = await readLocalFile(requestedPath);
  if (!result) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(new Uint8Array(result.data), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      // 1 year — filenames include a timestamp+random suffix, so a given
      // path's content never changes; safe to cache aggressively.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
