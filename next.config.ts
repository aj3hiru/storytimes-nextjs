import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  /**
   * Real UX/professionalism gap fixed here: every uploaded image URL
   * looked like a raw API call — `/api/media/file?path=uploads%2F...` —
   * exposing internal implementation detail (a query-string-driven
   * dynamic route) instead of a clean, direct-looking path. This rewrite
   * makes `/upload/media/<path>` the PUBLIC-FACING URL for every
   * uploaded file, while transparently routing that request to the
   * exact same underlying `/api/media/file` handler that already reads
   * it from disk correctly — a pure URL-presentation change, not a
   * change to how or where files are actually stored/served. This is
   * deliberately a rewrite (not a redirect): the browser's address bar
   * and every <img src> attribute show the clean URL directly, with no
   * visible round-trip through the old `?path=` form at all.
   */
  async rewrites() {
    return [
      {
        source: "/upload/media/:path*",
        destination: "/api/media/file?path=uploads/:path*",
      },
    ];
  },
};

export default nextConfig;
