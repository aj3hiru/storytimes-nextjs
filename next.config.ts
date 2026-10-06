import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // scripts/deploy.sh builds into a separate folder, then swaps it in.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  /**
   * Real build bug fixed here: `unzipper` (used in lib/backup/
   * restoreBackup.ts for reading a backup ZIP from local disk) has an
   * OPTIONAL S3-source code path that does `require("@aws-sdk/client-s3")`
   * — a real dependency of unzipper's own package.json, but one this
   * project never actually exercises (only unzipper.Open.file() for
   * local files is ever called, never the S3 variant). Turbopack's
   * static analysis still tries to resolve every reachable require()
   * call when bundling for the server, including that unused code path,
   * and fails the whole build with "Module not found" since that SDK
   * isn't installed. `serverExternalPackages` tells Next.js not to
   * bundle/statically-analyze this package at all — it's resolved via
   * Node's own `require()` at runtime instead, which only actually
   * needs to succeed for code paths genuinely executed. The correct,
   * documented fix for exactly this situation, rather than installing
   * ~25 additional AWS SDK packages this project has no real use for.
   */
  // `archiver` added for the same reason as `unzipper`: both are
  // stream-based CommonJS packages with optional/dynamic requires that
  // Turbopack's static analysis mishandles when bundling. Leaving
  // archiver bundled is also what turns its CJS export into a namespace
  // object rather than the callable factory it actually is — see
  // lib/postExportImport.ts. Resolved via Node's own require() instead.
  serverExternalPackages: ["unzipper", "archiver"],
  // inlineCss was tried: it put ~180 KB of CSS into every HTML page (twice — also
  // in the page data) and made pages slower overall, so the CSS stays in cached files.
  // Posts sitemap pages: /sitemap-posts-1.xml, /sitemap-posts-2.xml, …
  async headers() {
    // Self-hosted vendor files (Font Awesome) never change at the same path.
    return [
      { source: "/vendor/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      { source: "/sitemap-posts-:page(\\d+).xml", destination: "/sitemaps/posts/:page" },
      // Resized WebP of an upload: /img/640/1789…-ab12cd.webp (see optimizedImage in lib/urls.ts).
      { source: "/img/:w(\\d+)/:file*", destination: "/_next/image?url=/upload/media/:file*&w=:w&q=75" },
    ];
  },
  images: {
    // Uploads never change at the same path, so resized copies can be kept for a year.
    minimumCacheTTL: 31536000,
    localPatterns: [{ pathname: "/upload/media/**" }],
    deviceSizes: [640, 828, 1080, 1200],
    imageSizes: [128, 256, 384],
    qualities: [75],
    formats: ["image/webp"],
  },
};

export default nextConfig;
