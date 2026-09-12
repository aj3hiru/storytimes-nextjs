import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { resolveSiteConfig, getAppConfig } from "@/lib/config";
import { resolveMediaUrl } from "@/lib/urls";

// Design tokens (--font-body / --font-heading in globals.css) call for
// "Inter" — matches the original site's font-family stack in
// components/head_script.php.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

/**
 * Real gap fixed here: this metadata object was previously fully
 * hardcoded ("StoryTimes" title, no favicon at all) — the admin's
 * General Settings → Logo & Favicon panel saved a value to
 * app_config.site_favicon, but nothing ever read it back out into the
 * actual <head>. generateMetadata() (Next.js's dynamic-metadata hook for
 * Server Components) now pulls the real site name/description and
 * favicon from the database, same data resolveSiteConfig() uses
 * everywhere else.
 */
export async function generateMetadata(): Promise<Metadata> {
  const [siteConfig, appConfig] = await Promise.all([resolveSiteConfig(""), getAppConfig()]);
  const favicon = appConfig.site_favicon?.trim();

  return {
    title: siteConfig.siteName,
    description: siteConfig.seoDefaultDescription || `Read the latest stories on ${siteConfig.siteName}.`,
    icons: favicon ? { icon: resolveMediaUrl(favicon) } : undefined,
  };
}

// Blocking inline script: applies the saved dark-mode preference to <html>
// BEFORE first paint, exactly like the original's components/head_script.php
// inline <script>. Must stay a raw <script>, not a useEffect — a client-only
// toggle would flash light mode on every dark-mode page load.
const DARK_MODE_INIT_SCRIPT = `
(function () {
  try {
    var saved = localStorage.getItem('theme');
    if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <head>
        {/* Real bug fixed here: 46 files across the admin panel (sidebar,
            cards, buttons, AdminBar, everywhere) use FontAwesome icon
            classes (`fas fa-*`, `fa-brands fa-*`) — but FontAwesome's
            actual CSS/font-face files were never linked anywhere. Those
            classes render as literally nothing without the stylesheet
            that defines them, which is exactly what "icons aren't
            showing" was — not a broken SVG or a CSS-hiding rule, just a
            missing <link> that should have been here from the start
            (the original PHP site links this same stylesheet in every
            page's <head> — see the reference view-source dumps for
            /assets/vendor/fontawesome/css/all.min.css). Using the public
            CDN build here since this project doesn't vendor the font
            files locally. */}
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" referrerPolicy="no-referrer" />
        <script dangerouslySetInnerHTML={{ __html: DARK_MODE_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
