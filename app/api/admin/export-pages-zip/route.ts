import { NextResponse, type NextRequest } from "next/server";
import { PassThrough } from "node:stream";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { buildPagesExportArchive } from "@/lib/postExportImport";

/** Replaces admin/import-export.php's ?action=export_pages POST handler. */
export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ success: false, message: "Admin access required." }, { status: 403 });
  }

  const siteRow = await prisma.siteSetting.findUnique({ where: { settingKey: "site_title" } }).catch(() => null);
  const siteName = siteRow?.settingValue || "Site";

  try {
    const archive = await buildPagesExportArchive({
      siteName,
      siteUrl: request.nextUrl.origin,
      exportedBy: user.username ?? "Admin",
    });

    const passthrough = new PassThrough();
    archive.pipe(passthrough);

    const filename = `pages_export_${new Date().toISOString().replace(/[:.]/g, "-")}.zip`;
    // @ts-expect-error — Node Readable is a valid BodyInit at runtime here.
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
