import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Design tokens (--font-body / --font-heading in globals.css) call for
// "Inter" — matches the original site's font-family stack in
// components/head_script.php.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "StoryTimes",
  description: "Read the latest stories.",
};

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
        <script dangerouslySetInnerHTML={{ __html: DARK_MODE_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
