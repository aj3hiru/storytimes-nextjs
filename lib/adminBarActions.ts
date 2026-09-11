"use server";

import { clearAllSiteCache } from "./cacheManagerAdmin";

/** Thin re-export so the client AdminBar component has a single, clearly-
 *  named action to call for its "Clear Cache" button — clearAllSiteCache()
 *  already does its own admin-only check internally. */
export async function clearHomepageCacheAction(): Promise<void> {
  await clearAllSiteCache();
}
