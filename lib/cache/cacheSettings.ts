import "server-only";
import { objectCacheDelete, objectCacheGet, objectCacheSet } from "./objectCache";
import { prisma } from "../db";

export interface CacheSettings {
  enabled: boolean;
  ttlHomepageSeconds: number;
  ttlPostSeconds: number;
  autoPreload: boolean;
  excludeUrls: string; // newline-separated, matches the PHP textarea
  autoClearEnabled: boolean;
  autoClearIntervalHours: number;
  lastClearedAt: string | null; // ISO
}

const DEFAULTS: CacheSettings = {
  enabled: true,
  ttlHomepageSeconds: 300,
  ttlPostSeconds: 21600,
  autoPreload: false,
  excludeUrls: "",
  autoClearEnabled: false,
  autoClearIntervalHours: 24,
  lastClearedAt: null,
};

const KEYS = {
  enabled: "cache_enabled",
  ttlHomepage: "cache_ttl_homepage",
  ttlPost: "cache_ttl_post",
  autoPreload: "cache_auto_preload",
  excludeUrls: "cache_exclude_urls",
  autoClearEnabled: "cache_auto_clear_enabled",
  autoClearInterval: "cache_auto_clear_interval_hours",
  lastCleared: "cache_last_cleared",
} as const;

/**
 * Deliberately NOT wrapped in unstable_cache (unlike getAppConfig) —
 * these settings control caching itself, so reading them needs to always
 * see the latest value the instant an admin saves, with zero lag.
 * app_config is a small table; a couple of extra lookups here per
 * request is a non-issue.
 */
// Every cached page asks for these settings, so they are kept: 10 s in this process, 60 s in Redis (shared,
// when REDIS_URL is set), instead of a database query on every page render. Saving clears both.
let memo: { at: number; value: CacheSettings } | null = null;
const REDIS_KEY = "st:cache-settings";

export async function getCacheSettings(): Promise<CacheSettings> {
  if (memo && Date.now() - memo.at < 10_000) return memo.value;
  const fromRedis = await objectCacheGet(REDIS_KEY);
  if (fromRedis) {
    try {
      const value = JSON.parse(fromRedis) as CacheSettings;
      memo = { at: Date.now(), value };
      return value;
    } catch {
      /* fall through to the database */
    }
  }
  const value = await readCacheSettings();
  memo = { at: Date.now(), value };
  void objectCacheSet(REDIS_KEY, JSON.stringify(value), 60);
  return value;
}

async function readCacheSettings(): Promise<CacheSettings> {
  try {
    const rows = await prisma.appConfig.findMany({
      where: { configKey: { in: Object.values(KEYS) } },
    });
    const map = Object.fromEntries(rows.map((r: { configKey: string; configValue: string | null }) => [r.configKey, r.configValue ?? ""]));
    return {
      enabled: map[KEYS.enabled] !== "0", // default ON, matches the PHP default
      ttlHomepageSeconds: parseInt(map[KEYS.ttlHomepage] ?? "", 10) || DEFAULTS.ttlHomepageSeconds,
      ttlPostSeconds: parseInt(map[KEYS.ttlPost] ?? "", 10) || DEFAULTS.ttlPostSeconds,
      autoPreload: map[KEYS.autoPreload] === "1",
      excludeUrls: map[KEYS.excludeUrls] ?? "",
      autoClearEnabled: map[KEYS.autoClearEnabled] === "1",
      autoClearIntervalHours: parseInt(map[KEYS.autoClearInterval] ?? "", 10) || DEFAULTS.autoClearIntervalHours,
      lastClearedAt: map[KEYS.lastCleared] || null,
    };
  } catch {
    return DEFAULTS;
  }
}

async function setConfig(key: string, value: string) {
  await prisma.appConfig.upsert({
    where: { configKey: key },
    create: { configKey: key, configValue: value },
    update: { configValue: value },
  });
}

export async function saveCacheSettings(partial: Partial<CacheSettings>): Promise<void> {
  const writes: Promise<void>[] = [];
  if (partial.enabled !== undefined) writes.push(setConfig(KEYS.enabled, partial.enabled ? "1" : "0"));
  if (partial.ttlHomepageSeconds !== undefined) writes.push(setConfig(KEYS.ttlHomepage, String(Math.max(30, partial.ttlHomepageSeconds))));
  if (partial.ttlPostSeconds !== undefined) writes.push(setConfig(KEYS.ttlPost, String(Math.max(30, partial.ttlPostSeconds))));
  if (partial.autoPreload !== undefined) writes.push(setConfig(KEYS.autoPreload, partial.autoPreload ? "1" : "0"));
  if (partial.excludeUrls !== undefined) writes.push(setConfig(KEYS.excludeUrls, partial.excludeUrls));
  if (partial.autoClearEnabled !== undefined) writes.push(setConfig(KEYS.autoClearEnabled, partial.autoClearEnabled ? "1" : "0"));
  if (partial.autoClearIntervalHours !== undefined) writes.push(setConfig(KEYS.autoClearInterval, String(Math.max(1, partial.autoClearIntervalHours))));
  if (partial.lastClearedAt !== undefined) writes.push(setConfig(KEYS.lastCleared, partial.lastClearedAt ?? ""));
  await Promise.all(writes);
  memo = null;
  await objectCacheDelete(REDIS_KEY);
}

/** true if the given request path matches one of the newline-separated
 *  exclude patterns (plain substrings, same simple matching the PHP
 *  textarea implied — one path/pattern per line). */
export function isUrlExcluded(pathname: string, excludeUrls: string): boolean {
  const patterns = excludeUrls.split("\n").map((l) => l.trim()).filter(Boolean);
  return patterns.some((p) => pathname.includes(p));
}
