import Link from "next/link";
import { getLatestPosts, getPopularPosts } from "@/lib/posts";
import { postUrl } from "@/lib/urls";
import type { PostTemplateSettings } from "@/lib/postTemplateTypes";

/**
 * Post-page sidebar — "Latest Posts" / "Trending" widgets, gated by the
 * pt.sidebar_latest / pt.sidebar_trending toggles set in Sidebar Settings
 * (the settings existed and saved correctly, but this component — the
 * actual rendering — was missing entirely; caught during a final
 * completeness pass).
 */
export async function PostSidebar({
  pt,
  excludePostId,
  children,
}: {
  pt: PostTemplateSettings;
  excludePostId: number;
  /** Desktop chapter Table of Contents (see DesktopTocSidebar.tsx) —
   *  rendered first, matching the reference's exact widget order,
   *  and shown regardless of whether Latest/Trending have any content
   *  (a chaptered post with sidebar_latest/trending both off should
   *  still show its own TOC). */
  children?: React.ReactNode;
}) {
  if (!pt.sidebar) return null;

  const [latest, trending] = await Promise.all([
    pt.sidebar_latest ? getLatestPosts(pt.sidebar_latest_count, excludePostId) : Promise.resolve([]),
    pt.sidebar_trending ? getPopularPosts(pt.sidebar_trending_count) : Promise.resolve([]),
  ]);

  if (!children && latest.length === 0 && trending.length === 0) return null;

  return (
    <aside className="pst-sidebar">
      {children}
      {pt.sidebar_latest && latest.length > 0 && (
        <div className="pst-sidebar-widget">
          <h3 className="pst-sidebar-title" style={{ fontSize: pt.sidebar_title_font_size }}>
            Latest Posts
          </h3>
          <ul className="pst-sidebar-list">
            {latest.map((p) => (
              <li key={p.id}>
                <Link href={postUrl(p.slug)}>{p.title}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {pt.sidebar_trending && trending.length > 0 && (
        <div className="pst-sidebar-widget">
          <h3 className="pst-sidebar-title" style={{ fontSize: pt.sidebar_title_font_size }}>
            Trending
          </h3>
          <ul className="pst-sidebar-list">
            {trending
              .filter((p) => p.id !== excludePostId)
              .map((p) => (
                <li key={p.id}>
                  <Link href={postUrl(p.slug)}>{p.title}</Link>
                </li>
              ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
