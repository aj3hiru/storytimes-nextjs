import { getAdInserterConfig } from "@/lib/adInserterSettings";
import { prisma } from "@/lib/db";
import { AdInserterClient } from "@/components/admin/AdInserterClient";

export default async function AdInserterPage() {
  const [config, adsTxtRow] = await Promise.all([
    getAdInserterConfig(),
    prisma.appConfig.findUnique({ where: { configKey: "ads_txt_content" } }),
  ]);

  return <AdInserterClient initialConfig={config} initialAdsTxtContent={adsTxtRow?.configValue ?? ""} />;
}
