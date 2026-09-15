import "server-only";
import * as archiverNs from "archiver";
import AdmZip from "adm-zip";
import { prisma } from "./db";
import { resolveLocalPath, saveImportedFile } from "./localStorage";

// Same cast-around-bad-types trick used in app/api/media/bulk-download/route.ts —
// the installed @types/archiver doesn't expose the callable factory shape.
type ArchiverFactory = (format: "zip", options: { zlib: { level: number } }) => import("archiver").Archiver;
const createArchive = archiverNs as unknown as ArchiverFactory;

/**
 * Full-fidelity ZIP export/import — this ports admin/import-export.php's
 * "Export Posts" / "Export Pages" / "Import" flow (JSON-per-item + bundled
 * media + manifest.json + conflict-resolution import), which is a
 * completely different feature from the CSV bulk-importer this file
 * replaces. That CSV importer doesn't exist in newsbase at all — it was an
 * invented substitute — so this is the real one.
 */

// ── Shared helpers ──────────────────────────────────────────────────────

/** This app's own media URL convention is `/upload/media/<relative>` →
 *  local disk path `uploads/<relative>` (see lib/localStorage.ts's
 *  buildPublicUrl()). Only images served through that convention are
 *  bundled into the export archive — external/CDN images are left as-is
 *  in the exported HTML, same as the PHP version only bundling images
 *  under SITE_URL. */
function mediaUrlToLocalPath(src: string): string | null {
  if (src.startsWith("/upload/media/")) {
    return "uploads/" + src.slice("/upload/media/".length);
  }
  return null;
}

function extractImgSrcs(html: string): string[] {
  const out: string[] = [];
  const re = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) out.push(m[1]);
  return out;
}

interface SiteMeta {
  siteName: string;
  siteUrl: string;
  exportedBy: string;
}

// ── Export: Posts ───────────────────────────────────────────────────────

export async function buildPostsExportArchive(categoryIds: number[], meta: SiteMeta) {
  const posts = await prisma.post.findMany({
    where: {
      status: "published",
      ...(categoryIds.length > 0 ? { categoryId: { in: categoryIds } } : {}),
    },
    include: {
      category: true,
      author: true,
      featuredImage: true,
      postMeta: true,
      postTags: { include: { tag: true } },
      postCategories: { include: { category: true } },
    },
    orderBy: { date: "desc" },
  });

  if (posts.length === 0) {
    throw new Error("No published posts found for selected categories.");
  }

  const archive = createArchive("zip", { zlib: { level: 6 } });
  const mediaTracker = new Set<string>();
  const categoryNames = new Set<string>();

  const addLocalFile = (relativeUploadsPath: string, zipPath: string) => {
    if (mediaTracker.has(zipPath)) return;
    const abs = resolveLocalPath(relativeUploadsPath);
    if (!abs) return;
    archive.file(abs, { name: zipPath });
    mediaTracker.add(zipPath);
  };

  for (const post of posts) {
    categoryNames.add(post.category.name);

    const keywords = post.postMeta.find((m) => m.metaKey === "keywords")?.metaValue ?? "";
    const description = post.postMeta.find((m) => m.metaKey === "description")?.metaValue ?? "";

    const entry: Record<string, unknown> = {
      title: post.title,
      slug: post.slug,
      content: post.content,
      excerpt: post.excerpt ?? "",
      status: post.status,
      created_at: post.date?.toISOString() ?? null,
      updated_at: post.updatedAt?.toISOString() ?? null,
      last_date: post.lastDate?.toISOString() ?? null,
      faq_json: post.faqJson ?? null,
      category_name: post.category.name,
      category_slug: post.category.slug,
      additional_cats: post.postCategories
        .filter((pc) => pc.categoryId !== post.categoryId)
        .map((pc) => ({ id: pc.category.id, name: pc.category.name, slug: pc.category.slug })),
      author_name: post.author.name,
      meta_keywords: keywords,
      meta_description: description,
      featured_image: null as string | null,
      content_media: [] as { original_src: string; zip_path: string }[],
      tags: post.postTags.map((pt) => ({ name: pt.tag.name, slug: pt.tag.slug })),
    };

    if (post.featuredImage?.filePath) {
      const zipPath = `media/${post.featuredImage.filePath.split("/").pop()}`;
      addLocalFile(post.featuredImage.filePath, zipPath);
      entry.featured_image = zipPath;

      if (post.featuredImage.responsiveSet) {
        try {
          const respSet: Record<string, string> = JSON.parse(post.featuredImage.responsiveSet);
          const respOut: Record<string, string> = {};
          for (const [size, relPath] of Object.entries(respSet)) {
            const zp = `media/${relPath.split("/").pop()}`;
            addLocalFile(relPath, zp);
            respOut[size] = zp;
          }
          entry.featured_image_responsive = respOut;
        } catch {
          // malformed responsive_set JSON — skip variants, featured image itself still exported
        }
      }
    }

    if (post.content) {
      for (const src of extractImgSrcs(post.content)) {
        const localPath = mediaUrlToLocalPath(src);
        if (!localPath) continue;
        const zp = `media/${localPath.split("/").pop()}`;
        addLocalFile(localPath, zp);
        (entry.content_media as unknown[]).push({ original_src: src, zip_path: zp });
      }
    }

    archive.append(JSON.stringify(entry, null, 2), { name: `posts/${post.slug}.json` });
  }

  const manifest = {
    type: "posts_export",
    cms_version: "storytimes-nextjs",
    site_url: meta.siteUrl,
    site_name: meta.siteName,
    export_date: new Date().toISOString(),
    total_posts: posts.length,
    categories: Array.from(categoryNames),
    exported_by: meta.exportedBy,
  };
  archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
  archive.finalize();
  return archive;
}

