import "server-only";
import fs from "fs";
import path from "path";
import { getAllTables, quoteIdent } from "../dbIntrospection";
import { prisma } from "../db";
import { BACKUPS_DIR, UPLOADS_DIR, dirSizeRecursive, ensureBackupsDir } from "./createBackup";

export interface BackupFileInfo {
  name: string;
  size: number;
  date: string; // ISO
}

export interface BackupStats {
  tableCounts: Record<string, number>;
  totalPosts: number;
  totalPages: number;
  mediaSize: number;
  backupFiles: BackupFileInfo[];
}

export async function getBackupStats(): Promise<BackupStats> {
  ensureBackupsDir();
  const tables = await getAllTables();

  const tableCounts: Record<string, number> = {};
  await Promise.all(
    tables.map(async (t) => {
      try {
        const rows = await prisma.$queryRawUnsafe<{ c: bigint | number }[]>(
          `SELECT COUNT(*) as c FROM ${quoteIdent(t.tableName)}`
        );
        tableCounts[t.tableName] = Number(rows[0]?.c ?? 0);
      } catch {
        tableCounts[t.tableName] = 0;
      }
    })
  );

  const mediaSize = fs.existsSync(UPLOADS_DIR) ? dirSizeRecursive(UPLOADS_DIR) : 0;

  const backupFiles: BackupFileInfo[] = fs
    .readdirSync(BACKUPS_DIR)
    .filter((f) => f.endsWith(".zip"))
    .map((f) => {
      const stat = fs.statSync(path.join(BACKUPS_DIR, f));
      return { name: f, size: stat.size, date: stat.mtime.toISOString() };
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    tableCounts,
    totalPosts: tableCounts["posts"] ?? 0,
    totalPages: tableCounts["pages"] ?? 0,
    mediaSize,
    backupFiles,
  };
}

/** basename() equivalent guard — never trust a filename coming from the
 *  client to contain a path. */
function safeBackupFilename(name: string): string {
  const base = path.basename(name);
  if (!base || base.includes("..") || !base.endsWith(".zip")) {
    throw new Error("Invalid backup filename.");
  }
  return base;
}

export function resolveBackupPath(name: string): string {
  const safe = safeBackupFilename(name);
  const full = path.join(BACKUPS_DIR, safe);
  if (!fs.existsSync(full)) throw new Error("Backup file not found.");
  return full;
}

export function deleteBackup(name: string): void {
  const full = resolveBackupPath(name);
  fs.unlinkSync(full);
}
