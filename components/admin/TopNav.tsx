"use client";

import Link from "next/link";
import { useState } from "react";
import type { UserRole } from "@prisma/client";

export function TopNav({
  username,
  role,
  siteName,
  onMenuToggle,
}: {
  username: string;
  role: UserRole;
  siteName: string;
  onMenuToggle: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="top-nav">
      <div className="nav-left">
        <button className="menu-toggle" onClick={onMenuToggle} aria-label="Open menu" type="button">
          <i className="fas fa-bars" />
        </button>
        <span className="sitename-mob">{siteName}</span>
        <div className="page-heading">
          <h1>Admin Panel</h1>
        </div>
      </div>
      <div className="nav-right">
        <Link href="/" className="icon-btn" title="View site" target="_blank">
          <i className="fas fa-external-link-alt" />
        </Link>
        <div style={{ position: "relative" }}>
          <button
            className="icon-btn"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Account menu"
            type="button"
          >
            <i className="fas fa-user-circle" />
          </button>
          {menuOpen && (
            <div className="account-dropdown">
              <div className="account-dropdown-user">
                <strong>{username}</strong>
                <span className="badge badge-admin">{role}</span>
              </div>
              <Link href="/admin/my-profile">My Profile</Link>
              <form action="/api/auth/logout" method="POST">
                <button type="submit">Logout</button>
              </form>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
