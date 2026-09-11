"use client";

import { useState } from "react";
import type { UserRole } from "@prisma/client";
import type { Permissions } from "@/lib/auth";
import { SidebarNav } from "./SidebarNav";
import { TopNav } from "./TopNav";

export function AdminShell({
  username,
  role,
  permissions,
  siteName,
  children,
}: {
  username: string;
  role: UserRole;
  permissions: Permissions;
  siteName: string;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="admin-container">
      <SidebarNav role={role} permissions={permissions} isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main-content">
        <TopNav username={username} role={role} siteName={siteName} onMenuToggle={() => setSidebarOpen((v) => !v)} />
        <div className="content-wrapper">{children}</div>
      </div>
    </div>
  );
}
