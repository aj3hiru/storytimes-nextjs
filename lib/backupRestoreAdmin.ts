"use server";

import { prisma } from "./db";
import { requireUser } from "./auth";

interface BackupCategory {
  name: string;
  slug: string;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
}
interface BackupTag {
  name: string;
  slug: string;
}
interface BackupPage {
  title: string;
  slug: string;
  content: string | null;
  status: string;
  metaTitle: string | null;
  metaDescription: string | null;
}
interface BackupFile {
  categories?: BackupCategory[];
  tags?: BackupTag[];
  pages?: BackupPage[];
  posts?: unknown[];
}

export interface RestoreResult {
  categoriesRestored: number;
  tagsRestored: number;
  pagesRestored: number;
  postsSkipped: number;
  errors: string[];
}

/**
 * Deliberately a MERGE, not a destructive restore: categories/tags are
 * upserted by their unique slug (safe to re-run), pages are upserted by
 * slug, and posts are intentionally NOT auto-restored (they reference
 * authors/categories by numeric id, which won't line up with a different
 * database's ids — restoring them blindly risks silently attaching a post
 * to the wrong category or author). Posts found in the backup are counted
 * as "skipped" with an explanation so nothing is silently lost, but
 * nothing is silently corrupted either.
 */
export async function restoreFromBackup(jsonText: string): Promise<RestoreResult> {
  const user = await requireUser();
  if (!user || user.role !== "admin") {
    throw new Error("Admin access required.");
  }

  let data: BackupFile;
  try {
    data = JSON.parse(jsonText);
  } catch {
    throw new Error("Invalid JSON file.");
  }

  const errors: string[] = [];
  let categoriesRestored = 0;
  let tagsRestored = 0;
  let pagesRestored = 0;

  for (const cat of data.categories ?? []) {
    try {
      await prisma.category.upsert({
        where: { slug: cat.slug },
        create: {
          name: cat.name,
          slug: cat.slug,
          metaTitle: cat.metaTitle,
          metaDescription: cat.metaDescription,
          metaKeywords: cat.metaKeywords,
        },
        update: { name: cat.name },
      });
      categoriesRestored++;
    } catch (err) {
      errors.push(`Category "${cat.slug}": ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  for (const tag of data.tags ?? []) {
    try {
      await prisma.tag.upsert({
        where: { slug: tag.slug },
        create: { name: tag.name, slug: tag.slug },
        update: { name: tag.name },
      });
      tagsRestored++;
    } catch (err) {
      errors.push(`Tag "${tag.slug}": ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  for (const page of data.pages ?? []) {
    try {
      await prisma.page.upsert({
        where: { slug: page.slug },
        create: {
          title: page.title,
          slug: page.slug,
          content: page.content,
          status: page.status as "draft" | "published",
          metaTitle: page.metaTitle,
          metaDescription: page.metaDescription,
        },
        update: { title: page.title, content: page.content, status: page.status as "draft" | "published" },
      });
      pagesRestored++;
    } catch (err) {
      errors.push(`Page "${page.slug}": ${err instanceof Error ? err.message : "failed"}`);
    }
  }

  const postsSkipped = data.posts?.length ?? 0;
  if (postsSkipped > 0) {
    errors.push(
      `${postsSkipped} post(s) in the backup were NOT restored — post restoration needs author/category id ` +
        `remapping between databases, which isn't safe to do automatically. Use Import & Export's CSV import instead.`
    );
  }

  await prisma.activityLog.create({
    data: {
      userId: user.id,
      actionType: "backup_restore",
      description: `Restored ${categoriesRestored} categories, ${tagsRestored} tags, ${pagesRestored} pages from backup`,
    },
  });

  return { categoriesRestored, tagsRestored, pagesRestored, postsSkipped, errors };
}
