"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import type { UserRole } from "@prisma/client";
import type { Permissions } from "@/lib/auth";
import { SidebarNav } from "./SidebarNav";
import { TopNav } from "./TopNav";

export function AdminShell({
  role,
  permissions,
  siteName,
  children,
}: {
  role: UserRole;
  permissions: Permissions;
  siteName: string;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();
  const [lastPathname, setLastPathname] = useState(pathname);

  // Real bug fixed here — reported on mobile/tablet: opening the sidebar
  // drawer and then tapping a menu item navigated to the new page, but
  // the drawer itself stayed open on top of it, instead of closing the
  // way a normal mobile nav drawer does. Root cause: AdminShell lives in
  // `app/admin/(dashboard)/layout.tsx`, a LAYOUT shared across every
  // admin page — Next.js keeps a shared layout's component instance
  // mounted across client-side navigations between pages under it,
  // rather than remounting it per page. So `sidebarOpen`'s state simply
  // carried over unchanged after navigating; nothing was actually wrong
  // with the click or the navigation itself, just nothing ever told the
  // drawer the route had changed. `SidebarNav`'s own links never called
  // `onClose` either — only the overlay-click and the explicit close
  // button did, so navigating via an actual menu item was the one path
  // that never closed it.
  //
  // Implemented as React's own recommended "adjust state while
  // rendering" pattern (react.dev/learn/you-might-not-need-an-effect)
  // rather than a useEffect — calling setState in an effect here would
  // close the drawer only on the render AFTER the page has already
  // shown as still-open, causing a visible flash; adjusting inline
  // during render lets React restart the render with the corrected
  // state before anything is painted, and the `set-state-in-effect`
  // lint rule specifically points at doing it this way for resets keyed
  // off a changed value like `pathname`.
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setSidebarOpen(false);
  }

  return (
    <div className="admin-container">
      <SidebarNav role={role} permissions={permissions} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-content">
        <TopNav siteName={siteName} onMenuToggle={() => setSidebarOpen((v) => !v)} />
        <div className="content-wrapper">{children}</div>
      </div>
    </div>
  );
}
