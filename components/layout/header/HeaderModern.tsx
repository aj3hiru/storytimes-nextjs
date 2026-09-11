import Link from "next/link";
import type { HeaderSettings, NavItem } from "@/lib/navigation";
import { MenuToggleButton } from "./NavDrawer";
import { DarkModeToggle } from "./DarkModeToggle";
import { HeaderSearchBox } from "./HeaderSearchBox";
import { NavScrollRow } from "./NavScrollRow";

export function HeaderModern({
  settings,
  navItems,
  siteName,
  siteTagline,
}: {
  settings: HeaderSettings;
  navItems: NavItem[];
  siteName: string;
  siteTagline: string;
}) {
  const { logoUrl, logoWidth, logoHeight, displayMode, showSearchBtn, showDarkmode, showTagline, siteTitle } =
    settings;

  return (
    <header className="hdr-modern">
      {/* ═══ Top Bar: goback/menu (left) · logo (center) · search/darkmode (right) ═══ */}
      <div className="header-topbar">
        <div className="container">
          <div className="topbar-left">
            <Link className="goback-link" href="/" title={`${siteName} Home`} aria-label={`Go to ${siteName} homepage`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>{siteName}</span>
            </Link>
            <MenuToggleButton />
          </div>

          <Link href="/" title={`${siteName} Home`} aria-label={`Go to ${siteName} homepage`} className="brand-link">
            {displayMode === "logo" && logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- external/admin-managed logo path, not a static import
              <img
                src={logoUrl}
                width={logoWidth}
                height={logoHeight}
                alt={siteName}
                style={{ display: "block", width: logoWidth, height: logoHeight, objectFit: "contain" }}
              />
            ) : (
              <span className="brand-text-fallback">{siteTitle}</span>
            )}
            {showTagline && siteTagline ? <span className="brand-tagline">{siteTagline}</span> : null}
          </Link>

          <div className="header-actions topbar-right">
            {showSearchBtn && <HeaderSearchBox />}
            {showDarkmode && <DarkModeToggle />}
          </div>
        </div>
      </div>

      {/* ═══ Main Bar: home icon + horizontal scrollable category nav ═══ */}
      <div className="header-mainbar">
        <div className="container">
          <Link href="/" aria-label="Go to home page" title="Home" className="home-icon-link">
            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"
              />
            </svg>
          </Link>

          <NavScrollRow navItems={navItems} />
        </div>
      </div>
    </header>
  );
}
