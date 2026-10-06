import { getAdHtmlFor } from "@/lib/adRendering";
import type { AdInsertionType, AdPageType } from "@/lib/adInserterTypes";
import { AdminHtml } from "@/components/AdminHtml";

/**
 * One Ad Inserter slot on a non-post page (homepage, category, tag/archive,
 * search, static page). Every whole-page insertion point is supported:
 * before/after post (top/bottom of the page), before/after content (around
 * the list or page body) and footer (just above the site footer).
 */
export async function ListingAds({
  page,
  position,
}: {
  page: AdPageType;
  position: Extract<AdInsertionType, "before_post" | "before_content" | "after_content" | "after_post" | "footer">;
}) {
  const html = await getAdHtmlFor(page, position);
  if (!html) return null;
  return <AdminHtml html={html} className={`ad-slot ad-slot--${page}-${position.replace("_", "-")}`} allowFrame />;
}
