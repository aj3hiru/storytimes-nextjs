import { getHeaderSettings, getNavItems } from "@/lib/navigation";
import { resolveSiteConfig } from "@/lib/config";
import { NavDrawerProvider, NavDrawerPanel } from "./NavDrawer";
import { HeaderModern } from "./HeaderModern";
import { HeaderClassic } from "./HeaderClassic";

export async function HeaderSwitcher() {
  const [settings, navItems, siteConfig] = await Promise.all([
    getHeaderSettings(),
    getNavItems(),
    resolveSiteConfig(""),
  ]);

  const navSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${siteConfig.siteUrl}#site-navigation`,
    name: "Main Navigation Menu",
    itemListElement: navItems.map((item, i) => ({
      "@type": "SiteNavigationElement",
      position: i + 1,
      name: item.label,
      url: item.url.startsWith("http")
        ? item.url
        : `${siteConfig.siteUrl.replace(/\/+$/, "")}/${item.url.replace(/^\/+/, "")}`,
    })),
  };

  return (
    <NavDrawerProvider>
      {settings.headerDesign === "classic" ? (
        <HeaderClassic
          settings={settings}
          navItems={navItems}
          siteName={siteConfig.siteName}
          siteTagline={siteConfig.siteTagline}
        />
      ) : (
        <HeaderModern
          settings={settings}
          navItems={navItems}
          siteName={siteConfig.siteName}
          siteTagline={siteConfig.siteTagline}
        />
      )}
      <NavDrawerPanel navItems={navItems} />
      {/* Site Navigation Schema — built dynamically from the same nav items
          rendered above, so it never drifts out of sync (matches header.php). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(navSchema) }}
      />
    </NavDrawerProvider>
  );
}
