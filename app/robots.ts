import type { MetadataRoute } from "next";
import { resolveSiteConfig } from "@/lib/config";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const siteConfig = await resolveSiteConfig("");
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/admin-login", "/api/"] }],
    sitemap: `${siteConfig.siteUrl.replace(/\/+$/, "")}/sitemap.xml`,
  };
}
