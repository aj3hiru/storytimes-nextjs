import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { defaultAdInserterConfig, type AdInserterConfig } from "./adInserterTypes";

/** Persistently cached (see lib/config.ts's getAppConfig comment) —
 *  invalidated via the "ad-inserter" tag whenever Ad Inserter saves. */
const getAdInserterConfigCached = unstable_cache(
  async (): Promise<AdInserterConfig> => {
    try {
      const row = await prisma.appConfig.findUnique({ where: { configKey: "ad_inserter" } });
      if (!row?.configValue) return defaultAdInserterConfig();
      const parsed = JSON.parse(row.configValue);
      const defaults = defaultAdInserterConfig();
      return {
        blocks: Array.isArray(parsed.blocks) && parsed.blocks.length === 16 ? parsed.blocks : defaults.blocks,
        globalHeader: typeof parsed.globalHeader === "string" ? parsed.globalHeader : "",
        globalFooter: typeof parsed.globalFooter === "string" ? parsed.globalFooter : "",
        homepageTop: typeof parsed.homepageTop === "string" ? parsed.homepageTop : "",
      };
    } catch {
      return defaultAdInserterConfig();
    }
  },
  ["ad-inserter"],
  { revalidate: 300, tags: ["ad-inserter"] }
);
export const getAdInserterConfig = cache(getAdInserterConfigCached);
