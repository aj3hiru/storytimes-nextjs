import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { releaseHeldViews } from "@/lib/viewAdjust";
import { invalidatePosts } from "@/lib/posts";
import { pingIndexNow } from "@/lib/indexNow";
import { maybeRunAutoClear } from "@/lib/cache/pageCache";
import { istCalendarDate, istHourOfDay } from "@/lib/istDate";

export type JobName = "minute" | "daily";
export type Trigger = "auto" | "manual" | "external";

export interface TaskResult {
  task: string;
  ok: boolean;
  detail: string;
}

export interface JobRun {
  job: JobName;
  at: string;
  ms: number;
  trigger: Trigger;
  ok: boolean;
  tasks: TaskResult[];
}

const HISTORY_KEY = "cron_history";
const HISTORY_MAX = 30;

async function getConfig(keys: string[]): Promise<Record<string, string>> {
  const rows = await prisma.appConfig.findMany({ where: { configKey: { in: keys } } });
  return Object.fromEntries(rows.map((r) => [r.configKey, r.configValue ?? ""]));
}

async function setConfig(key: string, value: string) {
  await prisma.appConfig.upsert({
    where: { configKey: key },
    create: { configKey: key, configValue: value },
    update: { configValue: value },
  });
}

/** The secret the built-in scheduler sends; CRON_SECRET wins when set. */
export async function cronSecret(): Promise<string> {
  if (process.env.CRON_SECRET) return process.env.CRON_SECRET;
  const { cron_internal_secret: saved } = await getConfig(["cron_internal_secret"]);
  if (saved) return saved;
  const fresh = randomBytes(24).toString("hex");
  await setConfig("cron_internal_secret", fresh);
  return fresh;
}

export async function isCronAuthorized(header: string | null): Promise<boolean> {
  if (!header?.startsWith("Bearer ")) return false;
  const token = header.slice(7);
  if (process.env.CRON_SECRET && token === process.env.CRON_SECRET) return true;
  const { cron_internal_secret: saved } = await getConfig(["cron_internal_secret"]);
  return Boolean(saved) && token === saved;
}

/**
 * One runner at a time per job, even with several server processes: the
 * lock row only moves forward when its previous value has expired.
 */
async function claim(job: JobName, ttlMs: number): Promise<boolean> {
  const key = `cron_${job}_lock`;
  const now = Date.now();
  await prisma.appConfig.upsert({ where: { configKey: key }, create: { configKey: key, configValue: "0" }, update: {} });
  const res = await prisma.appConfig.updateMany({
    where: { configKey: key, configValue: { lt: String(now).padStart(15, "0") } },
    data: { configValue: String(now + ttlMs).padStart(15, "0") },
  });
  return res.count === 1;
}

async function release(job: JobName) {
  await prisma.appConfig.updateMany({ where: { configKey: `cron_${job}_lock` }, data: { configValue: "0" } });
}

async function task(name: string, fn: () => Promise<string>): Promise<TaskResult> {
  try {
    return { task: name, ok: true, detail: await fn() };
  } catch (e) {
    console.error(`cron task "${name}" failed:`, e);
    return { task: name, ok: false, detail: e instanceof Error ? e.message : String(e) };
  }
}

/** Publishes drafts whose "Scheduled" publish_at time has arrived. */
async function publishScheduled(): Promise<string> {
  const metas = await prisma.postMeta.findMany({
    where: { metaKey: "publish_at" },
    select: { id: true, postId: true, metaValue: true, post: { select: { status: true, slug: true } } },
  });
  const now = Date.now();
  // A post that was published/archived by hand no longer carries a schedule.
  const stale = metas.filter((m) => m.post.status !== "draft").map((m) => m.id);
  if (stale.length) await prisma.postMeta.deleteMany({ where: { id: { in: stale } } });

  const due = metas.filter((m) => m.post.status === "draft" && new Date(m.metaValue ?? "").getTime() <= now);
  for (const m of due) {
    await prisma.$transaction([
      prisma.post.update({ where: { id: m.postId }, data: { status: "published", date: new Date() } }),
      prisma.postMeta.delete({ where: { id: m.id } }),
    ]);
    revalidatePath(`/${m.post.slug}`);
  }
  if (due.length) {
    revalidatePath("/");
    invalidatePosts();
    pingIndexNow(due.map((m) => `/${m.post.slug}`));
  }
  const waiting = metas.length - stale.length - due.length;
  return due.length ? `Published ${due.length} post(s)` : `Nothing due (${waiting} scheduled)`;
}

