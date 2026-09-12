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
 *
 * Also fixes another instance of the same "localhost leaks into
 * production" class of bug documented elsewhere in this project:
 * without an explicit `metadataBase`, Next.js falls back to
 * "http://localhost:3000" (or whatever port it's running on) to resolve
 * any relative URL used in OpenGraph/Twitter metadata — meaning social
 * link previews (Facebook, WhatsApp, etc.) would point at localhost
 * instead of the real domain. `siteConfig.siteUrl` already resolves
 * correctly (DB value if set, currentDomain fallback otherwise — see
 * lib/config.ts), so passing it here fixes this for every page at once.
 */
export async function generateMetadata(): Promise<Metadata> {
  // Real PERFORMANCE regression fixed here, found in a real production
  // build: this used to call `headers()` (from "next/headers") to
  // detect the current domain as a fallback. `headers()` is a Dynamic
  // API — calling it ANYWHERE forces the entire route to render
  // per-request instead of statically, and because this runs in the
  // ROOT layout (shared by every single page), it silently flipped
  // EVERY previously-static/ISR page in the whole app — homepage, post
  // pages, category pages, everything — to fully dynamic. Confirmed in
  // an actual build's route table (every route showed `ƒ` instead of
  // `○`/`●`). `process.env.APP_URL` is NOT a Dynamic API — it's a plain
  // env var available at build time — so using it as the fallback here
  // gets the same crash-safety without sacrificing static generation.
  // (The 22 other resolveSiteConfig("") call sites elsewhere in this
  // codebase were never affected by this specific issue — passing a
  // plain empty-string literal isn't a Dynamic API call, only wrapping
  // headers() around it here was the problem.)
  const currentDomain = process.env.APP_URL?.trim() || "http://localhost:3000";
  const [siteConfig, appConfig] = await Promise.all([resolveSiteConfig(currentDomain), getAppConfig()]);
  const favicon = appConfig.site_favicon?.trim();

  // Critical defensive fix: site_url is a free-text admin field — any
  // stored value that isn't a well-formed absolute URL (missing
  // "https://", stray whitespace, a typo, leftover value from earlier
  // testing, etc.) makes `new URL(...)` throw a hard, synchronous
  // TypeError. Because this runs in the ROOT layout's generateMetadata,
  // that throw takes down EVERY single page in the app — public site
  // AND admin panel, including the admin-login page itself, with no way
  // to reach any page to fix the setting that caused it. try/catch with
  // a guaranteed-valid fallback ensures a bad value in this one field
  // can never fully break the site again.
  let metadataBase: URL;
  try {
    metadataBase = new URL(siteConfig.siteUrl || currentDomain);
  } catch {
    metadataBase = new URL(currentDomain);
  }

  return {
    metadataBase,
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
