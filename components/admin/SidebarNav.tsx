"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";
import type { Permissions } from "@/lib/auth";
import type { UserRole } from "@prisma/client";

interface NavLink {
  label: string;
  href: string;
  icon: string;
}

interface NavGroup {
  label?: string;
  items: (NavLink | NavSubmenu)[];
}

interface NavSubmenu {
  label: string;
  icon: string;
  /** The parent row's own href. Groups with a real landing page (Posts,
   *  Analytics, Tools) navigate there on click; groups that are purely
   *  an organizational folder (Templates & Pages, Site Settings) use "#"
   *  and only toggle open/closed. */
  href: string;
  /** Renders expanded on first load regardless of the current route —
   *  matches the original PHP panel's actual markup, where Posts,
   *  Analytics, and Tools ship with `js-open`/`submenu-open` present
   *  unconditionally (verified directly from its view-source), while
   *  "Templates & Pages"/"Site Settings" start collapsed. */
  defaultOpen?: boolean;
  items: NavLink[];
}

function isSubmenu(item: NavLink | NavSubmenu): item is NavSubmenu {
  return "items" in item;
}

export function SidebarNav({
  role,
  permissions,
  siteName,
  siteLogo,
  isOpen,
  onClose,
}: {
  role: UserRole;
  siteName: string;
  siteLogo: string;
  permissions: Permissions | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();
  const isAdmin = role === "admin";
  const can = (v: boolean | undefined) => isAdmin || Boolean(v);

  const groups: NavGroup[] = [
    {
      label: "Main",
      items: [
        { label: "Dashboard", href: "/admin/dashboard", icon: "fa-home" },
        {
          label: "Posts",
          icon: "fa-newspaper",
          href: "/admin/blogs-manager",
          defaultOpen: true,
          items: [
            { label: "All Posts", href: "/admin/blogs-manager", icon: "fa-list" },
            { label: "Add Post", href: "/admin/post-manager/new", icon: "fa-plus" },
          ],
        },
        ...(can(permissions?.files.access_file_manager)
          ? [{ label: "File Manager", href: "/admin/file-manager", icon: "fa-images" } as NavLink]
          : []),
        { label: "AI Features", href: "/admin/ai-features", icon: "fa-robot" },
        ...(can(permissions?.analytics.view_basic)
          ? [
              {
                label: "Analytics",
                icon: "fa-chart-line",
                href: "/admin/analytics",
                defaultOpen: true,
                items: [
                  { label: "Overview", href: "/admin/analytics", icon: "fa-chart-line" },
                  ...(isAdmin
                    ? [{ label: "Traffic Adjustment", href: "/admin/analytics-adjustment", icon: "fa-filter" }]
                    : []),
                ],
              } as NavSubmenu,
            ]
          : []),
      ],
    },
    {
      label: "Settings",
      items: [
        // Every entry below is gated on the SAME permission its page's own
        // guard checks (see lib/pageGuard.tsx usage in each page.tsx).
        // Previously several were gated on `isAdmin` while their page
        // accepted a permission, and a few — Tools, Post Template,
        // Sidebar Settings — had no gate at all, so a user without the
        // permission saw the link and got an "Access denied" page after
        // clicking. Showing a link that only leads to a refusal is worse
        // than not showing it: the person can't tell a missing permission
        // from a broken page.
        ...(can(permissions?.settings.general)
          ? [{ label: "Code Snippets", href: "/admin/code-snippets", icon: "fa-code" } as NavLink]
          : []),
        ...(can(permissions?.ads.manage_ads)
          ? [{ label: "Ad Inserter", href: "/admin/ad-inserter", icon: "fa-ad" } as NavLink]
          : []),
        ...(can(permissions?.settings.general)
          ? [{ label: "Country Redirection", href: "/admin/country-redirection", icon: "fa-globe" } as NavLink]
          : []),
        ...(can(permissions?.tools.import_export || permissions?.tools.backup_restore)
          ? [
              {
                label: "Tools",
                icon: "fa-toolbox",
                href: "/admin/import-export",
                defaultOpen: true,
                items: [
                  ...(can(permissions?.tools.import_export)
                    ? [{ label: "Import & Export", href: "/admin/import-export", icon: "fa-exchange-alt" }]
                    : []),
                  ...(can(permissions?.tools.backup_restore)
                    ? [{ label: "Backup & Restore", href: "/admin/backup-restore", icon: "fa-database" }]
                    : []),
                ],
              },
            ]
          : []),
        ...(can(permissions?.tools.cache_manager)
          ? [{ label: "Cache Manager", href: "/admin/cache-manager", icon: "fa-bolt" } as NavLink]
          : []),
        ...(can(permissions?.users.create || permissions?.users.edit || permissions?.users.delete)
          ? [{ label: "Users Manager", href: "/admin/user-manager", icon: "fa-user" } as NavLink]
          : []),
      ],
    },
    {
      label: "Content",
      items: [
        ...(can(
          permissions?.templates.post_template ||
            permissions?.templates.sidebar_settings ||
            permissions?.templates.manage_pages ||
            permissions?.pages.create ||
            permissions?.pages.edit
        )
          ? [
              {
                label: "Templates & Pages",
                icon: "fa-sitemap",
                href: "#",
                items: [
                  ...(can(permissions?.settings.general)
                    ? [{ label: "Post Template", href: "/admin/post-template", icon: "fa-file-alt" }]
                    : []),
                  ...(can(permissions?.settings.general)
                    ? [{ label: "Sidebar Settings", href: "/admin/sidebar-settings", icon: "fa-table-columns" }]
                    : []),
                  ...(can(permissions?.pages.create || permissions?.pages.edit)
                    ? [{ label: "Pages", href: "/admin/pages-list", icon: "fa-file" }]
                    : []),
                ],
              },
            ]
          : []),
        {
          label: "Site Settings",
          icon: "fa-cogs",
          href: "#",
          items: [
            ...(can(permissions?.blogs.manage_categories)
              ? [{ label: "Categories", href: "/admin/categories-manager", icon: "fa-folder" }]
              : []),
            ...(can(permissions?.blogs.manage_tags)
              ? [{ label: "Tags", href: "/admin/tag-manager", icon: "fa-tags" }]
              : []),
            ...(can(permissions?.blogs.manage_comments)
              ? [{ label: "Comments", href: "/admin/comments-manager", icon: "fa-comments" }]
              : []),
            ...(can(permissions?.settings.general) ? [{ label: "Header", href: "/admin/header-customizer", icon: "fa-window-maximize" }] : []),
            ...(can(permissions?.settings.general) ? [{ label: "Footer", href: "/admin/footer-customizer", icon: "fa-shoe-prints" }] : []),
            ...(can(permissions?.settings.general) ? [{ label: "Homepage", href: "/admin/homepage-settings", icon: "fa-house" }] : []),
            ...(can(permissions?.settings.general) ? [{ label: "General Settings", href: "/admin/general-settings", icon: "fa-sliders-h" }] : []),
            ...(can(permissions?.settings.general) ? [{ label: "Performance", href: "/admin/performance-settings", icon: "fa-tachometer-alt" }] : []),
            ...(can(permissions?.settings.general) ? [{ label: "Cron Manager", href: "/admin/cron-manager", icon: "fa-clock" }] : []),
          ],
        },
      ],
    },
    ...(isAdmin
      ? [
          {
            label: "More",
            items: [{ label: "Activity Logs", href: "/admin/activity-logs", icon: "fa-history" } as NavLink],
          },
        ]
      : []),
    {
      label: "System",
      items: [{ label: "Logout", href: "/api/auth/logout", icon: "fa-sign-out-alt" }],
    },
  ];

  // Keep the sidebar exactly where it was: the layout stays mounted between admin pages, and after a full
  // reload the last scroll position comes back (before paint, so it never flashes at the top first).
  const navRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    let saved: number | null = null;
    try { const v = window.sessionStorage.getItem(SCROLL_KEY); saved = v === null ? null : Number(v); } catch { /* storage blocked */ }
    const restore = () => {
      if (saved !== null && Number.isFinite(saved)) nav.scrollTop = saved;
      else nav.querySelector<HTMLElement>("[data-active='true']")?.scrollIntoView({ block: "nearest" });
    };
    restore();
    requestAnimationFrame(restore);
  }, []);

  const visibleGroups = groups
    // A section with nothing under it (every child filtered out by permission) would show as a bare label,
    // and a submenu with no children would open to nothing — both are dropped.
    .map((group) => ({ ...group, items: group.items.filter((item) => !isSubmenu(item) || item.items.length > 0) }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      <div className={`sidebar-overlay${isOpen ? " active" : ""}`} onClick={onClose} />
      <aside className={`sidebar sb${isOpen ? " open" : ""}`}>
        {/* brand row — same 89px header as sriandaltraders.co.in's admin sidebar */}
        <div className="sb-head">
          <Link href="/admin/dashboard" className="sb-brand" title="Dashboard">
            {siteLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={siteLogo} alt={siteName} className="sb-logo" />
            ) : (
              siteName
            )}
          </Link>
          <button className="sb-close" onClick={onClose} aria-label="Close menu" type="button">
            <i className="fas fa-times" />
          </button>
        </div>
        <nav
          ref={navRef}
          className="sb-nav"
          onScroll={(e) => { try { window.sessionStorage.setItem(SCROLL_KEY, String(e.currentTarget.scrollTop)); } catch { /* storage blocked */ } }}
        >
          {visibleGroups.map((group, gi) => (
            <div className="sb-section" key={gi}>
              {group.label && <div className="sb-title">{group.label}</div>}
              {group.items.map((item) =>
                isSubmenu(item) ? (
                  <SubmenuNav key={item.label} item={item} pathname={pathname} />
                ) : (
                  <NavItem key={item.href} link={item} active={isLinkActive(pathname, item.href)} />
                )
              )}
            </div>
          ))}
        </nav>
      </aside>
    </>
  );
}

