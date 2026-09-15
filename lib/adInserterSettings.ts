import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { defaultAdInserterConfig, type AdInserterConfig, type AdBlock } from "./adInserterTypes";

function normalizeBlock(raw: unknown, fallback: AdBlock): AdBlock {
  const b = (raw ?? {}) as Partial<AdBlock>;
  return {
    id: fallback.id,
    label: fallback.label,
    code: typeof b.code === "string" ? b.code : "",
    enabled: !!b.enabled,
    pages: Array.isArray(b.pages) && b.pages.length > 0 ? b.pages : ["post"],
    insertion: (b.insertion as AdBlock["insertion"]) ?? "disabled",
    alignment: (b.alignment as AdBlock["alignment"]) ?? "default",
    paragraph: Number.isFinite(b.paragraph) ? Number(b.paragraph) : 1,
  };
}

/** Persistently cached (see lib/config.ts's getAppConfig comment) —
 *  invalidated via the "ad-inserter" tag whenever Ad Inserter saves. */
const getAdInserterConfigCached = unstable_cache(
  async (): Promise<AdInserterConfig> => {
    try {
      const row = await prisma.appConfig.findUnique({ where: { configKey: "ad_inserter" } });
      const defaults = defaultAdInserterConfig();
      if (!row?.configValue) return defaults;
      const parsed = JSON.parse(row.configValue);
      const blocksRaw = Array.isArray(parsed.blocks) ? parsed.blocks : [];
      return {
        // Real bug fixed here: this used to just accept the stored
        // blocks array wholesale if its length happened to be exactly
        // 16, or fall back to ALL 16 defaults otherwise — a single
        // block with a slightly malformed field (e.g. from an older
        // saved shape, before pages/insertion/alignment existed) could
        // discard every OTHER block's real, correctly-saved settings
        // too. Normalizes each of the 16 positions independently
        // instead, so a malformed field only affects that one block.
        blocks: defaults.blocks.map((fallback, i) => normalizeBlock(blocksRaw[i], fallback)),
        globalHeader: typeof parsed.globalHeader === "string" ? parsed.globalHeader : "",
        globalFooter: typeof parsed.globalFooter === "string" ? parsed.globalFooter : "",
        adsTxtEnabled: !!parsed.adsTxtEnabled,
      };
    } catch {
      return defaultAdInserterConfig();
    }
  },
  ["ad-inserter"],
  { revalidate: 300, tags: ["ad-inserter"] }
);
export const getAdInserterConfig = cache(getAdInserterConfigCached);
