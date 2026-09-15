import { NextResponse, type NextRequest } from "next/server";
import { PassThrough } from "node:stream";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildPostsExportArchive } from "@/lib/postExportImport";

/**
 * Replaces admin/import-export.php's ?action=export_posts POST handler.
 * Body: { categoryIds: number[] } — empty/omitted means "all categories",
 * same as the PHP version's empty $cat_ids meaning no WHERE filter.
 */
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ success: false, message: "Admin access required." }, { status: 403 });
  }

  let body: { categoryIds?: number[] };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const categoryIds = (body.categoryIds ?? []).filter((id) => Number.isFinite(id));

  const siteRow = await prisma.siteSetting.findUnique({ where: { settingKey: "site_title" } }).catch(() => null);
  const siteName = siteRow?.settingValue || "Site";

  try {
    const archive = await buildPostsExportArchive(categoryIds, {
      siteName,
      siteUrl: request.nextUrl.origin,
      exportedBy: user.username ?? "Admin",
    });

    const passthrough = new PassThrough();
    archive.pipe(passthrough);

    const filename = `posts_export_${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
    // @ts-expect-error — Node Readable is a valid BodyInit at runtime here,
    // same cast used in app/api/media/bulk-download/route.ts.
    return new NextResponse(passthrough, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : "Export failed." },
      { status: 400 }
    );
  }
}