const SCROLL_KEY = "admin_sidebar_scroll";

function isLinkActive(pathname: string | null, href: string): boolean {
  if (!pathname || href === "#") return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** One menu link. Logout is a POST form, never a <Link>: Next.js prefetches links on screen, and a
 *  prefetchable logout link was signing admins out in the background. */
function NavItem({ link, active, sub = false, flex = false }: { link: NavLink; active: boolean; sub?: boolean; flex?: boolean }) {
  const cls = `sb-link${sub ? " sb-sub" : ""}${flex ? " sb-flex" : ""}${active ? " active" : ""}`;
  if (link.href === "/api/auth/logout") {
    return (
      <form method="POST" action={link.href}>
        <button type="submit" className={`${cls} sb-button`}>
          <span className="sb-icon"><i className={`fas ${link.icon}`} /></span>
          {link.label}
        </button>
      </form>
    );
  }
  return (
    <Link href={link.href} className={cls} data-active={active ? "true" : undefined}>
      <span className="sb-icon"><i className={`fas ${link.icon}`} /></span>
      {link.label}
    </Link>
  );
}

function SubmenuNav({ item, pathname }: { item: NavSubmenu; pathname: string | null }) {
  const id = `nav_${item.label.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
  const hasActiveChild = item.items.some((i) => isLinkActive(pathname, i.href));
  // Open when you're on one of its pages; otherwise the saved choice (localStorage), else its default.
  const [open, setOpen] = useState<boolean>(hasActiveChild || !!item.defaultOpen);
  useLayoutEffect(() => {
    if (hasActiveChild) return;
    try {
      const saved = window.localStorage.getItem(id);
      if (saved !== null) setOpen(saved === "1");
    } catch { /* storage blocked */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [prevActive, setPrevActive] = useState(hasActiveChild);
  if (hasActiveChild !== prevActive) {
    setPrevActive(hasActiveChild);
    if (hasActiveChild) setOpen(true);
  }

  function toggle() {
    setOpen((o) => {
      try { window.localStorage.setItem(id, o ? "0" : "1"); } catch { /* ignore */ }
      return !o;
    });
  }

  // The parent row lights up only when it is the page itself (not when a sub-page is open).
  const parentActive = item.href !== "#" && pathname === item.href && !item.items.some((i) => i.href !== item.href && isLinkActive(pathname, i.href));
  return (
    <div>
      <div className="sb-row">
        {item.href === "#" ? (
          <button type="button" className="sb-link sb-flex sb-button" onClick={toggle} aria-expanded={open}>
            <span className="sb-icon"><i className={`fas ${item.icon}`} /></span>
            {item.label}
          </button>
        ) : (
          <NavItem link={{ label: item.label, href: item.href, icon: item.icon }} active={parentActive} flex />
        )}
        <button type="button" className={`sb-chev${open ? " open" : ""}`} onClick={toggle} aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${item.label}`}>
          <i className="fas fa-chevron-down" />
        </button>
      </div>
      <div className={`sb-submenu${open ? " open" : ""}`}>
        {item.items.map((sub) => (
          <NavItem key={sub.href + sub.label} link={sub} sub active={isLinkActive(pathname, sub.href) && !(sub.href === item.href && pathname !== sub.href)} />
        ))}
      </div>
    </div>
  );
}