// ── Export: Pages ────────────────────────────────────────────────────────

export async function buildPagesExportArchive(meta: SiteMeta) {
  const pages = await prisma.page.findMany({ orderBy: { createdAt: "desc" } });
  if (pages.length === 0) {
    throw new Error("No pages found to export.");
  }

  const archive = createArchive("zip", { zlib: { level: 6 } });
  const mediaTracker = new Set<string>();

  for (const page of pages) {
    const entry: Record<string, unknown> = {
      title: page.title,
      slug: page.slug,
      content: page.content ?? "",
      status: page.status,
      meta_title: page.metaTitle ?? "",
      meta_description: page.metaDescription ?? "",
      created_at: page.createdAt?.toISOString() ?? null,
      updated_at: page.updatedAt?.toISOString() ?? null,
      content_media: [] as { original_src: string; zip_path: string }[],
    };

    if (page.content) {
      for (const src of extractImgSrcs(page.content)) {
        const localPath = mediaUrlToLocalPath(src);
        if (!localPath) continue;
        const zp = `media/${localPath.split("/").pop()}`;
        if (!mediaTracker.has(zp)) {
          const abs = resolveLocalPath(localPath);
          if (abs) {
            archive.file(abs, { name: zp });
            mediaTracker.add(zp);
          }
        }
        (entry.content_media as unknown[]).push({ original_src: src, zip_path: zp });
      }
    }

    archive.append(JSON.stringify(entry, null, 2), { name: `pages/${page.slug}.json` });
  }

  const manifest = {
    type: "pages_export",
    cms_version: "storytimes-nextjs",
    site_url: meta.siteUrl,
    site_name: meta.siteName,
    export_date: new Date().toISOString(),
    total_pages: pages.length,
    exported_by: meta.exportedBy,
  };
  archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
  archive.finalize();
  return archive;
}

// ── Import: scan (dry run — conflict detection only) ────────────────────

export interface ImportConflict {
  slug: string;
  title: string;
  existingId: number;
  existingTitle: string;
}

