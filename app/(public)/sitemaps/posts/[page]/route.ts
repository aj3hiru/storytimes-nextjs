import { notFound } from "next/navigation";
import { buildPostsSitemap, xmlResponse } from "@/lib/seoFeeds";

export const revalidate = 300;

/** Served at /sitemap-posts-<n>.xml (rewrite in next.config.ts). */
export async function GET(_req: Request, { params }: { params: Promise<{ page: string }> }) {
  const page = parseInt((await params).page, 10);
  if (!page || page < 1) notFound();
  const xml = await buildPostsSitemap(page);
  if (!xml) notFound();
  return xmlResponse(xml);
}
