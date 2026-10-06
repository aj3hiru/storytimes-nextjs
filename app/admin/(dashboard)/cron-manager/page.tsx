import { guardPage } from "@/lib/pageGuard";
import { resolveSiteConfig } from "@/lib/config";
import { getCronStatus } from "@/lib/cron/jobs";
import { CronManagerClient } from "@/components/admin/CronManagerClient";

export const dynamic = "force-dynamic";

/**
 * Jobs run on the server's built-in scheduler (instrumentation.ts →
 * lib/cron/scheduler.ts), so nothing has to be set up on the VPS. The
 * HTTP endpoints stay available for an external crontab.
 */
export default async function CronManagerPage() {
  const denied = await guardPage((p) => p.settings.general, "Only users with Settings access can view the cron manager.");
  if (denied) return denied;

  const [status, siteConfig] = await Promise.all([getCronStatus(), resolveSiteConfig("")]);
  const base = (siteConfig.siteUrl || "").replace(/\/+$/, "");

  return <CronManagerClient status={status} base={base} />;
}
