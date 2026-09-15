import "server-only";
import fs from "fs";
import path from "path";
import { unstable_cache, updateTag } from "next/cache";
import { getCacheSettings, saveCacheSettings, isUrlExcluded } from "./cacheSettings";
import { isRedisConfigured, objectCachePing } from "./objectCache";
import { resolveSiteConfig } from "../config";
import { prisma } from "../db";

export const CACHE_TAG = "page-cache";
const NEXT_CACHE_DIR = path.join(process.cwd(), ".next", "cache", "fetch-cache");

/**
 * Wraps a data-fetching function with a TTL-based cache, reading both the
 * on/off switch and the TTL from the admin-configurable settings in
 * app_config — this is what makes "Homepage refresh interval" /
 * "Post page lifespan" in the dashboard actually take effect without a
 * redeploy (unlike a static `export const revalidate = N` on the page,
 * which is a compile-time constant).
 *
 * When the cache is toggled OFF, this calls `fn` directly every time —
 * "every page renders live, nothing is cached anywhere", exactly the
 * PHP version's behaviour with the cache system stopped.
 */
export async function withPageCache<T>(
  cacheKey: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
  pathnameForExcludeCheck?: string
): Promise<T> {
  const settings = await getCacheSettings();
  if (!settings.enabled) return fn();
  if (pathnameForExcludeCheck && isUrlExcluded(pathnameForExcludeCheck, settings.excludeUrls)) {
    return fn();
  }

  const cached = unstable_cache(fn, [cacheKey], {
    revalidate: ttlSeconds,
    tags: [CACHE_TAG, cacheKey],
  });
  return cached();
}

export async function getHomepageTtl(): Promise<number> {
  return (await getCacheSettings()).ttlHomepageSeconds;
}
export async function getPostTtl(): Promise<number> {
  return (await getCacheSettings()).ttlPostSeconds;
}

// ── Dashboard: stats ─────────────────────────────────────────────────────

export interface CacheFileInfo {
  name: string;
  size: number;
  date: string; // ISO
}

function listCacheFilesRecursive(dir: string): CacheFileInfo[] {
  if (!fs.existsSync(dir)) return [];
  const out: CacheFileInfo[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listCacheFilesRecursive(full));
    } else {
      const stat = fs.statSync(full);
      out.push({ name: path.relative(NEXT_CACHE_DIR, full), size: stat.size, date: stat.mtime.toISOString() });
    }
  }
  return out;
}

export interface CacheOverviewStats {
  totalFiles: number;
  totalSize: number;
  ttlHomepageSeconds: number;
  ttlPostSeconds: number;
  objectCacheAvailable: boolean;
  objectCacheActive: boolean;
  enabled: boolean;
  lastClearedAt: string | null;
  nextAutoClearAt: string | null;
}

export async function getCacheOverview(): Promise<CacheOverviewStats> {
  const settings = await getCacheSettings();
  const files = listCacheFilesRecursive(NEXT_CACHE_DIR);
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  let nextAutoClearAt: string | null = null;
  if (settings.autoClearEnabled && settings.lastClearedAt) {
    const next = new Date(settings.lastClearedAt).getTime() + settings.autoClearIntervalHours * 3600_000;
    nextAutoClearAt = new Date(next).toISOString();
  }

  return {
    totalFiles: files.length,
    totalSize,
    ttlHomepageSeconds: settings.ttlHomepageSeconds,
    ttlPostSeconds: settings.ttlPostSeconds,
    objectCacheAvailable: isRedisConfigured(),
    objectCacheActive: isRedisConfigured() ? await objectCachePing() : false,
    enabled: settings.enabled,
    lastClearedAt: settings.lastClearedAt,
    nextAutoClearAt,
  };
}

export async function listCacheFiles(): Promise<CacheFileInfo[]> {
  return listCacheFilesRecursive(NEXT_CACHE_DIR).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function deleteCacheFile(relName: string): void {
  const full = path.join(NEXT_CACHE_DIR, relName);
  const real = fs.existsSync(full) ? fs.realpathSync(full) : null;
  const baseReal = fs.existsSync(NEXT_CACHE_DIR) ? fs.realpathSync(NEXT_CACHE_DIR) : null;
  if (!real || !baseReal || !(real + path.sep).startsWith(baseReal + path.sep)) {
    throw new Error("Invalid cache file.");
  }
  fs.unlinkSync(real);
}

/** Hard-clears the on-disk data cache AND tells Next every page-cache-tagged
 *  entry is stale (belt & suspenders: the tag-based invalidation is the
 *  officially-supported API, the directory wipe gives the same instant
 *  "0 files" feedback the PHP dashboard gave). */
export async function clearAllCache(): Promise<number> {
  const before = listCacheFilesRecursive(NEXT_CACHE_DIR).length;
  if (fs.existsSync(NEXT_CACHE_DIR)) {
    for (const entry of fs.readdirSync(NEXT_CACHE_DIR)) {
      fs.rmSync(path.join(NEXT_CACHE_DIR, entry), { recursive: true, force: true });
    }
  }
  // updateTag (not revalidateTag) — this is only ever called from Server
  // Actions (lib/cacheManagerAdmin.ts), and updateTag gives immediate
  // read-your-own-writes semantics there instead of a background revalidate.
  updateTag(CACHE_TAG);
  await saveCacheSettings({ lastClearedAt: new Date().toISOString() });
  return before;
}

export async function toggleCacheEnabled(enabled: boolean): Promise<void> {
  await saveCacheSettings({ enabled });
}

/** Fires GET requests at the homepage + N most recent published post URLs
 *  to warm the cache right after it's cleared — mirrors the PHP
 *  manualPreload() curl loop. */
export async function preloadCache(count = 10): Promise<number> {
  const siteConfig = await resolveSiteConfig("");
  const posts = await prisma.post.findMany({
    where: { status: "published" },
    orderBy: { date: "desc" },
    take: Math.max(0, count - 1),
    select: { slug: true },
  });
  const urls = [siteConfig.siteUrl + "/", ...posts.map((p: { slug: string }) => `${siteConfig.siteUrl}/${p.slug}`)];

  let ok = 0;
  await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (res.ok) ok++;
      } catch {
        // a single failed preload fetch shouldn't fail the whole batch
      }
    })
  );
  return ok;
}

/** Called on Cache Manager page load (mirrors the PHP version's lazy
 *  per-request check — no real cron needed on a long-running Node
 *  process): if auto-clear is enabled and the interval has elapsed,
 *  clear now. */
export async function maybeRunAutoClear(): Promise<void> {
  const settings = await getCacheSettings();
  if (!settings.enabled || !settings.autoClearEnabled) return;
  const last = settings.lastClearedAt ? new Date(settings.lastClearedAt).getTime() : 0;
  const intervalMs = settings.autoClearIntervalHours * 3600_000;
  if (Date.now() - last >= intervalMs) {
    await clearAllCache();
  }
}
