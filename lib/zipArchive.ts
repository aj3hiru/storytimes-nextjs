import * as archiverNs from "archiver";
import type { Archiver } from "archiver";

/**
 * A new ZIP archive (streamed). The cause of "s is not a function" on Export and of the failing Backup:
 * archiver 8 is an ES module whose API changed — there is no `archiver("zip", …)` factory any more, the
 * package exports classes (`new ZipArchive(options)`). Calling the old factory threw at runtime (minified to
 * "s is not a function"). This works with archiver 8 and, should an older version ever be installed, with
 * the old callable factory too.
 */
export function createZipArchive(level = 6): Archiver {
  const ns = archiverNs as unknown as {
    ZipArchive?: new (o: { zlib: { level: number } }) => Archiver;
    default?: unknown;
  };
  if (typeof ns.ZipArchive === "function") return new ns.ZipArchive({ zlib: { level } });
  const factory = (typeof ns.default === "function" ? ns.default : archiverNs) as unknown as (f: "zip", o: { zlib: { level: number } }) => Archiver;
  return factory("zip", { zlib: { level } });
}
