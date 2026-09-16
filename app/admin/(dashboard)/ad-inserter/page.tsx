import { guardPage } from "@/lib/pageGuard";
import { getAdInserterConfig } from "@/lib/adInserterSettings";
import { prisma } from "@/lib/db";
import { AdInserterClient } from "@/components/admin/AdInserterClient";

export default async function AdInserterPage() {
  // Direct-URL access guard — see lib/pageGuard.tsx.
  const denied = await guardPage((p) => p.ads.manage_ads, "You do not have permission to manage ads.");
  if (denied) return denied;

  const [config, adsTxtRow] = await Promise.all([
    getAdInserterConfig(),
    prisma.appConfig.findUnique({ where: { configKey: "ads_txt_content" } }),
  ]);

  return <AdInserterClient initialConfig={config} initialAdsTxtContent={adsTxtRow?.configValue ?? ""} />;
}
