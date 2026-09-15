"use server";

import { requireUser } from "./auth";
import {
  getCacheOverview,
  listCacheFiles,
  deleteCacheFile,
  clearAllCache,
  toggleCacheEnabled,
  preloadCache,
  maybeRunAutoClear,
  type CacheOverviewStats,
  type CacheFileInfo,
} from "./cache/pageCache";
import { getCacheSettings, saveCacheSettings, type CacheSettings } from "./cache/cacheSettings";

async function requireAdmin() {
  const user = await requireUser();
  if (!user || user.role !== "admin") throw new Error("Admin access required.");
  return user;
}

export async function getCacheDashboardData(): Promise<{ overview: CacheOverviewStats; settings: CacheSettings }> {
  await requireAdmin();
  await maybeRunAutoClear();
  const [overview, settings] = await Promise.all([getCacheOverview(), getCacheSettings()]);
  return { overview, settings };
}

export async function getCacheFilesList(): Promise<CacheFileInfo[]> {
  await requireAdmin();
  return listCacheFiles();
}

export async function deleteOneCacheFile(name: string): Promise<void> {
  await requireAdmin();
  deleteCacheFile(name);
}

export async function clearEntireCache(): Promise<{ deleted: number }> {
  await requireAdmin();
  const deleted = await clearAllCache();
  return { deleted };
}

export async function setCacheEnabled(enabled: boolean): Promise<void> {
  await requireAdmin();
  await toggleCacheEnabled(enabled);
}

export async function updateCacheSettings(partial: Partial<CacheSettings>): Promise<void> {
  await requireAdmin();
  await saveCacheSettings(partial);
}

export async function runPreloadNow(): Promise<{ count: number }> {
  await requireAdmin();
  const count = await preloadCache(10);
  return { count };
}

// ── Legacy exports kept for anywhere still importing the old API ──────────
// (revalidatePath-based clearing was the previous implementation; now
//  superseded by clearEntireCache()/setCacheEnabled() above, which are
//  what the rebuilt Cache Manager dashboard actually calls.)
export async function clearHomepageCache(): Promise<void> {
  await requireAdmin();
  await clearAllCache();
}
export async function clearAllSiteCache(): Promise<void> {
  await requireAdmin();
  await clearAllCache();
}
