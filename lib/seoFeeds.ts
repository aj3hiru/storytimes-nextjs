import fs from "fs";
import { prisma } from "./db";
import { resolveSiteConfig, getAppConfig } from "./config";
import { postUrl, resolveMediaUrl, categoryUrl, tagUrl, authorUrl, staticPagePath } from "./urls";
import { resolveLocalPath } from "./localStorage";

/**
 * RSS feed and XML sitemaps, laid out like a WordPress site's
 * (/feed/, /sitemap.xml index → posts / pages / categories / tags /
 * authors / news). Each sitemap carries an XSL stylesheet so it reads as a
 * table in a browser; search engines ignore the stylesheet.
 */

export const SITEMAP_PAGE_SIZE = 1000;

export function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function cdata(s: string): string {
  return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function iso(d: Date | null | undefined): string {
  return (d ?? new Date()).toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

async function site() {
  const [cfg, app] = await Promise.all([resolveSiteConfig(""), getAppConfig()]);
  const base = cfg.siteUrl.replace(/\/+$/, "");
  const lang = (app.site_language || "en").trim() || "en";
  const abs = (p: string) => (/^https?:\/\//i.test(p) ? p : `${base}${p.startsWith("/") ? "" : "/"}${p}`);
  const favicon = app.site_favicon?.trim() ? abs(resolveMediaUrl(app.site_favicon.trim())) : null;
  return { cfg, base, lang, abs, favicon };
}

function imageType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return { png: "image/png", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml", avif: "image/avif" }[ext] ?? "image/jpeg";
}

function fileSize(storedPath: string): number {
  try {
    const abs = resolveLocalPath(storedPath);
    return abs ? fs.statSync(abs).size : 0;
  } catch {
    return 0;
  }
}

function excerptOf(excerpt: string | null, content: string, max = 300): string {
  const text = (excerpt?.trim() || content.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max).replace(/\s+\S*$/, "")} [&#8230;]` : text;
}

// ── RSS ────────────────────────────────────────────────────────────────────

export async function buildRssFeed(selfPath: string, limit = 100): Promise<string> {
  const { cfg, base, lang, abs, favicon } = await site();
  const posts = await prisma.post.findMany({
    where: { status: "published" },
    orderBy: { date: "desc" },
    take: limit,
    select: {
      id: true,
      slug: true,
      title: true,
      content: true,
      excerpt: true,
      date: true,
      updatedAt: true,
      author: { select: { name: true } },
      category: { select: { name: true } },
      postCategories: { select: { category: { select: { name: true } } } },
      postTags: { select: { tag: { select: { name: true } } } },
      featuredImage: { select: { filePath: true, altText: true } },
      _count: { select: { comments: { where: { status: "approved", hidden: false } } } },
    },
  });
  const lastBuild = posts.reduce<Date>((m, p) => {
    const d = p.updatedAt ?? p.date;
    return d && d > m ? d : m;
  }, new Date(0));

  const items = posts
    .map((p) => {
      const link = `${base}${postUrl(p.slug)}`;
      const cats = [...new Set([p.category.name, ...p.postCategories.map((c) => c.category.name), ...p.postTags.map((t) => t.tag.name)])];
      const img = p.featuredImage?.filePath ? abs(resolveMediaUrl(p.featuredImage.filePath)) : null;
      const imgType = img ? imageType(img) : "";
      const lead = img ? `<p><img src="${xmlEscape(img)}" alt="${xmlEscape(p.featuredImage?.altText || p.title)}" /></p>` : "";
      return `	<item>
		<title>${xmlEscape(p.title)}</title>
		<link>${xmlEscape(link)}</link>
		<comments>${xmlEscape(link)}#comments</comments>
		<dc:creator>${cdata(p.author?.name ?? cfg.siteName)}</dc:creator>
		<pubDate>${(p.date ?? new Date()).toUTCString()}</pubDate>
${cats.map((c) => `		<category>${cdata(c)}</category>`).join("\n")}
		<guid isPermaLink="true">${xmlEscape(link)}</guid>
		<description>${cdata(excerptOf(p.excerpt, p.content))}</description>
		<content:encoded>${cdata(lead + p.content)}</content:encoded>
		<slash:comments>${p._count.comments}</slash:comments>${
          img
            ? `
		<enclosure url="${xmlEscape(img)}" length="${fileSize(p.featuredImage!.filePath)}" type="${imgType}" />
		<media:content url="${xmlEscape(img)}" medium="image" type="${imgType}">
			<media:title type="plain">${xmlEscape(p.featuredImage?.altText || p.title)}</media:title>
		</media:content>
		<media:thumbnail url="${xmlEscape(img)}" />`
            : ""
        }
	</item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"
	xmlns:content="http://purl.org/rss/1.0/modules/content/"
	xmlns:wfw="http://wellformedweb.org/CommentAPI/"
	xmlns:dc="http://purl.org/dc/elements/1.1/"
	xmlns:atom="http://www.w3.org/2005/Atom"
	xmlns:sy="http://purl.org/rss/1.0/modules/syndication/"
	xmlns:slash="http://purl.org/rss/1.0/modules/slash/"
	xmlns:media="http://search.yahoo.com/mrss/"
	>

<channel>
	<title>${xmlEscape(cfg.siteName)}</title>
	<atom:link href="${xmlEscape(base + selfPath)}" rel="self" type="application/rss+xml" />
	<link>${xmlEscape(base)}/</link>
	<description>${xmlEscape(cfg.siteTagline || cfg.seoDefaultDescription || "")}</description>
	<lastBuildDate>${(lastBuild.getTime() ? lastBuild : new Date()).toUTCString()}</lastBuildDate>
	<language>${xmlEscape(lang)}</language>
	<sy:updatePeriod>hourly</sy:updatePeriod>
	<sy:updateFrequency>1</sy:updateFrequency>
	<generator>${xmlEscape(base)}</generator>${
    favicon
      ? `
	<image>
		<url>${xmlEscape(favicon)}</url>
		<title>${xmlEscape(cfg.siteName)}</title>
		<link>${xmlEscape(base)}/</link>
	</image>`
      : ""
  }
${items}
</channel>
</rss>
`;
}

// ── Sitemaps ───────────────────────────────────────────────────────────────

const XSL = `<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>`;

function urlset(entries: string[], extraNs = ""): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
${XSL}
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${extraNs}>
${entries.join("\n")}
</urlset>
`;
}

function urlEntry(loc: string, lastmod?: Date | null, extra = ""): string {
  return `<url>
<loc>${xmlEscape(loc)}</loc>${lastmod ? `\n<lastmod>${iso(lastmod)}</lastmod>` : ""}${extra}
</url>`;
}

export async function buildSitemapIndex(): Promise<string> {
  const { base } = await site();
  const [postCount, latestPost, latestPage, latestTag] = await Promise.all([
    prisma.post.count({ where: { status: "published" } }),
    prisma.post.findFirst({ where: { status: "published" }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true, date: true } }),
    prisma.page.findFirst({ where: { status: "published" }, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
    prisma.tag.findFirst({ orderBy: { updatedAt: "desc" }, select: { updatedAt: true } }),
  ]);
  const postMod = latestPost?.updatedAt ?? latestPost?.date ?? new Date();
  const pages = Math.max(1, Math.ceil(postCount / SITEMAP_PAGE_SIZE));
  const maps: [string, Date | null | undefined][] = [
    ...Array.from({ length: pages }, (_, i) => [`/sitemap-posts-${i + 1}.xml`, postMod] as [string, Date]),
    ["/sitemap-pages.xml", latestPage?.updatedAt && latestPage.updatedAt > postMod ? latestPage.updatedAt : postMod],
    ["/sitemap-categories.xml", postMod],
    ["/sitemap-tags.xml", latestTag?.updatedAt ?? postMod],
    ["/sitemap-authors.xml", postMod],
    ["/sitemap-news.xml", postMod],
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
${XSL}
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${maps.map(([p, d]) => `<sitemap><loc>${xmlEscape(base + p)}</loc><lastmod>${iso(d)}</lastmod></sitemap>`).join("\n")}
</sitemapindex>
`;
}

export async function buildPostsSitemap(page: number): Promise<string | null> {
  const { base, abs } = await site();
  const posts = await prisma.post.findMany({
    where: { status: "published" },
    orderBy: { date: "desc" },
    skip: (page - 1) * SITEMAP_PAGE_SIZE,
    take: SITEMAP_PAGE_SIZE,
    select: { slug: true, title: true, date: true, updatedAt: true, featuredImage: { select: { filePath: true } } },
  });
  if (posts.length === 0 && page > 1) return null;
  return urlset(
    posts.map((p) =>
      urlEntry(
        `${base}${postUrl(p.slug)}`,
        p.updatedAt ?? p.date,
        p.featuredImage?.filePath ? `\n<image:image><image:loc>${xmlEscape(abs(resolveMediaUrl(p.featuredImage.filePath)))}</image:loc></image:image>` : ""
      )
    ),
    ` xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"`
  );
}

export async function buildPagesSitemap(): Promise<string> {
  const { base } = await site();
  const [pages, latestPost] = await Promise.all([
    prisma.page.findMany({ where: { status: "published" }, orderBy: { id: "asc" }, select: { slug: true, updatedAt: true } }),
    prisma.post.findFirst({ where: { status: "published" }, orderBy: { date: "desc" }, select: { date: true, updatedAt: true } }),
  ]);
  return urlset([
    urlEntry(`${base}/`, latestPost?.updatedAt ?? latestPost?.date),
    urlEntry(`${base}/categories`, latestPost?.updatedAt ?? latestPost?.date),
    ...pages.map((p) => urlEntry(`${base}${staticPagePath(p.slug)}`, p.updatedAt)),
  ]);
}

export async function buildCategoriesSitemap(): Promise<string> {
  const { base } = await site();
  const cats = await prisma.category.findMany({
    select: { slug: true, posts: { where: { status: "published" }, orderBy: { date: "desc" }, take: 1, select: { date: true, updatedAt: true } } },
    orderBy: { name: "asc" },
  });
  return urlset(cats.filter((c) => c.posts.length > 0).map((c) => urlEntry(`${base}${categoryUrl(c.slug)}`, c.posts[0].updatedAt ?? c.posts[0].date)));
}

export async function buildTagsSitemap(): Promise<string> {
  const { base } = await site();
  const tags = await prisma.tag.findMany({
    select: { id: true, slug: true, updatedAt: true, postTags: { where: { post: { status: "published" } }, take: 1, select: { postId: true } } },
    orderBy: { name: "asc" },
  });
  return urlset(tags.filter((t) => t.postTags.length > 0).map((t) => urlEntry(`${base}${tagUrl(t.slug, t.id)}`, t.updatedAt)));
}

export async function buildAuthorsSitemap(): Promise<string> {
  const { base } = await site();
  const authors = await prisma.author.findMany({
    where: { slug: { not: null }, posts: { some: { status: "published" } } },
    select: { slug: true, posts: { where: { status: "published" }, orderBy: { date: "desc" }, take: 1, select: { date: true, updatedAt: true } } },
  });
  return urlset(authors.map((a) => urlEntry(`${base}${authorUrl(a.slug!)}`, a.posts[0]?.updatedAt ?? a.posts[0]?.date)));
}

/** Google News: articles from the last 2 days (max 1000), as Google requires. */
export async function buildNewsSitemap(): Promise<string> {
  const { cfg, base, lang, abs } = await site();
  const since = new Date(Date.now() - 2 * 86_400_000);
  const posts = await prisma.post.findMany({
    where: { status: "published", date: { gte: since } },
    orderBy: { date: "desc" },
    take: 1000,
    select: { slug: true, title: true, date: true, updatedAt: true, featuredImage: { select: { filePath: true } } },
  });
  return urlset(
    posts.map((p) =>
      urlEntry(
        `${base}${postUrl(p.slug)}`,
        p.updatedAt ?? p.date,
        `
<news:news>
<news:publication>
<news:name>${xmlEscape(cfg.siteName)}</news:name>
<news:language>${xmlEscape(lang.split(/[-_]/)[0].toLowerCase())}</news:language>
</news:publication>
<news:publication_date>${iso(p.date)}</news:publication_date>
<news:title>${xmlEscape(p.title)}</news:title>
</news:news>${p.featuredImage?.filePath ? `\n<image:image><image:loc>${xmlEscape(abs(resolveMediaUrl(p.featuredImage.filePath)))}</image:loc></image:image>` : ""}`
      )
    ),
    ` xmlns:news="http://www.google.com/schemas/sitemap-news/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"`
  );
}

export function xmlResponse(body: string, type = "application/xml"): Response {
  return new Response(body, {
    headers: {
      "Content-Type": `${type}; charset=utf-8`,
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=3600",
      "X-Robots-Tag": "noindex, follow",
    },
  });
}

/** Browser view of the sitemaps (search engines ignore it). */
export const SITEMAP_XSL = `<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
  xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
<xsl:output method="html" encoding="UTF-8" indent="yes"/>
<xsl:template match="/">
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="robots" content="noindex"/>
<title>XML Sitemap</title>
<style>
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#1f2937;background:#f9fafb;margin:0;padding:24px}
.wrap{max-width:1100px;margin:0 auto}
h1{font-size:22px;margin:0 0 6px}
p{color:#6b7280;font-size:14px;margin:0 0 18px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;font-size:13px}
th{background:#7c3aed;color:#fff;text-align:left;padding:10px 12px;font-weight:600}
td{padding:9px 12px;border-top:1px solid #f1f1f4;word-break:break-all}
tr:nth-child(even) td{background:#fafafb}
a{color:#6d28d9;text-decoration:none}
a:hover{text-decoration:underline}
.n{color:#9ca3af;width:40px}
</style></head><body><div class="wrap">
<xsl:choose>
<xsl:when test="s:sitemapindex">
<h1>XML Sitemap Index</h1>
<p>This index lists <xsl:value-of select="count(s:sitemapindex/s:sitemap)"/> sitemaps. It is read by search engines like Google and Bing.</p>
<table><tr><th class="n">#</th><th>Sitemap</th><th>Last modified</th></tr>
<xsl:for-each select="s:sitemapindex/s:sitemap"><tr><td class="n"><xsl:value-of select="position()"/></td><td><a href="{s:loc}"><xsl:value-of select="s:loc"/></a></td><td><xsl:value-of select="concat(substring(s:lastmod,1,10),' ',substring(s:lastmod,12,5))"/></td></tr></xsl:for-each>
</table>
</xsl:when>
<xsl:otherwise>
<h1>XML Sitemap</h1>
<p>This sitemap contains <xsl:value-of select="count(s:urlset/s:url)"/> URLs. <a href="/sitemap.xml">&#8592; Sitemap index</a></p>
<table><tr><th class="n">#</th><th>URL</th><th>Images</th><th>Last modified</th></tr>
<xsl:for-each select="s:urlset/s:url"><tr><td class="n"><xsl:value-of select="position()"/></td><td><a href="{s:loc}"><xsl:value-of select="s:loc"/></a><xsl:if test="news:news"><br/><small style="color:#6b7280"><xsl:value-of select="news:news/news:title"/></small></xsl:if></td><td><xsl:value-of select="count(image:image)"/></td><td><xsl:value-of select="concat(substring(s:lastmod,1,10),' ',substring(s:lastmod,12,5))"/></td></tr></xsl:for-each>
</table>
</xsl:otherwise>
</xsl:choose>
</div></body></html>
</xsl:template>
</xsl:stylesheet>
`;
