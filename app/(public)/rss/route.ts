import { prisma } from "@/lib/db";
import { resolveSiteConfig } from "@/lib/config";
import { postUrl } from "@/lib/urls";
import { stripTags } from "@/lib/postDetail";

export const revalidate = 300; // 5 minutes — this doesn't need to be dynamic-per-request

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rfc822(date: Date): string {
  return date.toUTCString();
}

export async function GET() {
  const siteConfig = await resolveSiteConfig("");
  const baseUrl = siteConfig.siteUrl.replace(/\/+$/, "");

  const posts = await prisma.post.findMany({
    where: { status: "published" },
    orderBy: { date: "desc" },
    take: 20,
    select: {
      id: true,
      slug: true,
      title: true,
      content: true,
      date: true,
      updatedAt: true,
      featuredImage: { select: { filePath: true } },
    },
  });

  const items = posts
    .map((p) => {
      const url = `${baseUrl}${postUrl(p.slug)}`;
      const pubDate = p.date ? rfc822(new Date(p.date)) : rfc822(new Date());
      const text = stripTags(p.content);
      let excerpt = text.slice(0, 160);
      if (text.length > 160) excerpt += "...";
      const encl = p.featuredImage
        ? `<enclosure url="${xmlEscape(`${baseUrl}/${p.featuredImage.filePath.replace(/^\/+/, "")}`)}" length="0" type="image/jpeg"/>`
        : "";

      return `<item>
<title>${xmlEscape(p.title)}</title>
<link>${url}</link>
<guid isPermaLink="true">${url}</guid>
<pubDate>${pubDate}</pubDate>
<description>${xmlEscape(excerpt)}</description>
${encl}
<content:encoded><![CDATA[${text}]]></content:encoded>
</item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
<title>${xmlEscape(siteConfig.siteName)}</title>
<link>${baseUrl}</link>
<description>${xmlEscape(siteConfig.seoDefaultDescription)}</description>
<language>en-us</language>
<generator>Next.js</generator>
<lastBuildDate>${rfc822(new Date())}</lastBuildDate>
<atom:link href="${baseUrl}/rss.xml" rel="self" type="application/rss+xml"/>
${items}
</channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
