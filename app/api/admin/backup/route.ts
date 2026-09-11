import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Scoped port of admin/backup-restore.php: exports the core content
 * tables as JSON (not a full mysqldump-equivalent — that's out of scope
 * for an API route). Restore is NOT implemented here; re-importing this
 * JSON safely (id collisions, foreign key order) needs careful design and
 * is a good follow-up rather than something to rush.
 */
export async function GET() {
  const user = await requireUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
  }

  const [posts, categories, tags, authors, pages, appConfig, siteSettings] = await Promise.all([
    prisma.post.findMany(),
    prisma.category.findMany(),
    prisma.tag.findMany(),
    prisma.author.findMany(),
    prisma.page.findMany(),
    prisma.appConfig.findMany(),
    prisma.siteSetting.findMany(),
  ]);

  const backup = {
    exportedAt: new Date().toISOString(),
    posts,
    categories,
    tags,
    authors,
    pages,
    appConfig,
    siteSettings,
  };

  return new NextResponse(JSON.stringify(backup, (_key, value) => (typeof value === "bigint" ? value.toString() : value), 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="backup-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
