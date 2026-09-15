import "server-only";
import fs from "fs";
import path from "path";
import readline from "readline";
import unzipper from "unzipper";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { getAllTables, getLiveColumns, getLiveDateColumns, toMysqlDateTimeString, quoteIdent } from "../dbIntrospection";
import { resolveSiteConfig } from "../config";
import { revokeAllSessions } from "../authSession";
import { UPLOADS_DIR } from "./createBackup";

const INSERT_BATCH_SIZE = 300;
const MAX_MEDIA_FILE_BYTES = 100 * 1024 * 1024; // 100MB, same ceiling as the PHP version
const DANGEROUS_EXTENSIONS = new Set([
  "php", "php3", "php4", "php5", "php7", "phtml", "pht", "phar",
  "cgi", "pl", "py", "sh", "asp", "aspx", "jsp", "exe", "dll", "htaccess", "ini",
]);

// Matches JS Date.toJSON()'s shape, e.g. "2026-09-14T08:00:00.000Z" — the
// exact format every DateTime field ends up in inside the backup's NDJSON.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

export interface RestoreManifest {
  type: string;
  site_name?: string;
  site_url?: string;
  backup_date?: string;
  total_posts?: number;
  total_pages?: number;
  include_media?: boolean;
  media_files?: number;
  tables?: string[];
  table_counts?: Record<string, number>;
}

/** Opens the zip and returns just manifest.json's parsed contents, for the
 *  "scan before restore" confirmation step in the UI — never touches the
 *  DB or filesystem. Every failure mode here is turned into a specific,
 *  friendly message so the UI can say exactly what's wrong with the file
 *  the moment it's picked, instead of a generic failure. */
export async function scanRestoreZip(zipPath: string): Promise<RestoreManifest> {
  let directory;
  try {
    directory = await unzipper.Open.file(zipPath);
  } catch {
    throw new Error("This file isn't a valid ZIP archive — it may be corrupted or not a ZIP at all.");
  }

  const manifestEntry = directory.files.find((f) => f.path === "manifest.json");
  if (!manifestEntry) {
    throw new Error("This ZIP doesn't contain a manifest.json — it isn't a backup created by this system.");
  }

  let buf: Buffer;
  try {
    buf = await manifestEntry.buffer();
  } catch {
    throw new Error("Couldn't read manifest.json from this ZIP — the archive may be corrupted.");
  }

  let manifest: RestoreManifest;
  try {
    manifest = JSON.parse(buf.toString("utf-8"));
  } catch {
    throw new Error("manifest.json in this ZIP isn't valid JSON — the backup file appears corrupted.");
  }

  if (manifest.type !== "full_site_backup") {
    throw new Error("This ZIP is not a full site backup produced by this system (unexpected manifest type).");
  }

  const hasAnyTableData = directory.files.some((f) => f.path.startsWith("database/") && f.path.endsWith(".ndjson"));
  if (!hasAnyTableData) {
    throw new Error("This backup's manifest looks valid, but it contains no database files — it can't be restored.");
  }

  return manifest;
}

export interface RestoreResult {
  success: true;
  mediaRestored: number;
  warnings: string[];
}

export type RestoreProgressCallback = (percent: number, stage: string) => void;

/**
 * Full destructive restore, deliberately matching the original PHP
 * behaviour exactly (this is a "go back in time" operation, not a merge):
 * every existing table is truncated and replaced with the backup's data,
 * the uploads folder is wiped and replaced with the backup's media, and
 * every active session is force-logged-out afterwards since user
 * accounts/passwords themselves just got replaced too.
 */
