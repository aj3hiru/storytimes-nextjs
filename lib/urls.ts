/**
 * Ported verbatim from includes/functions.php. IMPORTANT: postUrl() returns
 * a plain `/{slug}` — NOT `/story/{slug}-{id}`. storyUrl() (the
 * `/story/slug-id` form) exists as a secondary/legacy pattern but every
 * actual link generated across the templates (index.php, category.php,
 * tag.php, author.php, search.php) uses postUrl(). Both route to the same
 * post reader (see app/(public)/[slug]/page.tsx and
 * app/(public)/story/[slugId]/page.tsx).
 */
export function postUrl(slug: string): string {
  return `/${slug}`;
}

export function storyUrl(slug: string, id: number): string {
  return `/story/${slug}-${id}`;
}

export function tagUrl(slug: string, id: number | bigint): string {
  return `/tag/${slug}-${id}`;
}

export function categoryUrl(slug: string): string {
  return `/categories/${slug}`;
}

export function authorUrl(slug: string): string {
  return `/author/${slug}`;
}

export function chapterUrl(slug: string, chapterNumber: number): string {
  return `/${slug}/chapter-${chapterNumber}`;
}

/** Ported from includes/functions.php formatViews(). */
export function formatViews(views: number): string {
  if (views >= 1_000_000) return `${Math.round((views / 1_000_000) * 10) / 10}M`;
  if (views >= 1_000) return `${Math.round((views / 1_000) * 10) / 10}K`;
  return String(views);
}

/** Resolves a stored media path (media.file_path / site_logo / etc.) to a
 *  renderable <img src>. All uploads are local-disk-only now (R2 removed
 *  entirely) and served through /api/media/file — see lib/localStorage.ts
 *  for why they're not just plain /uploads/... static-file URLs. Full
 *  external URLs (e.g. an admin manually pasting an external image URL
 *  into a settings field) are passed through unchanged. */
export function resolveMediaUrl(path: string): string {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  const relative = path.replace(/^\/+/, "");
  if (relative.startsWith("uploads/")) {
    return `/api/media/file?path=${encodeURIComponent(relative)}`;
  }
  return `/${relative}`;
}
export function isNewPost(date: Date | string): boolean {
  const d = typeof date === "string" ? new Date(date) : date;
  return Date.now() - d.getTime() < 3 * 86_400_000;
}


