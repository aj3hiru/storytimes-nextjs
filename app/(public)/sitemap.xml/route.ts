import { prisma } from "@/lib/db";
import { resolveSiteConfig } from "@/lib/config";
import { postUrl } from "@/lib/urls";

export const revalidate = 3600; // 1 hour

function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function urlEntry(loc: string, lastmod: string, changefreq: string, priority: string): string {
  return `  <url>
    <loc>${xmlEscape(loc)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

export async function GET() {
  const siteConfig = await resolveSiteConfig("");
  const baseUrl = siteConfig.siteUrl.replace(/\/+$/, "");

  const latestPost = await prisma.post.findFirst({
    where: { status: "published" },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });
  const globalLastMod = (latestPost?.updatedAt ?? new Date()).toISOString();

  const entries: string[] = [
    urlEntry(`${baseUrl}/`, globalLastMod, "daily", "1.0"),
    urlEntry(`${baseUrl}/rss.xml`, globalLastMod, "daily", "0.8"),
  ];

  const pages = await prisma.page.findMany({
    where: { status: "published" },
    orderBy: { id: "asc" },
    select: { slug: true, updatedAt: true },
  });
  for (const pg of pages) {
    entries.push(
      urlEntry(
        `${baseUrl}/${pg.slug.replace(/^\/+/, "")}`,
        (pg.updatedAt ?? new Date()).toISOString(),
        "monthly",
        "0.5"
      )
    );
  }

  entries.push(urlEntry(`${baseUrl}/categories`, globalLastMod, "daily", "0.9"));

  const categories = await prisma.category.findMany({
    where: { posts: { some: { status: "published" } } },
    select: {
      slug: true,
      posts: { where: { status: "published" }, orderBy: { updatedAt: "desc" }, take: 1, select: { updatedAt: true } },
    },
    orderBy: { id: "asc" },
  });
  for (const cat of categories) {
    const lastMod = cat.posts[0]?.updatedAt ?? new Date();
    entries.push(urlEntry(`${baseUrl}/categories/${cat.slug}`, lastMod.toISOString(), "daily", "0.7"));
  }

  const posts = await prisma.post.findMany({
    where: { status: "published" },
    orderBy: { date: "desc" },
    select: { slug: true, date: true, updatedAt: true },
  });
  for (const post of posts) {
    const lastMod = post.updatedAt ?? post.date ?? new Date();
    const daysOld = post.date ? (Date.now() - new Date(post.date).getTime()) / 86_400_000 : 999;
    const priority = daysOld < 7 ? "0.9" : daysOld < 30 ? "0.8" : daysOld < 90 ? "0.7" : "0.6";
    entries.push(urlEntry(`${baseUrl}${postUrl(post.slug)}`, lastMod.toISOString(), "weekly", priority));
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${entries.join("\n")}
</urlset>`;

  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
