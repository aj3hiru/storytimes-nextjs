import { prisma } from "@/lib/db";
import { resolveSiteConfig } from "@/lib/config";
import { postUrl } from "@/lib/urls";

export const revalidate = 300; // 5 minutes — news sitemaps need to stay fresh

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function GET() {
  const siteConfig = await resolveSiteConfig("");
  const baseUrl = siteConfig.siteUrl.replace(/\/+$/, "");

  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
  const posts = await prisma.post.findMany({
    where: { status: "published", date: { gte: twoDaysAgo } },
    orderBy: { date: "desc" },
    select: { slug: true, title: true, date: true },
  });

  const entries = posts
    .map((post) => {
      const url = `${baseUrl}${postUrl(post.slug)}`;
      const pubDate = (post.date ?? new Date()).toISOString();
      return `  <url>
    <loc>${xmlEscape(url)}</loc>
    <news:news>
      <news:publication>
        <news:name>${xmlEscape(siteConfig.siteName)}</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${pubDate}</news:publication_date>
      <news:title>${xmlEscape(post.title)}</news:title>
    </news:news>
  </url>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${entries}
</urlset>`;

  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
