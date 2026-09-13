import { NextResponse, type NextRequest } from "next/server";
import { readLocalFile } from "@/lib/localStorage";

/**
 * Real bug fixed here (this is the second, more robust fix, after a
 * middleware-based rewrite proved unreliable in production): rather
 * than REWRITING `/upload/media/<path>` requests to the pre-existing
 * `/api/media/file?path=...` route through either next.config.ts's
 * `rewrites()` (broken — Next.js's wildcard parameter substitution
 * doesn't reliably expand inside a query-string value) or a
 * middleware-level rewrite (still 400'd with "Missing path" even
 * though the middleware's own `x-middleware-rewrite` response header
 * showed the correct target URL — some internal NextURL/RSC state was
 * evidently carrying over in a way that broke the API route's own
 * `searchParams.get("path")` read), this is a genuine, first-class
 * Next.js route handler for `/upload/media/*` — no rewriting to a
 * DIFFERENT route involved at all. It reuses the exact same
 * `readLocalFile()` the original `/api/media/file` route already used
 * correctly, just called directly instead of routed to indirectly.
 * This is the clean, professional public-facing URL for every
 * uploaded file across the site (see lib/urls.ts's resolveMediaUrl()).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path: pathSegments } = await params;
  if (!pathSegments || pathSegments.length === 0) {
    return new NextResponse("Missing path", { status: 400 });
  }

  const requestedPath = `uploads/${pathSegments.join("/")}`;
  const result = await readLocalFile(requestedPath);
  if (!result) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(new Uint8Array(result.data), {
    status: 200,
    headers: {
      "Content-Type": result.contentType,
      // 1 year — filenames include a timestamp+random suffix, so a
      // given path's content never changes; safe to cache aggressively.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
