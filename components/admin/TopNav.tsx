"use client";

import { usePathname } from "next/navigation";

/**
 * Real bugs fixed here, found by comparing directly against the actual
 * PHP admin panel's own view-source:
 * 1. The `<h1>` was hardcoded to the generic "Admin Panel" on every
 *    single page — the original shows the ACTUAL current page's name
 *    ("Dashboard", "Blogs Manager", etc.) plus a `<p>` subtitle with
 *    today's date and the site name, e.g. "Saturday, 12 September 2026
 *    — Fast2trick Admin Panel".
 * 2. `.nav-right` had an invented "View site" external-link icon AND a
 *    user-profile dropdown (My Profile / Logout) — the original's
 *    `.nav-right` is COMPLETELY EMPTY. Both of those features already
 *    exist at the very top of the page in AdminBar (the "Homepage"
 *    link and the account dropdown with My Profile/Logout) — this was
 *    pure duplication that doesn't exist in the source at all.
 */
const PAGE_TITLES: Record<string, string> = {
  "/admin/dashboard": "Dashboard",
  "/admin/blogs-manager": "Blogs Manager",
  "/admin/post-manager": "Post Manager",
  "/admin/file-manager": "File Manager",
  "/admin/ai-features": "AI Features",
  "/admin/analytics": "Analytics",
  "/admin/analytics-adjustment": "Traffic Adjustment",
  "/admin/code-snippets": "Code Snippets",
  "/admin/ad-inserter": "Ad Inserter",
  "/admin/country-redirection": "Country Redirection",
  "/admin/import-export": "Import & Export",
  "/admin/backup-restore": "Backup & Restore",
  "/admin/cache-manager": "Cache Manager",
  "/admin/user-manager": "Users Manager",
  "/admin/post-template": "Post Template",
  "/admin/sidebar-settings": "Sidebar Settings",
  "/admin/pages-list": "Pages",
  "/admin/page-editor": "Page Editor",
  "/admin/categories-manager": "Categories",
  "/admin/tag-manager": "Tags",
  "/admin/comments-manager": "Comments",
  "/admin/header-customizer": "Header Customizer",
  "/admin/footer-customizer": "Footer Customizer",
  "/admin/homepage-settings": "Homepage Settings",
  "/admin/general-settings": "General Settings",
  "/admin/performance-settings": "Performance Settings",
  "/admin/cron-manager": "Cron Manager",
  "/admin/activity-logs": "Activity Logs",
  "/admin/my-profile": "My Profile",
};

function pageTitleFor(pathname: string | null): string {
  if (!pathname) return "Admin Panel";
  // Longest-prefix match, so nested routes (e.g. /admin/post-manager/new,
  // /admin/post-manager/5/edit) still resolve to their section's title.
  const match = Object.keys(PAGE_TITLES)
    .filter((route) => pathname === route || pathname.startsWith(`${route}/`))
    .sort((a, b) => b.length - a.length)[0];
  return match ? PAGE_TITLES[match] : "Admin Panel";
}

export function TopNav({
  siteName,
  onMenuToggle,
}: {
  siteName: string;
  onMenuToggle: () => void;
}) {
  const pathname = usePathname();
  const title = pageTitleFor(pathname);
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <header className="top-nav">
      <div className="nav-left">
        <button className="menu-toggle" onClick={onMenuToggle} aria-label="Toggle sidebar" type="button">
          <i className="fas fa-bars" />
        </button>
        <span className="sitename-mob">{siteName}</span>
        <div className="page-heading">
          <h1>{title}</h1>
          <p>
            {today} — {siteName} Admin Panel
          </p>
        </div>
      </div>
      <div className="nav-right" />
    </header>
  );
}
