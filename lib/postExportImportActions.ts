"use server";

import { requireUser } from "./auth";
import { prisma } from "./db";
import {
  scanImportZip,
  commitImportZip,
  type ScanResult,
  type ImportDecision,
  type ImportCommitResult,
} from "./postExportImport";

async function requireAdmin() {
  const user = await requireUser();
  if (!user || user.role !== "admin") throw new Error("Admin access required.");
  return user;
}

/** Category list + published-post counts for the export checkboxes —
 *  equivalent of admin/import-export.php's ?action=get_category_stats
 *  AJAX endpoint. */
export interface CategoryExportStat {
  id: number;
  name: string;
  totalPosts: number;
}

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

/** Step 1 of import: upload the ZIP, get back any slug conflicts with
 *  existing posts/pages so the admin can decide skip/replace/keep-both
 *  per item before anything is written. */
export async function scanImportAction(formData: FormData): Promise<ScanResult> {
  await requireAdmin();
  const file = formData.get("importFile");
  if (!(file instanceof File)) throw new Error("No file uploaded.");
  const buffer = Buffer.from(await file.arrayBuffer());
  return scanImportZip(buffer);
}

/** Step 2 of import: same ZIP, plus the admin's per-slug decisions,
 *  actually writes everything. */
export async function commitImportAction(formData: FormData): Promise<ImportCommitResult & { type: string }> {
  const user = await requireAdmin();
  const file = formData.get("importFile");
  if (!(file instanceof File)) throw new Error("No file uploaded.");
  const decisionsRaw = String(formData.get("decisions") ?? "{}");
  let decisions: Record<string, ImportDecision> = {};
  try {
    decisions = JSON.parse(decisionsRaw);
  } catch {
    // malformed decisions payload — fall back to "keep_both" for everything
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  return commitImportZip(buffer, decisions, user.id);
}
