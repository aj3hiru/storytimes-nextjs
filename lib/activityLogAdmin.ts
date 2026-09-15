"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { requireUser } from "./auth";

async function requireAdmin() {
  const user = await requireUser();
  if (!user || user.role !== "admin") throw new Error("Admin access required.");
  return user;
}

/** Deletes activity-log rows older than the given number of days, or ALL
 *  rows when `days` is 0. Mirrors the reference's own log-cleanup action.
 *  Deliberately writes one final log entry recording the clear itself, so
 *  the audit trail never has an unexplained gap. */
export async function clearActivityLogs(days: number): Promise<{ deleted: number }> {
  const admin = await requireAdmin();

  const where =
    days > 0
      ? { createdAt: { lt: new Date(Date.now() - days * 24 * 60 * 60 * 1000) } }
      : {};

  const result = await prisma.activityLog.deleteMany({ where });

  await prisma.activityLog.create({
    data: {
      userId: admin.id,
      actionType: "logs_cleared",
      description:
        days > 0
          ? `Cleared ${result.count} activity log(s) older than ${days} day(s)`
          : `Cleared all activity logs (${result.count} row(s))`,
    },
  });

  revalidatePath("/admin/activity-logs");
  return { deleted: result.count };
}
