"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
  isOpen,
  onClose,
}: {
  role: UserRole;
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

  return (
    <>
      <div className={`sidebar-overlay${isOpen ? " active" : ""}`} onClick={onClose} />
      <aside className={`sidebar${isOpen ? " open" : ""}`}>
        <button className="close-sidebar" onClick={onClose} aria-label="Close menu" type="button">
          <i className="fas fa-times" />
        </button>
        <nav className="sidebar-nav">
          {groups
            // A section header with nothing under it (every child filtered
            // out by permission) would render as a bare, confusing label —
            // and a submenu folder with no visible children would open to
            // nothing. Both are dropped.
            .map((group) => ({
              ...group,
              items: group.items.filter((item) => !isSubmenu(item) || item.items.length > 0),
            }))
            .filter((group) => group.items.length > 0)
            .map((group, gi) => (
            <div className="nav-section" key={gi}>
              {group.label && <div className="nav-title">{group.label}</div>}
              {group.items.map((item) =>
                isSubmenu(item) ? (
                  <SubmenuNav key={item.label} item={item} pathname={pathname} />
                ) : item.href === "/api/auth/logout" ? (
                  // Real bug fixed here — the cause of "sidebar se logout
                  // pe HTTP ERROR 405". Phase 99 correctly converted
                  // logout to a POST form, but only inside SubmenuNav's
                  // child list. Logout actually sits as a TOP-LEVEL item
                  // in the "System" group, which renders through this
                  // branch instead — so it stayed a <Link>, issued a GET,
                  // and hit a route that now only accepts POST. The
                  // AdminBar's own logout worked precisely because that
                  // one did get converted, which is why only this entry
                  // failed.
                  <form key={item.href} method="POST" action={item.href}>
                    <button type="submit" className="nav-link" style={{ width: "100%", background: "none", border: "none", cursor: "pointer", font: "inherit", textAlign: "left" }}>
                      <i className={`fas ${item.icon}`} />
                      {item.label}
                    </button>
                  </form>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`nav-link${pathname?.startsWith(item.href) ? " active" : ""}`}
                  >
                    <i className={`fas ${item.icon}`} />
                    {item.label}
                  </Link>
                )
              )}
            </div>
            ))}
        </nav>
      </aside>
    </>
  );
}

function SubmenuNav({ item, pathname }: { item: NavSubmenu; pathname: string | null }) {
  const hasActiveChild = item.items.some((i) => pathname?.startsWith(i.href));
  // Real UX bug fixed here (see admin.css's comment on .nav-submenu for
  // the full story): every group used to ALSO expand on hover and some
  // groups were permanently expanded regardless of relevance. Now every
  // Verified against the actual PHP panel's own view-source: Posts,
  // Analytics, and Tools are rendered permanently expanded (`js-open` +
  // `submenu-open`, unconditionally, regardless of the active route) —
  // `defaultOpen` on these three matches that exactly. "Templates &
  // Pages"/"Site Settings" (href="#", click-only) correctly stay
  // collapsed until clicked or until they contain the active route.
  const [manualOpen, setManualOpen] = useState<boolean | null>(item.defaultOpen ? true : null);
  // Reset the manual toggle when navigation moves in/out of a click-only
  // group, so it doesn't get stuck open/closed from a previous page —
  // done during render (comparing against the last-seen value), not in
  // a useEffect, since setState-in-an-effect triggers an extra render
  // pass for something resolvable in the same render. Skipped for
  // `defaultOpen` groups, which stay expanded regardless of route.
  const [prevHasActiveChild, setPrevHasActiveChild] = useState(hasActiveChild);
  if (!item.defaultOpen && hasActiveChild !== prevHasActiveChild) {
    setPrevHasActiveChild(hasActiveChild);
    setManualOpen(null);
  }
  const isOpen = manualOpen ?? (item.defaultOpen || hasActiveChild);

  const groupClassNames = [
    "nav-item-group",
    item.href === "#" ? "no-hover-submenu" : "",
    hasActiveChild ? "has-active-child" : "",
    isOpen ? "js-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    setManualOpen(!isOpen);
  }

  return (
    <div className={groupClassNames}>
      {item.href === "#" ? (
        <a href="#" className={`nav-link nav-link-parent${hasActiveChild ? " active" : ""}`} onClick={toggle}>
          <i className={`fas ${item.icon}`} />
          {item.label}
          <i className="fas fa-chevron-right nav-arrow" />
        </a>
      ) : (
        <Link href={item.href} className={`nav-link nav-link-parent${hasActiveChild ? " active" : ""}`}>
          <i className={`fas ${item.icon}`} />
          {item.label}
          <i className="fas fa-chevron-right nav-arrow" onClick={toggle} />
        </Link>
      )}
      <div className={`nav-submenu${isOpen ? " submenu-open" : ""}`}>
        {item.items.map((sub) =>
          // See app/api/auth/logout/route.ts for the full explanation:
          // logout is a state-changing action, so it must be a real POST
          // form submit, never a <Link>. Next.js prefetches <Link>
          // targets automatically whenever they're on screen — and this
          // sidebar is on screen on every admin page — which meant the
          // browser was silently logging the person out in the
          // background on page load.
          sub.href === "/api/auth/logout" ? (
            <form key={sub.href} method="POST" action={sub.href}>
              <button type="submit" className="nav-sublink" style={{ width: "100%", background: "none", border: "none", cursor: "pointer", font: "inherit", textAlign: "left" }}>
                <i className={`fas ${sub.icon}`} />
                {sub.label}
              </button>
            </form>
          ) : (
            <Link key={sub.href} href={sub.href} className={`nav-sublink${pathname?.startsWith(sub.href) ? " active" : ""}`}>
              <i className={`fas ${sub.icon}`} />
              {sub.label}
            </Link>
          )
        )}
      </div>
    </div>
  );
}
