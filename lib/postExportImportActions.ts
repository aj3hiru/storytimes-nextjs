"use server";

import { requireUser, resolvePermissions } from "./auth";
import type { CategoryExportStat } from "./postExportImport";
import { prisma } from "./db";

async function requireAdmin() {
  const user = await requireUser();
  if (!user || (user.role !== "admin" && !resolvePermissions(user).tools.import_export)) {
    throw new Error("You do not have permission to use Import & Export.");
  }
  return user;
}

/** Category list + published-post counts for the export checkboxes —
 *  equivalent of admin/import-export.php's ?action=get_category_stats
 *  AJAX endpoint. */
// Real bug fixed here — the cause of "Import & Export work nahi kar raha,
// 't is not a function'": this file carries the "use server" directive,
// and Next.js requires that such a module export ONLY async functions.
// It also exported this interface, which breaks the module's generated
// server-action binding at runtime — every export gets wrapped as an
// action reference, so the non-function one resolves to something that
// isn't callable, and the first client call into this module throws
// "<minified name> is not a function". Moved to lib/postExportImport.ts
// (a plain server-only module, no "use server"), which is also where the
// other shared types this feature uses already live.

export async function getCategoryExportStats(): Promise<{ categories: CategoryExportStat[]; total: number }> {
  await requireAdmin();
  const categories = await prisma.category.findMany({
    select: { id: true, name: true, _count: { select: { posts: { where: { status: "published" } } } } },
    orderBy: { name: "asc" },
  });
  const total = await prisma.post.count({ where: { status: "published" } });
  return {
    categories: categories.map((c) => ({ id: c.id, name: c.name, totalPosts: c._count.posts })),
    total,
  };
}
