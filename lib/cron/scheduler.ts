import { cronSecret, setCronConfig } from "./jobs";

/**
 * Built-in scheduler: the server calls its own /api/cron/minute once a
 * minute (an HTTP call, so revalidatePath etc. have a request context).
 * Several processes may run this; the job lock in lib/cron/jobs.ts keeps
 * each run single. Turn off with DISABLE_BUILTIN_CRON=1 when an external
 * crontab is used instead.
 */
let started = false;

export function startScheduler() {
  if (started || process.env.DISABLE_BUILTIN_CRON === "1") return;
  started = true;
  const port = process.env.PORT || "3000";
  const url = `http://127.0.0.1:${port}/api/cron/minute?auto=1`;

  const tick = async () => {
    try {
      const secret = await cronSecret();
      await setCronConfig("cron_scheduler_beat", new Date().toISOString());
      const res = await fetch(url, { headers: { authorization: `Bearer ${secret}` }, cache: "no-store" });
      if (!res.ok) console.error(`cron tick: ${url} answered ${res.status}`);
    } catch (e) {
      console.error("cron tick failed:", e);
    }
  };

  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), 60_000).unref?.();
  }, 30_000).unref?.();
}
