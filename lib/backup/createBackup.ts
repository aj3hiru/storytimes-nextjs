import "server-only";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import * as archiverNs from "archiver";
// Same type-declaration workaround as app/api/media/bulk-download/route.ts —
// the installed @types/archiver doesn't expose a default-exported factory,
// even though the actual package is callable this way at runtime.
type ArchiverFactory = (format: "zip", options: { zlib: { level: number } }) => import("archiver").Archiver;
const archiver = archiverNs as unknown as ArchiverFactory;
import { prisma } from "../db";
import { getAllTables, quoteIdent } from "../dbIntrospection";
import { resolveSiteConfig } from "../config";

export const BACKUPS_DIR = path.join(process.cwd(), "backups");
/** Must resolve to the SAME directory lib/localStorage.ts serves from —
 *  otherwise a backup silently archives an empty folder while the real
 *  media sits elsewhere, and a restore writes files nothing can read.
 *  Kept in sync by reading the same `UPLOAD_DIR` env var. */
export const UPLOADS_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), "uploads");

const ROW_BATCH_SIZE = 500; // rows pulled from MySQL per page — keeps memory flat regardless of table size

export function ensureBackupsDir() {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

/**
 * Streams one table out as newline-delimited JSON (one row per line)
 * without ever holding the whole table in memory — pages through with
 * LIMIT/OFFSET, ROW_BATCH_SIZE rows at a time. This is what lets a
 * multi-million-row `posts` or `visitor_log` table back up safely instead
 * of blowing up memory the way `JSON.stringify(allRows)` would.
 * `onRows` fires after every batch is read, for progress reporting.
 */
function tableToNdjsonStream(tableName: string, onRows?: (count: number) => void): Readable {
  let offset = 0;
  let done = false;
  return new Readable({
    async read() {
      if (done) {
        this.push(null);
        return;
      }
      try {
        const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
          `SELECT * FROM ${quoteIdent(tableName)} LIMIT ${ROW_BATCH_SIZE} OFFSET ${offset}`
        );
        if (rows.length === 0) {
          done = true;
          this.push(null);
          return;
        }
        offset += rows.length;
        onRows?.(rows.length);
        const chunk = rows
          .map((r) => JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? v.toString() : v)))
          .join("\n") + "\n";
        this.push(chunk);
        if (rows.length < ROW_BATCH_SIZE) {
          done = true;
        }
      } catch (err) {
        this.destroy(err instanceof Error ? err : new Error(String(err)));
      }
    },
  });
}

async function countTable(tableName: string): Promise<number> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ c: bigint | number }[]>(
      `SELECT COUNT(*) as c FROM ${quoteIdent(tableName)}`
    );
    return Number(rows[0]?.c ?? 0);
  } catch {
    return 0;
  }
}

export interface CreateBackupOptions {
  label: string;
  includeMedia: boolean;
  createdBy: string;
  userId: number;
}

export interface CreateBackupResult {
  filename: string;
  size: number;
}

export type BackupProgressCallback = (percent: number, stage: string) => void;

export async function createBackup(opts: CreateBackupOptions, onProgress?: BackupProgressCallback): Promise<CreateBackupResult> {
  const report = (percent: number, stage: string) => onProgress?.(Math.min(99, Math.max(0, Math.round(percent))), stage);

  ensureBackupsDir();

  const safeLabel = (opts.label || "manual").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 40) || "manual";
  const ts = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 15); // YYYYMMDDHHmmss
  const zipName = `backup_${safeLabel}_${ts}.zip`;
  const zipPath = path.join(BACKUPS_DIR, zipName);

  const tables = await getAllTables();
  const siteConfig = await resolveSiteConfig("");

  // Row counts per table, up front — doubles as the manifest's
  // table_counts (used by restore for an accurate progress bar there
  // too) and as this backup's own progress denominator.
  report(1, "Counting rows…");
  const tableCountEntries = await Promise.all(tables.map(async (t) => [t.tableName, await countTable(t.tableName)] as const));
  const tableCounts: Record<string, number> = Object.fromEntries(tableCountEntries);
  const totalRows = Object.values(tableCounts).reduce((a, b) => a + b, 0);
  const postCount = tableCounts["posts"] ?? 0;
  const pageCount = tableCounts["pages"] ?? 0;

  let mediaFilesCount = 0;
  if (opts.includeMedia && fs.existsSync(UPLOADS_DIR)) {
    mediaFilesCount = countFilesRecursive(UPLOADS_DIR);
  }

  const totalUnits = Math.max(1, totalRows + mediaFilesCount);
  let unitsDone = 0;
  let lastReportedPercent = -1;
  const reportUnitsProgress = (stage: string) => {
    const percent = (unitsDone / totalUnits) * 95;
    if (Math.round(percent) !== lastReportedPercent) {
      lastReportedPercent = Math.round(percent);
      report(percent, stage);
    }
  };

  const manifest = {
    type: "full_site_backup",
    app: "storytimes-nextjs",
    backup_date: new Date().toISOString(),
    created_by: opts.createdBy,
    site_name: siteConfig.siteName,
    site_url: siteConfig.siteUrl,
    tables: tables.map((t) => t.tableName),
    table_counts: tableCounts,
    include_media: opts.includeMedia,
    media_files: mediaFilesCount,
    total_posts: postCount,
    total_pages: pageCount,
  };

  report(3, "Starting archive…");
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver("zip", { zlib: { level: 6 } });

    output.on("close", () => resolve());
    archive.on("error", (err) => reject(err));
    output.on("error", (err) => reject(err));

    // Fires once per zip entry finished (each table's ndjson file, and —
    // separately counted via unitsDone above for finer granularity —
    // isn't used for media since we track those file-by-file instead.
    archive.on("entry", (data: { name: string }) => {
      if (data.name.startsWith("media/")) {
        unitsDone++;
        reportUnitsProgress("Adding media files…");
      }
    });

    archive.pipe(output);

    // manifest first, so a scan of a partially-corrupt zip can still find it
    archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });

    // one streamed NDJSON file per table
    for (const t of tables) {
      archive.append(
        tableToNdjsonStream(t.tableName, (count) => {
          unitsDone += count;
          reportUnitsProgress(`Backing up ${t.tableName}…`);
        }),
        { name: `database/${t.tableName}.ndjson` }
      );
    }

    // media — archiver walks + streams the directory itself, file by file
    if (opts.includeMedia && fs.existsSync(UPLOADS_DIR)) {
      archive.directory(UPLOADS_DIR, "media");
    }

    archive.finalize().catch(reject);
  });

  report(99, "Finishing up…");
  const size = fs.statSync(zipPath).size;

  try {
    await prisma.activityLog.create({
      data: {
        userId: opts.userId,
        actionType: "backup_create",
        description: `Backup created: ${zipName} (posts: ${postCount}, pages: ${pageCount}, media: ${opts.includeMedia})`,
      },
    });
  } catch {
    // activity log failure shouldn't fail the backup itself
  }

  report(100, "Done");
  return { filename: zipName, size };
}

function countFilesRecursive(dir: string): number {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) count += countFilesRecursive(full);
    else count++;
  }
  return count;
}

export function dirSizeRecursive(dir: string): number {
  let size = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) size += dirSizeRecursive(full);
    else size += fs.statSync(full).size;
  }
  return size;
}
