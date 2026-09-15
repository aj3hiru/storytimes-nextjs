import "server-only";
import { prisma } from "./db";

/**
 * Dynamically discovers every real MySQL table in the database, instead
 * of hardcoding a table list — mirrors the original PHP's `SHOW TABLES` +
 * loop-over-every-table approach in admin/backup-restore.php, so a future
 * `prisma db push` that adds a new model is automatically covered here
 * too, nothing to remember to update.
 *
 * Real bug fixed here, caught before it ever shipped: an earlier version
 * of this walked Prisma Client's own DMMF (`import { dmmf } from
 * "@prisma/client"`) to get model → table name mappings — that export
 * does not exist on this project's actual generated client (verified
 * directly: `require("@prisma/client").dmmf` and `.Prisma.dmmf` are both
 * `undefined` here, a real difference between Prisma versions/generator
 * configurations that isn't visible from documentation alone). Querying
 * `information_schema.tables` directly is genuinely equivalent to `SHOW
 * TABLES` and doesn't depend on any Prisma-internal export that could
 * silently change or disappear between versions — more robust for
 * exactly the kind of "must never silently break" backup feature this
 * is.
 */
export interface TableInfo {
  tableName: string;
}

let cached: TableInfo[] | null = null;

// Prisma's own migration-tracking table — not part of the site's actual
// content/config, and restoring into it would fight Prisma's migration
// history bookkeeping rather than help anything.
const EXCLUDED_TABLES = new Set(["_prisma_migrations"]);

export async function getAllTables(): Promise<TableInfo[]> {
  if (cached) return cached;
  const rows = await prisma.$queryRaw<{ TABLE_NAME: string }[]>`
    SELECT TABLE_NAME FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'
  `;
  const result = rows
    .map((r) => ({ tableName: r.TABLE_NAME }))
    .filter((t) => !EXCLUDED_TABLES.has(t.tableName));
  cached = result;
  return result;
}

/** Live column names for a table, straight from information_schema —
 *  used on restore to intersect against a backup's columns, exactly like
 *  the PHP's `SHOW COLUMNS FROM` check (a backup taken before a schema
 *  change shouldn't fail the whole restore, just skip unknown columns). */
export async function getLiveColumns(tableName: string): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ COLUMN_NAME: string }[]>`
    SELECT COLUMN_NAME FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = ${tableName}
  `;
  return rows.map((r: { COLUMN_NAME: string }) => r.COLUMN_NAME);
}

const DATE_TYPES = new Set(["date", "datetime", "timestamp"]);

/** Column name → whether it's a DATE/DATETIME/TIMESTAMP column, for the
 *  restore step's value normalization (see restoreBackup.ts) — MySQL
 *  rejects the ISO 8601 "2026-09-14T08:00:00.000Z" format
 *  (JSON.stringify(Date) shape) that these values arrive in from the
 *  backup's NDJSON. */
export async function getLiveDateColumns(tableName: string): Promise<Set<string>> {
  const rows = await prisma.$queryRaw<{ COLUMN_NAME: string; DATA_TYPE: string }[]>`
    SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = ${tableName}
  `;
  return new Set(
    rows
      .filter((r: { COLUMN_NAME: string; DATA_TYPE: string }) => DATE_TYPES.has(r.DATA_TYPE.toLowerCase()))
      .map((r: { COLUMN_NAME: string; DATA_TYPE: string }) => r.COLUMN_NAME)
  );
}

/** "2026-09-14T08:00:00.000Z" (JS Date.toJSON() shape, what ends up in the
 *  backup NDJSON for every DateTime field) → "2026-09-14 08:00:00"
 *  (what MySQL actually accepts as a DATE/DATETIME/TIMESTAMP literal).
 *  Without this, EVERY row with a date column fails to restore — this
 *  was found and fixed during a full-coverage audit of the restore path. */
export function toMysqlDateTimeString(iso: string): string {
  return iso.replace("T", " ").replace(/\.\d+Z?$/, "").replace(/Z$/, "");
}

/** Quote a MySQL identifier (table/column name). Only ever called with
 *  names that came from information_schema — never with raw user input —
 *  but backtick-escaped anyway for safety. */
export function quoteIdent(name: string): string {
  return "`" + name.replace(/`/g, "``") + "`";
}
