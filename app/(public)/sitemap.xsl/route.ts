import { SITEMAP_XSL } from "@/lib/seoFeeds";

export const dynamic = "force-static";

export function GET() {
  return new Response(SITEMAP_XSL, { headers: { "Content-Type": "text/xsl; charset=utf-8", "Cache-Control": "public, max-age=86400" } });
}
