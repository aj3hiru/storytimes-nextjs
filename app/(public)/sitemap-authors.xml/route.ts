import { buildAuthorsSitemap, xmlResponse } from "@/lib/seoFeeds";

export const revalidate = 300;

export async function GET() {
  return xmlResponse(await buildAuthorsSitemap());
}
