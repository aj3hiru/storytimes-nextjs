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
  /** The parent link's own href — hover-type groups (Posts, Analytics,
   *  Tools) point at their first child page, matching the original
   *  exactly; click-only groups (Templates & Pages, Site Settings) use "#". */
  href: string;
  /** true = "Posts"/"Analytics"/"Tools" (opens on hover, always visually
   *  expanded); false = "Templates & Pages"/"Site Settings" (click-only,
   *  collapsed until toggled) — ports the no-hover-submenu distinction. */
  hoverExpand: boolean;
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
          hoverExpand: true,
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
                hoverExpand: true,
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
        ...(isAdmin ? [{ label: "Code Snippets", href: "/admin/code-snippets", icon: "fa-code" } as NavLink] : []),
        ...(isAdmin ? [{ label: "Ad Inserter", href: "/admin/ad-inserter", icon: "fa-ad" } as NavLink] : []),
        ...(isAdmin
          ? [{ label: "Country Redirection", href: "/admin/country-redirection", icon: "fa-globe" } as NavLink]
          : []),
        {
          label: "Tools",
          icon: "fa-toolbox",
          href: "/admin/import-export",
          hoverExpand: true,
          items: [
            { label: "Import & Export", href: "/admin/import-export", icon: "fa-exchange-alt" },
            { label: "Backup & Restore", href: "/admin/backup-restore", icon: "fa-database" },
          ],
        },
        ...(can(permissions?.settings.maintenance_mode)
          ? [{ label: "Cache Manager", href: "/admin/cache-manager", icon: "fa-bolt" } as NavLink]
          : []),
        ...(can(permissions?.users.create)
          ? [{ label: "Users Manager", href: "/admin/user-manager", icon: "fa-user" } as NavLink]
          : []),
      ],
    },
    {
      label: "Content",
      items: [
        {
          label: "Templates & Pages",
          icon: "fa-sitemap",
          href: "#",
          hoverExpand: false,
          items: [
            { label: "Post Template", href: "/admin/post-template", icon: "fa-file-alt" },
            { label: "Sidebar Settings", href: "/admin/sidebar-settings", icon: "fa-layout-sidebar-right" },
            ...(can(permissions?.pages.create || permissions?.pages.edit)
              ? [{ label: "Pages", href: "/admin/pages-list", icon: "fa-file" }]
              : []),
          ],
        },
        {
          label: "Site Settings",
          icon: "fa-cogs",
          href: "#",
          hoverExpand: false,
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
            ...(isAdmin ? [{ label: "Header", href: "/admin/header-customizer", icon: "fa-window-maximize" }] : []),
            ...(isAdmin ? [{ label: "Footer", href: "/admin/footer-customizer", icon: "fa-shoe-prints" }] : []),
            ...(isAdmin ? [{ label: "Homepage", href: "/admin/homepage-settings", icon: "fa-house" }] : []),
            ...(isAdmin ? [{ label: "General Settings", href: "/admin/general-settings", icon: "fa-sliders-h" }] : []),
            ...(isAdmin
              ? [{ label: "Performance", href: "/admin/performance-settings", icon: "fa-tachometer-alt" }]
              : []),
            ...(isAdmin ? [{ label: "Cron Manager", href: "/admin/cron-manager", icon: "fa-clock" }] : []),
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
          {groups.map((group, gi) => (
            <div className="nav-section" key={gi}>
              {group.label && <div className="nav-title">{group.label}</div>}
              {group.items.map((item) =>
                isSubmenu(item) ? (
                  <SubmenuNav key={item.label} item={item} pathname={pathname} />
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
  // Hover-type groups (Posts/Analytics/Tools) render already-expanded by
  // default in the original (both `js-open` on the group and
  // `submenu-open` on the inner container are present unconditionally in
  // the source HTML) — CSS :hover only matters for re-opening after a
  // click-away on touch devices without hover. Click-only groups start
  // collapsed and are toggled purely by JS state.
  const [clickOpen, setClickOpen] = useState(hasActiveChild);
  const isOpen = item.hoverExpand || clickOpen;

  const groupClassNames = [
    "nav-item-group",
    item.hoverExpand ? "js-open" : "no-hover-submenu",
    hasActiveChild ? "has-active-child" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={groupClassNames}>
      {item.hoverExpand ? (
        <Link href={item.href} className={`nav-link nav-link-parent${hasActiveChild ? " active" : ""}`}>
          <i className={`fas ${item.icon}`} />
          {item.label}
          <i className="fas fa-chevron-right nav-arrow" />
        </Link>
      ) : (
        <a
          href="#"
          className={`nav-link nav-link-parent${hasActiveChild ? " active" : ""}`}
          onClick={(e) => {
            e.preventDefault();
            setClickOpen((v) => !v);
          }}
        >
          <i className={`fas ${item.icon}`} />
          {item.label}
          <i className="fas fa-chevron-right nav-arrow" />
        </a>
      )}
      <div className={`nav-submenu${isOpen ? " submenu-open" : ""}`}>
        {item.items.map((sub) => (
          <Link key={sub.href} href={sub.href} className={`nav-sublink${pathname?.startsWith(sub.href) ? " active" : ""}`}>
            <i className={`fas ${sub.icon}`} />
            {sub.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
