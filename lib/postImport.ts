"use server";

import Papa from "papaparse";
import { prisma } from "./db";
import { requireUser } from "./auth";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export interface ImportRow {
  rowNumber: number;
  title: string;
  slug: string;
  category: string;
  status: string;
  tags: string[];
  errors: string[];
}

export interface ImportPreview {
  rows: ImportRow[];
  validCount: number;
  errorCount: number;
}

const REQUIRED_COLUMNS = ["title", "content", "category"];
const ALLOWED_STATUSES = new Set(["draft", "published", "archived"]);

interface CsvRow {
  title?: string;
  slug?: string;
  content?: string;
  excerpt?: string;
  category?: string;
  tags?: string;
  status?: string;
}

/**
 * Validates a CSV without writing anything — the admin UI calls this
 * first so the person can see exactly what will happen (which rows are
 * valid, which will be rejected and why) before committing. This
 * dry-run-first pattern is the "careful validation/dedup design" this
 * project's README flagged bulk import as needing before it was safe to
 * ship.
 */
export async function previewPostImport(csvText: string): Promise<ImportPreview> {
  const user = await requireUser();
  if (!user || (user.role !== "admin" && user.role !== "editor")) {
    throw new Error("Admin or editor access required.");
  }

  const parsed = Papa.parse<CsvRow>(csvText, { header: true, skipEmptyLines: true });
  const missingColumns = REQUIRED_COLUMNS.filter((c) => !parsed.meta.fields?.includes(c));
  if (missingColumns.length > 0) {
    throw new Error(`CSV is missing required column(s): ${missingColumns.join(", ")}`);
  }

  const categories = await prisma.category.findMany({ select: { id: true, name: true, slug: true } });
  const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));

  const rows: ImportRow[] = [];
  let rowNumber = 1;
  for (const raw of parsed.data) {
    rowNumber++;
    const errors: string[] = [];
    const title = (raw.title ?? "").trim();
    const content = (raw.content ?? "").trim();
    const categoryName = (raw.category ?? "").trim();
    const status = (raw.status ?? "draft").trim().toLowerCase() || "draft";
    const tags = (raw.tags ?? "")
      .split(";")
      .map((t) => t.trim())
      .filter(Boolean);

    if (!title) errors.push("Missing title");
    if (!content) errors.push("Missing content");
    if (!categoryName) errors.push("Missing category");
    else if (!categoryByName.has(categoryName.toLowerCase())) {
      errors.push(`Unknown category "${categoryName}" (create it first in Categories Manager)`);
    }
    if (!ALLOWED_STATUSES.has(status)) errors.push(`Invalid status "${status}"`);

    const slug = (raw.slug ?? "").trim() || slugify(title);
    if (slug) {
      const existing = await prisma.post.findUnique({ where: { slug }, select: { id: true } });
      if (existing) errors.push(`Slug "${slug}" already exists`);
    }

    rows.push({ rowNumber, title, slug, category: categoryName, status, tags, errors });
  }

  return {
    rows,
    validCount: rows.filter((r) => r.errors.length === 0).length,
    errorCount: rows.filter((r) => r.errors.length > 0).length,
  };
}

export interface ImportResult {
  created: number;
  skipped: number;
  errors: string[];
}

/** Commits the import: creates a post for every row with no validation
 *  errors, skips the rest. Call previewPostImport() first and show the
 *  person what will happen — this function trusts the CSV is already
 *  validated and doesn't re-check for a nicer error UI, just skips
 *  anything invalid defensively. */
export async function commitPostImport(csvText: string): Promise<ImportResult> {
  const user = await requireUser();
  if (!user || (user.role !== "admin" && user.role !== "editor")) {
    throw new Error("Admin or editor access required.");
  }

  const author = await prisma.author.findUnique({ where: { userId: user.id } });
  if (!author) {
    throw new Error("No author profile is linked to your account yet — ask an admin to create one.");
  }

  const parsed = Papa.parse<CsvRow>(csvText, { header: true, skipEmptyLines: true });
  const categories = await prisma.category.findMany({ select: { id: true, name: true } });
  const categoryByName = new Map(categories.map((c) => [c.name.toLowerCase(), c]));

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const [i, raw] of parsed.data.entries()) {
    const rowNumber = i + 2;
    const title = (raw.title ?? "").trim();
    const content = (raw.content ?? "").trim();
    const categoryName = (raw.category ?? "").trim();
    const status = (raw.status ?? "draft").trim().toLowerCase();
    const category = categoryByName.get(categoryName.toLowerCase());

    if (!title || !content || !category || !ALLOWED_STATUSES.has(status)) {
      skipped++;
      errors.push(`Row ${rowNumber}: skipped (missing required field or unknown category)`);
      continue;
    }

    const slug = (raw.slug ?? "").trim() || slugify(title);
    const clash = await prisma.post.findUnique({ where: { slug }, select: { id: true } });
    if (clash) {
      skipped++;
      errors.push(`Row ${rowNumber}: skipped (slug "${slug}" already exists)`);
      continue;
    }

    try {
      const post = await prisma.post.create({
        data: {
          title,
          slug,
          content,
          excerpt: (raw.excerpt ?? "").trim() || null,
          categoryId: category.id,
          authorId: author.id,
          status: status as "draft" | "published" | "archived",
        },
      });
      await prisma.postCategory.create({ data: { postId: post.id, categoryId: category.id } }).catch(() => {});

      const tagNames = (raw.tags ?? "")
        .split(";")
        .map((t) => t.trim())
        .filter(Boolean);
      for (const tagName of tagNames) {
        const tagSlug = slugify(tagName);
        const tag = await prisma.tag.upsert({
          where: { slug: tagSlug },
          create: { name: tagName, slug: tagSlug },
          update: {},
        });
        await prisma.postTag.create({ data: { postId: post.id, tagId: tag.id } }).catch(() => {});
      }

      created++;
    } catch (err) {
      skipped++;
      errors.push(`Row ${rowNumber}: ${err instanceof Error ? err.message : "unknown error"}`);
    }
  }

  await prisma.activityLog.create({
    data: {
      userId: user.id,
      actionType: "bulk_import",
      description: `Bulk imported ${created} post(s), skipped ${skipped}`,
    },
  });

  return { created, skipped, errors };
}
