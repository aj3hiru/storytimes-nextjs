"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./auth";
import { runJob, setCronConfig, type JobName, type JobRun } from "./cron/jobs";

async function requireAdmin() {
  const user = await requireUser();
  if (!user || user.role !== "admin") throw new Error("Admin access required.");
}

export async function runCronNow(job: JobName): Promise<{ run: JobRun | null; busy: boolean }> {
  await requireAdmin();
  if (job !== "minute" && job !== "daily") throw new Error("Unknown job.");
  const run = await runJob(job, "manual");
  revalidatePath("/admin/cron-manager");
  return { run, busy: run === null };
}

export async function setCronEnabled(job: JobName, enabled: boolean): Promise<void> {
  await requireAdmin();
  if (job !== "minute" && job !== "daily") throw new Error("Unknown job.");
  await setCronConfig(`cron_${job}_enabled`, enabled ? "1" : "0");
  revalidatePath("/admin/cron-manager");
}

export async function setLogRetention(days: number): Promise<void> {
  await requireAdmin();
  const allowed = [0, 30, 90, 180, 365];
  await setCronConfig("cron_log_retention_days", String(allowed.includes(days) ? days : 0));
  revalidatePath("/admin/cron-manager");
}
