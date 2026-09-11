import { PrismaClient } from "@prisma/client";

// Next.js dev mode hot-reloads modules on every file change, which would
// otherwise spin up a fresh PrismaClient (and a fresh DB connection pool)
// on every request. Caching it on `globalThis` in development avoids that.
// (Mirrors the original PHP's single long-lived $pdo connection per request.)

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.APP_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.APP_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
