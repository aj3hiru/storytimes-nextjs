import "server-only";
import { createBackup, type CreateBackupOptions, type CreateBackupResult } from "./createBackup";
import { restoreFromBackupZip, type RestoreResult } from "./restoreBackup";

export interface JobState<TResult> {
  id: string;
  kind: "backup" | "restore";
  status: "running" | "done" | "error";
  percent: number;
  stage: string;
  result?: TResult;
  error?: string;
  startedAt: number;
}

// In-memory — correct as long as this runs as a single Node process
// (the actual deployment target: PM2/systemd, one instance, long-running).
// If this is ever run under a multi-process cluster, this would need to
// move to a shared store (e.g. a small row in app_config or Redis if
// configured) since each process would have its own map.
const jobs = new Map<string, JobState<unknown>>();

function makeId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function getJob(id: string): JobState<unknown> | null {
  return jobs.get(id) ?? null;
}

export function startBackupJob(opts: CreateBackupOptions): string {
  const id = makeId();
  const job: JobState<CreateBackupResult> = { id, kind: "backup", status: "running", percent: 0, stage: "Starting…", startedAt: Date.now() };
  jobs.set(id, job);

  createBackup(opts, (percent, stage) => {
    job.percent = percent;
    job.stage = stage;
  })
    .then((result) => {
      job.status = "done";
      job.percent = 100;
      job.stage = "Done";
      job.result = result;
    })
    .catch((err) => {
      job.status = "error";
      job.error = err instanceof Error ? err.message : "Backup failed.";
    });

  return id;
}

export function startRestoreJob(zipPath: string, confirmText: string, cleanup: () => void): string {
  const id = makeId();
  const job: JobState<RestoreResult> = { id, kind: "restore", status: "running", percent: 0, stage: "Starting…", startedAt: Date.now() };
  jobs.set(id, job);

  restoreFromBackupZip(zipPath, confirmText, (percent, stage) => {
    job.percent = percent;
    job.stage = stage;
  })
    .then((result) => {
      job.status = "done";
      job.percent = 100;
      job.stage = "Done";
      job.result = result;
    })
    .catch((err) => {
      job.status = "error";
      job.error = err instanceof Error ? err.message : "Restore failed.";
    })
    .finally(() => {
      cleanup();
    });

  return id;
}

// Old finished jobs are cleared out after an hour so this map can't grow
// forever on a long-running process.
setInterval(() => {
  const cutoff = Date.now() - 3600_000;
  for (const [id, job] of jobs) {
    if (job.status !== "running" && job.startedAt < cutoff) jobs.delete(id);
  }
}, 600_000).unref();