export interface ScanResult {
  type: "posts_export" | "pages_export";
  conflicts: ImportConflict[];
}

export async function scanImportZip(buffer: Buffer): Promise<ScanResult> {
  const zip = new AdmZip(buffer);
  const manifestEntry = zip.getEntry("manifest.json");
  if (!manifestEntry) throw new Error("Invalid export file: manifest.json not found.");
  const manifest = JSON.parse(zip.readAsText(manifestEntry));
  const type = manifest.type as string;
  if (type !== "posts_export" && type !== "pages_export") {
    throw new Error("Unknown export type in manifest.");
  }

  const prefix = type === "posts_export" ? "posts/" : "pages/";
  const conflicts: ImportConflict[] = [];
  for (const zipEntry of zip.getEntries()) {
    if (zipEntry.isDirectory) continue;
    if (!zipEntry.entryName.startsWith(prefix) || !zipEntry.entryName.endsWith(".json")) continue;
    const item = JSON.parse(zip.readAsText(zipEntry));
    if (!item?.slug) continue;

    const existing =
      type === "posts_export"
        ? await prisma.post.findUnique({ where: { slug: item.slug }, select: { id: true, title: true } })
        : await prisma.page.findUnique({ where: { slug: item.slug }, select: { id: true, title: true } });

    if (existing) {
      conflicts.push({ slug: item.slug, title: item.title, existingId: existing.id, existingTitle: existing.title });
    }
  }

  return { type: type as "posts_export" | "pages_export", conflicts };
}

// ── Import: commit ───────────────────────────────────────────────────────

export type ImportDecision = "skip" | "replace" | "keep_both";

export interface ImportCommitResult {
  imported: number;
  replaced: number;
  renamed: number;
  skipped: number;
}

