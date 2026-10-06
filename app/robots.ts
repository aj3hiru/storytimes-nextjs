import type { MetadataRoute } from "next";
import { resolveSiteConfig } from "@/lib/config";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const siteConfig = await resolveSiteConfig("");
  const base = siteConfig.siteUrl.replace(/\/+$/, "");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/admin-login", "/api/", "/search"] }],
    sitemap: [`${base}/sitemap.xml`, `${base}/sitemap-news.xml`],
  };
}
