"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Permissions } from "@/lib/auth";
import { clearHomepageCacheAction } from "@/lib/adminBarActions";

interface MeResponse {
  loggedIn: boolean;
  username?: string;
  role?: string;
  permissions?: Permissions;
}

/**
 * Floating top toolbar shown to logged-in staff on EVERY page (both the
 * public site and inside /admin itself) — ported from the #site-admin-bar
 * block in components shared across every admin/public PHP template.
 * Previously just a TODO comment in HeaderSwitcher.tsx ("render
 * <AdminBar /> here when a staff session is active") — never actually
 * built until this pass.
 *
 * Self-fetches its own session state from /api/auth/me on mount instead
 * of receiving it as a prop from a server-rendered layout — see the
 * comment in app/(public)/layout.tsx for why: the public pages are
 * ISR-cached for millisecond loads, and baking a per-visitor auth check
 * into that cached HTML would either leak one visitor's admin bar into
 * everyone else's cached copy of the page, or require disabling caching
 * entirely. This renders nothing until it confirms a staff session,
 * so anonymous visitors never see a flash of loading state.
 */
export function AdminBar() {
  const [me, setMe] = useState<MeResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data: MeResponse) => {
        if (!cancelled) setMe(data);
      })
      .catch(() => {
        if (!cancelled) setMe({ loggedIn: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!me?.loggedIn || !me.username || !me.role || !me.permissions) return null;

  return <AdminBarContent username={me.username} role={me.role} permissions={me.permissions} />;
}

export function AdminBarContent({
  username,
  role,
  permissions,
}: {
  username: string;
  role: string;
  permissions: Permissions;
}) {
  const [cacheState, setCacheState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const pathname = usePathname();
  const inAdminArea = pathname?.startsWith("/admin") ?? false;
  const canManagePosts = permissions.blogs.edit_all || permissions.blogs.edit_own || permissions.blogs.create;
  const isAdmin = role === "admin";
  const canViewAnalytics = permissions.analytics.view_basic || permissions.analytics.view_advanced;
  const initial = username.charAt(0).toUpperCase();

  async function handleClearCache() {
    setCacheState("loading");
    try {
      await clearHomepageCacheAction();
      setCacheState("success");
    } catch {
      setCacheState("error");
    } finally {
      setTimeout(() => setCacheState("idle"), 2000);
    }
  }

  return (
    <div id="site-admin-bar" role="navigation" aria-label="Admin Bar" data-role={role}>
      <div className="ab-inner">
        <div className="ab-left">
          {/* Real UX gap fixed here: this link always said "Homepage",
              even while already viewing the admin panel — clicking it
              from inside /admin just took you to the public site, with
              no equally-quick way back. Context-aware now: shows
              "Dashboard" (→ /admin/dashboard) when browsing the public
              site, and "Homepage" (→ /) when already inside /admin. */}
          {inAdminArea ? (
            <Link href="/" className="ab-logo" title="Go to Homepage">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              <span>Homepage</span>
            </Link>
          ) : (
            <Link href="/admin/dashboard" className="ab-logo" title="Go to Dashboard">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="9" rx="1" />
                <rect x="14" y="3" width="7" height="5" rx="1" />
                <rect x="14" y="12" width="7" height="9" rx="1" />
                <rect x="3" y="16" width="7" height="5" rx="1" />
              </svg>
              <span>Dashboard</span>
            </Link>
          )}

          {canManagePosts && (
            <div className="ab-item ab-has-sub">
              <Link href="/admin/blogs-manager">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                Posts
                <svg className="ab-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </Link>
              <div className="ab-sub">
                <Link href="/admin/blogs-manager">All Posts</Link>
                <Link href="/admin/post-manager/new">Add New</Link>
                <Link href="/admin/categories-manager">Categories</Link>
                <Link href="/admin/comments-manager">Comments</Link>
              </div>
            </div>
          )}

          {isAdmin && (
            <div className="ab-item ab-has-sub">
              <Link href="/admin/general-settings">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
                </svg>
                Settings
                <svg className="ab-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </Link>
              <div className="ab-sub">
                <Link href="/admin/general-settings">General</Link>
                <Link href="/admin/performance-settings">Performance</Link>
                <Link href="/admin/header-customizer">Header</Link>
                <Link href="/admin/ad-inserter">Ads</Link>
                <Link href="/admin/cache-manager">Cache</Link>
                <Link href="/admin/cron-manager">Cron Jobs</Link>
              </div>
            </div>
          )}

          {canViewAnalytics && (
            <Link className="ab-item" href="/admin/analytics">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
              Analytics
            </Link>
          )}
        </div>

        <div className="ab-right">
          {isAdmin && (
            <button
              type="button"
              className={`ab-item ab-clear-cache${cacheState === "loading" ? " is-loading" : ""}${cacheState === "success" ? " is-success" : ""}${cacheState === "error" ? " is-error" : ""}`}
              onClick={handleClearCache}
              disabled={cacheState === "loading"}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
              </svg>
              <span className="ab-cache-label">
                {cacheState === "loading" ? "Clearing…" : cacheState === "success" ? "Cleared!" : cacheState === "error" ? "Failed" : "Clear Cache"}
              </span>
            </button>
          )}

          <Link className="ab-item ab-view-site" href="/" target="_blank" rel="noopener noreferrer">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            View Site
          </Link>

          <div className="ab-item ab-has-sub ab-user">
            <Link href="/admin/my-profile">
              <span className="ab-avatar">{initial}</span>
              <span className="ab-username">{username}</span>
              <span className={`ab-role-badge ${role}`}>{role}</span>
              <svg className="ab-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </Link>
            <div className="ab-sub ab-sub-right">
              <div className="ab-sub-header">
                <strong>{username}</strong>
                <span style={{ textTransform: "capitalize" }}>{role}</span>
              </div>
              <Link href="/admin/dashboard">Dashboard</Link>
              <Link href="/admin/my-profile">Edit Profile</Link>
              <div className="ab-sub-divider" />
              <Link href="/api/auth/logout" className="ab-logout">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Log Out
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
