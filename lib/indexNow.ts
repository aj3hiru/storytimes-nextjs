import { randomBytes } from "crypto";
import { prisma } from "./db";
import { resolveSiteConfig } from "./config";

/**
 * IndexNow: tells Bing, Yandex, Seznam, Naver etc. about new or changed URLs
 * the moment a post is published, instead of waiting for a crawl. (Google
 * reads the sitemaps and the feed.) The key is served at /indexnow-key.txt.
 */
export async function indexNowKey(): Promise<string> {
  const row = await prisma.appConfig.findUnique({ where: { configKey: "indexnow_key" } });
  if (row?.configValue) return row.configValue;
  const key = randomBytes(16).toString("hex");
  await prisma.appConfig.upsert({ where: { configKey: "indexnow_key" }, create: { configKey: "indexnow_key", configValue: key }, update: {} });
  return (await prisma.appConfig.findUnique({ where: { configKey: "indexnow_key" } }))?.configValue ?? key;
}

/** Fire-and-forget; never throws. Paths like "/my-post" or full URLs. */
export function pingIndexNow(paths: string[]): void {
  void (async () => {
    try {
      if (paths.length === 0) return;
      const { siteUrl } = await resolveSiteConfig("");
      const base = siteUrl.replace(/\/+$/, "");
      const host = new URL(base).host;
      if (/^(localhost|127\.|0\.0\.0\.0)/.test(host)) return;
      const key = await indexNowKey();
      const urlList = paths.map((p) => (/^https?:\/\//.test(p) ? p : `${base}${p}`)).slice(0, 10000);
      const res = await fetch("https://api.indexnow.org/indexnow", {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({ host, key, keyLocation: `${base}/indexnow-key.txt`, urlList }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok && res.status !== 202) console.warn(`IndexNow answered ${res.status}`);
    } catch (e) {
      console.warn("IndexNow ping failed:", e instanceof Error ? e.message : e);
    }
  })();
}