export async function restoreFromBackupZip(
  zipPath: string,
  confirmText: string,
  onProgress?: RestoreProgressCallback
): Promise<RestoreResult> {
  if (confirmText !== "CONFIRM") {
    throw new Error("Please type CONFIRM to proceed.");
  }

  const report = (percent: number, stage: string) => onProgress?.(Math.min(99, Math.max(0, Math.round(percent))), stage);

  report(1, "Reading backup file…");
  const manifest = await scanRestoreZip(zipPath);
  const directory = await unzipper.Open.file(zipPath);
  const warnings: string[] = [];

  const liveTables = await getAllTables();
  const liveTableNames = new Set(liveTables.map((t) => t.tableName));

  // Total "units of work" for the progress bar: every row to insert
  // (from the manifest's per-table counts, when present — older backups
  // taken before this field existed fall back to a coarser per-table
  // estimate) + one unit per media file to extract.
  const manifestTableCounts = manifest.table_counts ?? {};
  const totalRows = Object.values(manifestTableCounts).reduce((a, b) => a + b, 0);
  const totalMediaFiles = manifest.media_files ?? 0;
  const totalUnits = Math.max(1, (totalRows > 0 ? totalRows : liveTables.length * 100) + totalMediaFiles);
  let unitsDone = 0;

  // 1. Everything off, truncate every live table (mirrors
  //    `SET FOREIGN_KEY_CHECKS = 0` + loop-truncate in the PHP version).
  report(2, "Preparing database…");
  await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 0");
  for (const t of liveTables) {
    try {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quoteIdent(t.tableName)}`);
    } catch {
      // a table that genuinely can't be truncated (e.g. a view) shouldn't abort the whole restore
    }
  }

  // 2. Re-insert from each database/<table>.ndjson entry the zip actually has.
  try {
    for (const entry of directory.files) {
      if (!entry.path.startsWith("database/") || !entry.path.endsWith(".ndjson")) continue;
      const tableName = entry.path.slice("database/".length, -".ndjson".length);
      if (!liveTableNames.has(tableName)) {
        warnings.push(`Skipped table \`${tableName}\`: no longer exists in the current schema.`);
        continue;
      }

      report((unitsDone / totalUnits) * 90, `Restoring ${tableName}…`);

      const [liveColumns, dateColumns] = await Promise.all([getLiveColumns(tableName), getLiveDateColumns(tableName)]);
      const liveColumnSet = new Set(liveColumns);
      let warnedMissingCols = false;

      const rl = readline.createInterface({ input: entry.stream(), crlfDelay: Infinity });
      let batch: Record<string, unknown>[] = [];
      let batchColumns: string[] | null = null;

      const flush = async () => {
        if (batch.length === 0 || !batchColumns) return;
        const cols = batchColumns;
        const valuesSql = Prisma.join(
          batch.map((row) =>
            Prisma.sql`(${Prisma.join(
              cols.map((c) => {
                const v = row[c] ?? null;
                // MySQL rejects the "...T...Z" ISO shape JSON.stringify(Date)
                // produces — normalize any DATE/DATETIME/TIMESTAMP column's
                // value to the "YYYY-MM-DD HH:MM:SS" format MySQL expects.
                if (typeof v === "string" && dateColumns.has(c) && ISO_DATE_RE.test(v)) {
                  return toMysqlDateTimeString(v);
                }
                return v;
              })
            )})`
          )
        );
        const colsSql = Prisma.join(cols.map((c) => Prisma.raw(quoteIdent(c))));
        const query = Prisma.sql`INSERT INTO ${Prisma.raw(quoteIdent(tableName))} (${colsSql}) VALUES ${valuesSql}`;
        try {
          await prisma.$executeRaw(query);
        } catch (err) {
          warnings.push(`Table \`${tableName}\`: a batch of ${batch.length} row(s) failed to insert (${err instanceof Error ? err.message : "unknown error"}).`);
        }
        unitsDone += batch.length;
        report((unitsDone / totalUnits) * 90, `Restoring ${tableName}…`);
        batch = [];
      };

      for await (const line of rl) {
        if (!line.trim()) continue;
        let row: Record<string, unknown>;
        try {
          row = JSON.parse(line);
        } catch {
          continue;
        }
        const rowCols = Object.keys(row).filter((c) => liveColumnSet.has(c));
        if (rowCols.length === 0) continue;

        const missing = Object.keys(row).filter((c) => !liveColumnSet.has(c));
        if (missing.length > 0 && !warnedMissingCols) {
          warnings.push(`Table \`${tableName}\`: columns not present in the current schema were skipped (${missing.join(", ")}).`);
          warnedMissingCols = true;
        }

        // Column set can vary row-to-row only if the schema itself is
        // inconsistent, which shouldn't happen for one table — flush on
        // change just in case rather than corrupting a batch.
        if (batchColumns && (batchColumns.length !== rowCols.length || !batchColumns.every((c, i) => c === rowCols[i]))) {
          await flush();
        }
        batchColumns = rowCols;
        batch.push(row);
        if (batch.length >= INSERT_BATCH_SIZE) {
          await flush();
        }
      }
      await flush();
    }
  } finally {
    await prisma.$executeRawUnsafe("SET FOREIGN_KEY_CHECKS = 1");
  }

  // 3. Media: wipe uploads/, restore from media/ entries with the same
  //    safety checks as the PHP version (extension blocklist, path
  //    traversal guard via the resolved real path, size ceiling).
  report(90, "Restoring media files…");
  let mediaRestored = 0;
  if (fs.existsSync(UPLOADS_DIR)) {
    fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  const uploadsReal = fs.realpathSync(UPLOADS_DIR);

  for (const entry of directory.files) {
    if (!entry.path.startsWith("media/")) continue;
    const relFile = entry.path.slice("media/".length);
    if (!relFile) continue;
    if (relFile.includes("\0")) continue;
    const segments = relFile.split("/");
    if (segments.includes("..")) continue;
    if (relFile.startsWith("/")) continue;

    const ext = path.extname(relFile).slice(1).toLowerCase();
    if (DANGEROUS_EXTENSIONS.has(ext)) continue;

    const destPath = path.join(UPLOADS_DIR, relFile);
    const destDir = path.dirname(destPath);
    fs.mkdirSync(destDir, { recursive: true });
    const destDirReal = fs.realpathSync(destDir);
    if (!(destDirReal + path.sep).startsWith(uploadsReal + path.sep) && destDirReal !== uploadsReal) continue;

    if (entry.uncompressedSize > MAX_MEDIA_FILE_BYTES) continue;

    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(destPath);
      entry.stream().pipe(out).on("finish", () => resolve()).on("error", reject);
    });
    mediaRestored++;
    unitsDone++;
    if (mediaRestored % 20 === 0) report((unitsDone / totalUnits) * 90, "Restoring media files…");
  }

  // 4. Site URL rewrite, if the backup came from a different domain —
  //    same five columns the PHP version rewrites.
  report(92, "Finalizing…");
  const currentConfig = await resolveSiteConfig("");
  const oldUrl = manifest.site_url;
  const newUrl = currentConfig.siteUrl;
  if (oldUrl && newUrl && oldUrl !== newUrl) {
    const replacements: Array<[string, string]> = [
      ["posts", "content"],
      ["pages", "content"],
      ["media", "file_path"],
      ["app_config", "config_value"],
      ["site_settings", "setting_value"],
    ];
    for (const [table, col] of replacements) {
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE ${quoteIdent(table)} SET ${quoteIdent(col)} = REPLACE(${quoteIdent(col)}, ?, ?)`,
          oldUrl,
          newUrl
        );
      } catch {
        // non-fatal — a missing column/table here shouldn't fail the whole restore
      }
    }
  }

  // 5. Force logout everyone (users/passwords themselves were just
  //    replaced). Real bug fixed here, per a detailed root-cause
  //    specification for the recurring "baar baar logout" reports: this
  //    used to bump a single global `app_config.session_version` value
  //    — the SAME mechanism ANY other code path touching that config
  //    row (intentionally or not) could also trigger, invalidating
  //    every session on every domain with no record of which sessions
  //    were affected or why. Now revokes every real session row
  //    explicitly and auditably (revokeAllSessions(), see
  //    lib/authSession.ts) instead.
  try {
    await revokeAllSessions();
  } catch {
    // non-fatal
  }

  report(100, "Done");
  return { success: true, mediaRestored, warnings };
}
