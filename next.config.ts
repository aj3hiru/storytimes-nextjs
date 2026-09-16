import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

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
};

export default nextConfig;
