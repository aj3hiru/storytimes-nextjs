/**
 * Read-only safety snapshot of the whole database before a deploy: every
 * table is written as NDJSON (one row per line) plus its CREATE TABLE
 * statement into backups/db-snapshot-<stamp>/. Nothing is changed in the DB.
 *
 *   npx tsx scripts/db-snapshot.ts
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BATCH = 1000;

const json = (_k: string, v: unknown) => (typeof v === "bigint" ? v.toString() : v);

async function main() {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const dir = path.join(process.cwd(), "backups", `db-snapshot-${stamp}`);
  fs.mkdirSync(dir, { recursive: true });

  const tables = await prisma.$queryRawUnsafe<{ name: string }[]>(
    "SELECT TABLE_NAME AS name FROM information_schema.tables WHERE table_schema = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME"
  );
  const summary: Record<string, number> = {};
  for (const { name } of tables) {
    const q = "`" + name.replace(/`/g, "``") + "`";
    const [create] = await prisma.$queryRawUnsafe<Record<string, string>[]>(`SHOW CREATE TABLE ${q}`);
    fs.writeFileSync(path.join(dir, `${name}.sql`), (create["Create Table"] ?? "") + ";\n");
    const out = fs.createWriteStream(path.join(dir, `${name}.ndjson`));
    let rows = 0;
    for (let offset = 0; ; offset += BATCH) {
      const batch = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(`SELECT * FROM ${q} LIMIT ${BATCH} OFFSET ${offset}`);
      for (const r of batch) out.write(JSON.stringify(r, json) + "\n");
      rows += batch.length;
      if (batch.length < BATCH) break;
    }
    await new Promise((r) => out.end(r));
    summary[name] = rows;
  }
  fs.writeFileSync(path.join(dir, "_summary.json"), JSON.stringify(summary, null, 2));
  console.log(dir);
  console.log(Object.entries(summary).map(([t, n]) => `${t}=${n}`).join(" "));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
