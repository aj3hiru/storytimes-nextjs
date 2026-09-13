import Link from "next/link";
import type { HeaderSettings, NavItem } from "@/lib/navigation";
import { MenuToggleButton } from "./NavDrawer";
import { DarkModeToggle } from "./DarkModeToggle";
import { HeaderSearchToggle, HeaderMobileSearchRow } from "./HeaderSearchBox";

export function HeaderClassic({
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
    <header className="hdr-classic">
      <div className="container" style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <Link href="/" title={`${siteName} Home`} aria-label={`Go to ${siteName} homepage`} className="brand-link">
          {displayMode === "logo" && logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- external/admin-managed logo path
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
        <nav aria-label="Main Menu">
          <ul>
            {navItems.map((item) => (
              <li key={item.url}>
                <a href={item.url}>{item.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="header-actions">
          {showSearchBtn && <HeaderSearchToggle />}
          {showDarkmode && <DarkModeToggle />}
          <MenuToggleButton />
        </div>
      </div>
      {showSearchBtn && <HeaderMobileSearchRow />}
    </header>
  );
}
