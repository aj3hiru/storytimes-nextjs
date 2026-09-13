"use client";

import { usePathname } from "next/navigation";

/**
 * Real bug fixed here, found by extracting every admin page's actual
 * $pageTitle/$pageSubtitle pair directly from the real PHP source
 * (newsbase-backup.zip) rather than guessing: an earlier pass showed
 * the SAME "<date> — <site name> Admin Panel" subtitle on every single
 * page. That format is genuinely only used by dashboard.php — every
 * other page has its own specific, static subtitle describing what
 * that page does (e.g. "Create, edit, and organize categories" for
 * Category Manager). post-manager.php is a further special case: its
 * title/subtitle depend on whether you're creating or editing
 * ("New Post" / "Create a new blog post" vs "Edit Post" / "Update your
 * content"), matched here by URL shape (.../post-manager/new vs
 * .../post-manager/[id]/edit) since usePathname() can see that
 * distinction directly.
 */
const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  "/admin/dashboard": { title: "Dashboard", subtitle: "" }, // special-cased below (date + site name)
  "/admin/blogs-manager": { title: "Blogs Manager", subtitle: "Manage all your blog posts" },
  "/admin/file-manager": { title: "Media Manager", subtitle: "Upload and manage all your files" },
  "/admin/ai-features": { title: "AI Features", subtitle: "Manage AI generation, API keys, feature toggles & cleanup" },
  "/admin/analytics": { title: "Analytics", subtitle: "Views, top posts, and traffic sources" },
  "/admin/analytics-adjustment": {
    title: "Traffic Adjustment",
    subtitle: "Reduce specific country traffic on users' own analytics dashboards, without changing real data",
  },
  "/admin/code-snippets": { title: "Code Snippets", subtitle: "Inject scripts into the head, body, and /body sections" },
  "/admin/ad-inserter": { title: "Ad Inserter", subtitle: "Manage ad placements across your site" },
  "/admin/country-redirection": { title: "Country Redirection", subtitle: "Manage country-based traffic redirection" },
  "/admin/import-export": { title: "Import / Export", subtitle: "Export or import a complete backup of Posts and Pages, including media" },
  "/admin/backup-restore": {
    title: "Backup & Restore",
    subtitle: "Complete site backup — database + media + settings. Restore to a clean slate anytime.",
  },
  "/admin/cache-manager": { title: "Cache Manager", subtitle: "Manage and flush cache files" },
  "/admin/user-manager": { title: "Users & Authors", subtitle: "Manage accounts, roles and author profiles" },
  "/admin/post-template": { title: "Post Template Editor", subtitle: "Control which sections appear on post pages" },
  "/admin/sidebar-settings": {
    title: "Sidebar Settings",
    subtitle: "Homepage & Post Page sidebar — enable/disable and choose how many posts to show",
  },
  "/admin/pages-list": { title: "All Pages", subtitle: "Manage your static pages" },
  "/admin/categories-manager": { title: "Category Manager", subtitle: "Create, edit, and organize categories" },
  "/admin/tag-manager": { title: "Tag Manager", subtitle: "Create and manage tags" },
  "/admin/comments-manager": { title: "Comments Manager", subtitle: "Moderate and manage comments" },
  "/admin/header-customizer": { title: "Header Customizer", subtitle: "Customize logo, menu, colors & more" },
  "/admin/footer-customizer": {
    title: "Footer Customizer",
    subtitle: "Customize newsletter, brand details, footer columns, links and copyright",
  },
  "/admin/homepage-settings": {
    title: "Homepage Settings",
    subtitle: 'The "Story" bar text/visibility, and how many posts show before pagination kicks in',
  },
  "/admin/general-settings": { title: "General Settings", subtitle: "Site title, tagline, logo, favicon, language & more" },
  "/admin/performance-settings": { title: "Performance Settings", subtitle: "Ultra-fast CMS optimization controls" },
  "/admin/cron-manager": { title: "Cron Manager", subtitle: "Monitor and control scheduled jobs" },
  "/admin/activity-logs": { title: "Activity Logs", subtitle: "View system activity logs" },
  "/admin/my-profile": { title: "Edit Profile", subtitle: "Update your own account and author details" },
};

function pageMetaFor(pathname: string | null, siteName: string): { title: string; subtitle: string } {
  if (!pathname) return { title: "Admin Panel", subtitle: "" };

  if (pathname === "/admin/dashboard") {
    const today = new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    return { title: "Dashboard", subtitle: `${today} — ${siteName} Admin Panel` };
  }

  if (pathname.startsWith("/admin/post-manager")) {
    const isEdit = /\/post-manager\/[^/]+\/edit/.test(pathname);
    return isEdit ? { title: "Edit Post", subtitle: "Update your content" } : { title: "New Post", subtitle: "Create a new blog post" };
  }
  if (pathname.startsWith("/admin/page-editor")) {
    const isEdit = pathname.includes("edit");
    return { title: "Page Editor", subtitle: isEdit ? "Update page content and SEO settings" : "Create a new static page" };
  }

  const match = Object.keys(PAGE_META)
    .filter((route) => pathname === route || pathname.startsWith(`${route}/`))
    .sort((a, b) => b.length - a.length)[0];
  return match ? PAGE_META[match] : { title: "Admin Panel", subtitle: "" };
}

export function TopNav({
  siteName,
  onMenuToggle,
}: {
  siteName: string;
  onMenuToggle: () => void;
}) {
  const pathname = usePathname();
  const { title, subtitle } = pageMetaFor(pathname, siteName);

  return (
    <header className="top-nav">
      <div className="nav-left">
        <button className="menu-toggle" onClick={onMenuToggle} aria-label="Toggle sidebar" type="button">
          <i className="fas fa-bars" />
        </button>
        <span className="sitename-mob">{siteName}</span>
        <div className="page-heading">
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      <div className="nav-right" />
    </header>
  );
}