async function runTasks(job: JobName): Promise<TaskResult[]> {
  if (job === "minute") {
    return [
      await task("Publish scheduled posts", publishScheduled),
      await task("Release held traffic", async () => {
        const r = await releaseHeldViews(false);
        return r.released ? `Released ${r.released} held click(s)` : "Nothing waiting";
      }),
      await task("Cache auto-clear", async () => ((await maybeRunAutoClear({ fromRoute: true })) ? "Cache cleared" : "Not due")),
    ];
  }
  const cfg = await getConfig(["cron_log_retention_days"]);
  const keepDays = parseInt(cfg.cron_log_retention_days ?? "0", 10) || 0;
  return [
    await task("Remove expired logins", async () => {
      const r = await prisma.authSession.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 86400_000) } } });
      return `${r.count} removed`;
    }),
    await task("Visitor log cleanup", async () => {
      // Off unless the admin picks a retention period — never deletes on its own.
      if (keepDays <= 0) return "Kept (retention: forever)";
      const before = new Date(Date.now() - keepDays * 86400_000);
      const [a, b] = await Promise.all([
        prisma.visitorLog.deleteMany({ where: { visitDate: { lt: before } } }),
        prisma.chapterVisitorLog.deleteMany({ where: { visitDate: { lt: before } } }),
      ]);
      return `${a.count + b.count} rows older than ${keepDays} days removed`;
    }),
  ];
}

export async function isJobEnabled(job: JobName): Promise<boolean> {
  const cfg = await getConfig([`cron_${job}_enabled`]);
  return cfg[`cron_${job}_enabled`] !== "0";
}

/** Runs a job. Returns null when it is switched off or already running. */
export async function runJob(job: JobName, trigger: Trigger): Promise<JobRun | null> {
  if (trigger !== "manual" && !(await isJobEnabled(job))) return null;
  if (!(await claim(job, job === "minute" ? 5 * 60_000 : 30 * 60_000))) return null;
  const started = Date.now();
  try {
    const tasks = await runTasks(job);
    const run: JobRun = { job, at: new Date(started).toISOString(), ms: Date.now() - started, trigger, ok: tasks.every((t) => t.ok), tasks };
    await saveRun(run);
    return run;
  } finally {
    await release(job);
  }
}

async function saveRun(run: JobRun) {
  const cfg = await getConfig([HISTORY_KEY]);
  let history: JobRun[] = [];
  try {
    history = JSON.parse(cfg[HISTORY_KEY] || "[]");
  } catch {}
  // Quiet minute runs ("nothing to do") are not worth a history row.
  const quiet = run.job === "minute" && run.ok && run.trigger === "auto" && run.tasks.every((t) => /^(Nothing|Not due)/.test(t.detail));
  if (!quiet) history = [run, ...history].slice(0, HISTORY_MAX);
  await Promise.all([
    setConfig(`cron_${run.job}_last_run`, run.at),
    setConfig(`cron_${run.job}_last_result`, JSON.stringify(run)),
    quiet ? Promise.resolve() : setConfig(HISTORY_KEY, JSON.stringify(history)),
  ]);
}

/** Daily job is due once per IST day, from 3 AM IST. */
export async function isDailyDue(): Promise<boolean> {
  const cfg = await getConfig(["cron_daily_last_run"]);
  const now = new Date();
  if (istHourOfDay(now) < 3) return false;
  const last = cfg.cron_daily_last_run ? new Date(cfg.cron_daily_last_run) : null;
  return !last || istCalendarDate(last).getTime() !== istCalendarDate(now).getTime();
}

export async function getCronStatus() {
  const cfg = await getConfig([
    HISTORY_KEY,
    "cron_minute_last_result",
    "cron_daily_last_result",
    "cron_minute_enabled",
    "cron_daily_enabled",
    "cron_log_retention_days",
    "cron_scheduler_beat",
  ]);
  const parse = <T,>(v: string | undefined, d: T): T => {
    try {
      return v ? (JSON.parse(v) as T) : d;
    } catch {
      return d;
    }
  };
  const scheduled = await prisma.postMeta.count({ where: { metaKey: "publish_at", post: { status: "draft" } } });
  return {
    history: parse<JobRun[]>(cfg[HISTORY_KEY], []),
    last: {
      minute: parse<JobRun | null>(cfg.cron_minute_last_result, null),
      daily: parse<JobRun | null>(cfg.cron_daily_last_result, null),
    },
    enabled: { minute: cfg.cron_minute_enabled !== "0", daily: cfg.cron_daily_enabled !== "0" },
    logRetentionDays: parseInt(cfg.cron_log_retention_days ?? "0", 10) || 0,
    schedulerBeat: cfg.cron_scheduler_beat || null,
    scheduledPosts: scheduled,
  };
}

export { setConfig as setCronConfig };
