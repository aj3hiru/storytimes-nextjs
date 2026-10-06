import { buildSitemapIndex, xmlResponse } from "@/lib/seoFeeds";

export const revalidate = 300;

/** Sitemap index: posts (1000 per file), pages, categories, tags, authors and Google News. */
export async function GET() {
  return xmlResponse(await buildSitemapIndex());
}
