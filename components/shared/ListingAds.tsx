import { getAdHtmlFor } from "@/lib/adRendering";
import type { AdPageType } from "@/lib/adInserterTypes";
import { AdminHtml } from "@/components/AdminHtml";

/**
 * Renders the "before content" / "after content" ad slots for a listing
 * page (category, tag, search, static page).
 *
 * Real gap this closes: Ad Inserter lets a block be targeted at six page
 * types — Posts, Homepage, Category pages, Static pages, Search pages,
 * Tag pages — but only Posts and Homepage actually rendered any slot.
 * A block configured for Category/Search/Tag/Pages saved correctly,
 * showed as enabled in the admin, and then had nowhere to appear, so it
 * silently never ran. These four page types now honour their
 * configuration like the other two already did.
 */
export async function ListingAds({ page, position }: { page: AdPageType; position: "before_content" | "after_content" }) {
  const html = await getAdHtmlFor(page, position);
  if (!html) return null;
  return <AdminHtml html={html} className={`ad-slot ad-slot--${page}-${position.replace("_", "-")}`} allowFrame />;
}
