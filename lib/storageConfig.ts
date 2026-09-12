/**
 * Client-safe storage check. Kept as a tiny standalone module (rather
 * than folding this into lib/storage.ts) because client components need
 * to import it — lib/storage.ts uses Node's `fs` module (via
 * lib/localStorage.ts) and is marked `import "server-only"`, so any
 * client component importing from there directly fails the build.
 *
 * Uploads always work now — everything is saved to local disk (R2/S3
 * support was removed entirely, by explicit choice) — so this always
 * returns true. Kept as a function (not inlined at every call site) so
 * call sites read clearly and so a future storage-backend change has one
 * place to update.
 */
export function isStorageConfigured(): boolean {
  return true;
}