async function writeZipEntryToUploads(zip: AdmZip, zipPath: string, prefix: string): Promise<string | null> {
  const entry = zip.getEntry(zipPath);
  if (!entry) return null;
  const ext = zipPath.split(".").pop() || "bin";
  const data = entry.getData();
  return saveImportedFile(data, `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
}

export async function commitImportZip(
  buffer: Buffer,
  decisions: Record<string, ImportDecision>,
  userId: number
): Promise<ImportCommitResult & { type: "posts_export" | "pages_export" }> {
  const zip = new AdmZip(buffer);
  const manifestEntry = zip.getEntry("manifest.json");
  if (!manifestEntry) throw new Error("Invalid export file: manifest.json not found.");
  const manifest = JSON.parse(zip.readAsText(manifestEntry));
  const type = manifest.type as "posts_export" | "pages_export";

  let imported = 0;
  let replaced = 0;
  let renamed = 0;
  let skipped = 0;

  if (type === "posts_export") {
    const fallbackAuthor = await prisma.author.findFirst({ orderBy: { id: "asc" } });

    for (const zipEntry of zip.getEntries()) {
      if (zipEntry.isDirectory) continue;
      if (!zipEntry.entryName.startsWith("posts/") || !zipEntry.entryName.endsWith(".json")) continue;
      const post = JSON.parse(zip.readAsText(zipEntry));
      if (!post?.slug) continue;

      let slug = String(post.slug);
      const existing = await prisma.post.findUnique({ where: { slug }, select: { id: true } });
      const decision = decisions[slug] ?? "keep_both";

      if (existing && decision === "skip") {
        skipped++;
        continue;
      }

      let title = String(post.title ?? slug);
      if (existing && decision === "keep_both") {
        let suffix = 1;
        let candidate = `${slug}-${suffix}`;
        while (await prisma.post.findUnique({ where: { slug: candidate }, select: { id: true } })) {
          suffix++;
          candidate = `${slug}-${suffix}`;
        }
        slug = candidate;
        title = `${title} (${suffix})`;
        renamed++;
      }

      // Featured image + its responsive variants
      let featuredImageId: number | null = null;
      if (post.featured_image) {
        const newPath = await writeZipEntryToUploads(zip, post.featured_image, `${slug}-feat`);
        if (newPath) {
          const respSetDb: Record<string, string> = {};
          if (post.featured_image_responsive) {
            for (const [size, zp] of Object.entries(post.featured_image_responsive as Record<string, string>)) {
              const rp = await writeZipEntryToUploads(zip, zp, `${slug}-${size}`);
              if (rp) respSetDb[size] = rp;
            }
          }
          const media = await prisma.media.create({
            data: {
              filePath: newPath,
              fileType: "banner",
              altText: `${title} banner`,
              responsiveSet: Object.keys(respSetDb).length ? JSON.stringify(respSetDb) : null,
              uploadedBy: userId,
            },
          });
          featuredImageId = media.id;
        }
      }

      // Content images
      let content: string = post.content ?? "";
      if (Array.isArray(post.content_media)) {
        for (const cm of post.content_media as { original_src: string; zip_path: string }[]) {
          const newPath = await writeZipEntryToUploads(zip, cm.zip_path, "img");
          if (!newPath) continue;
          const newSrc = `/upload/media/${newPath.replace(/^uploads\//, "")}`;
          content = content.split(cm.original_src).join(newSrc);
          await prisma.media.create({ data: { filePath: newPath, fileType: "image", uploadedBy: userId } });
        }
      }

      // Category (primary)
      let categoryId: number;
      if (post.category_slug) {
        const cat = await prisma.category.upsert({
          where: { slug: post.category_slug },
          create: { name: post.category_name || post.category_slug, slug: post.category_slug },
          update: {},
        });
        categoryId = cat.id;
      } else {
        const defaultCat = await prisma.category.findFirst({ orderBy: { id: "asc" } });
        if (!defaultCat) throw new Error("No categories exist on this site.");
        categoryId = defaultCat.id;
      }

      // Author — match by name, else fall back to the site's first author,
      // same as the PHP version (which refuses the import outright if
      // there are no authors at all to fall back to).
      let authorId: number | null = null;
      if (post.author_name) {
        const author = await prisma.author.findFirst({ where: { name: post.author_name } });
        if (author) authorId = author.id;
      }
      if (!authorId) authorId = fallbackAuthor?.id ?? null;
      if (!authorId) {
        throw new Error("No authors exist on this site. Please create at least one author before importing posts.");
      }

      let postId: number;
      if (existing && decision === "replace") {
        await prisma.post.update({
          where: { id: existing.id },
          data: {
            title,
            content,
            excerpt: post.excerpt ?? "",
            slug,
            categoryId,
            authorId,
            status: post.status ?? "draft",
            featuredImageId,
            lastDate: post.last_date ? new Date(post.last_date) : null,
            faqJson: post.faq_json ?? null,
          },
        });
        postId = existing.id;
        replaced++;
      } else {
        const created = await prisma.post.create({
          data: {
            title,
            content,
            excerpt: post.excerpt ?? "",
            slug,
            categoryId,
            authorId,
            status: post.status ?? "draft",
            featuredImageId,
            lastDate: post.last_date ? new Date(post.last_date) : null,
            faqJson: post.faq_json ?? null,
            date: post.created_at ? new Date(post.created_at) : new Date(),
          },
        });
        postId = created.id;
        imported++;
      }

      // Meta (keywords / description) — no unique constraint on
      // (postId, metaKey) in this schema, so upsert manually.
      for (const [key, value] of [
        ["keywords", post.meta_keywords],
        ["description", post.meta_description],
      ] as const) {
        if (!value) continue;
        const existingMeta = await prisma.postMeta.findFirst({ where: { postId, metaKey: key } });
        if (existingMeta) {
          await prisma.postMeta.update({ where: { id: existingMeta.id }, data: { metaValue: value } });
        } else {
          await prisma.postMeta.create({ data: { postId, metaKey: key, metaValue: value } });
        }
      }

      // Tags
      if (Array.isArray(post.tags)) {
        for (const tag of post.tags as { name: string; slug: string }[]) {
          if (!tag?.slug) continue;
          const tagRow = await prisma.tag.upsert({
            where: { slug: tag.slug },
            create: { name: tag.name, slug: tag.slug },
            update: {},
          });
          await prisma.postTag
            .create({ data: { postId, tagId: tagRow.id } })
            .catch(() => {}); // already linked — ignore, mirrors PHP's INSERT IGNORE
        }
      }

      // Additional categories
      if (Array.isArray(post.additional_cats)) {
        for (const ac of post.additional_cats as { name: string; slug: string }[]) {
          if (!ac?.slug) continue;
          const acRow = await prisma.category.upsert({
            where: { slug: ac.slug },
            create: { name: ac.name, slug: ac.slug },
            update: {},
          });
          await prisma.postCategory
            .create({ data: { postId, categoryId: acRow.id } })
            .catch(() => {});
        }
      }
    }

    await prisma.activityLog.create({
      data: {
        userId,
        actionType: "post_import",
        description: `Imported posts: ${imported} new, ${replaced} replaced, ${renamed} renamed, ${skipped} skipped`,
      },
    });
  } else {
    for (const zipEntry of zip.getEntries()) {
      if (zipEntry.isDirectory) continue;
      if (!zipEntry.entryName.startsWith("pages/") || !zipEntry.entryName.endsWith(".json")) continue;
      const page = JSON.parse(zip.readAsText(zipEntry));
      if (!page?.slug) continue;

      let slug = String(page.slug);
      const existing = await prisma.page.findUnique({ where: { slug }, select: { id: true } });
      const decision = decisions[slug] ?? "keep_both";

      if (existing && decision === "skip") {
        skipped++;
        continue;
      }

      let title = String(page.title ?? slug);
      if (existing && decision === "keep_both") {
        let suffix = 1;
        let candidate = `${slug}-${suffix}`;
        while (await prisma.page.findUnique({ where: { slug: candidate }, select: { id: true } })) {
          suffix++;
          candidate = `${slug}-${suffix}`;
        }
        slug = candidate;
        title = `${title} (${suffix})`;
        renamed++;
      }

      let content: string = page.content ?? "";
      if (Array.isArray(page.content_media)) {
        for (const cm of page.content_media as { original_src: string; zip_path: string }[]) {
          const newPath = await writeZipEntryToUploads(zip, cm.zip_path, "img");
          if (!newPath) continue;
          const newSrc = `/upload/media/${newPath.replace(/^uploads\//, "")}`;
          content = content.split(cm.original_src).join(newSrc);
        }
      }

      if (existing && decision === "replace") {
        await prisma.page.update({
          where: { id: existing.id },
          data: {
            title,
            slug,
            content,
            status: page.status ?? "draft",
            metaTitle: page.meta_title ?? "",
            metaDescription: page.meta_description ?? "",
          },
        });
        replaced++;
      } else {
        await prisma.page.create({
          data: {
            title,
            slug,
            content,
            status: page.status ?? "draft",
            metaTitle: page.meta_title ?? "",
            metaDescription: page.meta_description ?? "",
          },
        });
        imported++;
      }
    }

    await prisma.activityLog.create({
      data: {
        userId,
        actionType: "page_import",
        description: `Imported pages: ${imported} new, ${replaced} replaced, ${renamed} renamed, ${skipped} skipped`,
      },
    });
  }

  return { type, imported, replaced, renamed, skipped };
}


/** Per-category export stats for the Import/Export page's category
 *  checkboxes. Lives here rather than in postExportImportActions.ts
 *  because that file is a "use server" module, which may only export
 *  async functions — see the comment there for the runtime bug that
 *  caused. */
export interface CategoryExportStat {
  id: number;
  name: string;
  totalPosts: number;
}
