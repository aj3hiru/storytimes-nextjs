import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { POST_TEMPLATE_DEFAULTS, type PostTemplateSettings } from "./postTemplateTypes";

/** Persistently cached (see lib/config.ts's getAppConfig comment) — reads
 *  on every single post-page render, so this is a high-value one to keep
 *  out of the per-request DB path. Invalidated via the "post-template"
 *  tag whenever Post Template or Sidebar Settings saves. */
const getPostTemplateSettingsCached = unstable_cache(
  async (): Promise<PostTemplateSettings> => {
    try {
      const row = await prisma.appConfig.findUnique({ where: { configKey: "post_template_settings" } });
      if (!row?.configValue) return POST_TEMPLATE_DEFAULTS;
      const parsed = JSON.parse(row.configValue);
      return { ...POST_TEMPLATE_DEFAULTS, ...parsed };
    } catch {
      return POST_TEMPLATE_DEFAULTS;
    }
  },
  ["post-template"],
  { revalidate: 300, tags: ["post-template"] }
);
export const getPostTemplateSettings = cache(getPostTemplateSettingsCached);
