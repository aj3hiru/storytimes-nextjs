const NON_STORY_ROOT_ROUTES = new Set([
  "about-us",
  "contact-us",
  "privacy-policy",
  "cookie-policy",
  "disclaimer",
  "terms-and-conditions",
  "search",
  "categories",
  "author",
  "tag",
  "page",
  "admin",
  "admin-login",
  "api",
  "feed",
  "rss",
  "rss.xml",
  "robots.txt",
  "sitemap.xml",
  "sitemap-news.xml",
  "sitemap-pages.xml",
  "sitemap-categories.xml",
  "sitemap-authors.xml",
  "sitemap-tags.xml",
  "news-sitemap.xml",
  "ads.txt",
]);

/**
 * Enable notifications on the homepage, category pages, and story pages.
 * This project serves stories at /<slug> and categories at /categories/<slug>,
 * rather than using the /news/ and /category/ prefixes in the supplied example.
 */
export function isNotificationPage(pathname: string) {
  if (pathname === "/") return true;
  if (pathname.startsWith("/news/")) return true;
  if (pathname.startsWith("/category/")) return true;
  if (pathname === "/categories" || pathname.startsWith("/categories/")) return true;

  const segments = pathname.split("/").filter(Boolean);
  return segments.length === 1 && !NON_STORY_ROOT_ROUTES.has(segments[0]);
}
