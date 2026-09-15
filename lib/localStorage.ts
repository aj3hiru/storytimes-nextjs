import "server-only";
import { promises as fs } from "fs";
import path from "path";

/**
 * Local-disk storage — this project's ONLY image storage backend.
 * Cloudflare R2 support was fully removed by explicit choice (no R2
 * subscription, no willingness to pay for/activate it) — there is no
 * fallback logic here, this is simply how uploads work.
 *
 * IMPORTANT — where this is (and isn't) appropriate:
 * This writes to local disk, which only persists correctly on a
 * traditional always-on server (PM2/systemd on a VPS, Docker with a
 * mounted volume, etc.) — exactly this project's actual deployment
 * target. It does NOT persist across deployments/instances on serverless
 * hosts (Vercel, most "serverless Next.js" platforms) — if this project
 * is ever moved to a serverless host, an object-storage backend (R2, S3,
 * or similar) would need to be reintroduced at that point.
 *
 * Files are stored OUTSIDE `public/` (in `<project-root>/uploads/`) and
 * always served through /api/media/file rather than relying on Next's
 * static-file serving for `public/`. Storing outside the build output
 * and serving through an explicit route sidesteps a real issue hit in
 * production: files added to `public/uploads/` at runtime (i.e. AFTER
 * `next build` already ran) were not reliably served as static assets in
 * this deployment's reverse-proxy/process-manager configuration, and
 * returned 404 even though the upload itself succeeded.
 */

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]);
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB — same limit as the R2 path

export interface LocalUploadResult {
  filePath: string; // e.g. "uploads/1234-abcd.webp" — stored in media.file_path, same convention as the R2 path
  publicUrl: string; // e.g. "/upload/media/1234-abcd.webp" — see lib/urls.ts's resolveMediaUrl() for why this shape
}

// Kept in sync with lib/urls.ts's resolveMediaUrl() — that's the
// canonical URL-building logic for ANY already-stored path (used
// everywhere images are displayed across the site: featured images,
// site logo, author photos, etc.), this is the equivalent used right
// at upload time to build the URL returned in the same response that
// just saved the file. Real gap fixed here: this used to build the
// old `/api/media/file?path=...` form directly, meaning a freshly
// uploaded file's URL (returned immediately to the admin UI) looked
// different from an already-saved file's URL (built later via
// resolveMediaUrl()) until the next full page load — same underlying
// file, two different-looking URLs for the same short window.
function buildPublicUrl(filePath: string): string {
  const relative = filePath.replace(/^\/+/, "");
  if (relative.startsWith("uploads/")) {
    return `/upload/media/${relative.slice("uploads/".length)}`;
  }
  return `/${relative}`;
}

export async function saveLocalImage(
  file: Buffer,
  contentType: string,
  originalName: string,
  prefix = "uploads"
): Promise<LocalUploadResult> {
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error("Invalid file type. Allowed: JPG, PNG, WebP, GIF, SVG.");
  }
  if (file.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error("File too large (max 5MB).");
  }

  const ext = originalName.split(".").pop()?.toLowerCase() || "bin";
  const key = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const absPath = path.join(UPLOAD_ROOT, key.replace(/^uploads\//, ""));

  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, file);

  return { filePath: key, publicUrl: buildPublicUrl(key) };
}

export async function deleteLocalImage(filePath: string): Promise<void> {
  const relative = filePath.replace(/^uploads\//, "");
  const absPath = path.join(UPLOAD_ROOT, relative);
  // Path-traversal guard — never delete outside UPLOAD_ROOT, matching the
  // same rule the serving route enforces (see app/api/media/file/route.ts).
  if (!absPath.startsWith(UPLOAD_ROOT)) {
    throw new Error("Invalid file path.");
  }
  await fs.unlink(absPath).catch(() => {
    // Already gone / never existed — deleting a DB row whose file was
    // manually removed shouldn't be a hard error.
  });
}

/** Reads a locally-stored file for /api/media/file to serve. Enforces the
 *  same allow-`uploads/`-prefix-only + no-`..`-traversal rules described
 *  in the incident report. Returns null for anything invalid or missing. */
export async function readLocalImage(requestedPath: string): Promise<{ data: Buffer; contentType: string } | null> {
  if (!requestedPath.startsWith("uploads/") || requestedPath.includes("..")) {
    return null;
  }
  const relative = requestedPath.replace(/^uploads\//, "");
  const absPath = path.join(UPLOAD_ROOT, relative);
  if (!absPath.startsWith(UPLOAD_ROOT)) {
    return null;
  }
  try {
    const data = await fs.readFile(absPath);
    const ext = path.extname(absPath).toLowerCase();
    const contentType =
      { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml" }[
        ext
      ] ?? "application/octet-stream";
    return { data, contentType };
  } catch {
    return null;
  }
}

/**
 * General-purpose file storage for the File Manager (Images, PDFs,
 * Videos, Audio, Docs, ZIPs — matching the reference's actual accepted
 * types) — separate from saveLocalImage() above, which is intentionally
 * image-only (used by the post editor's featured-image/thumbnail flows)
 * with a smaller 5MB cap. This one has a 50MB cap and accepts any of the
 * reference's listed extensions.
 */
const MAX_GENERAL_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB, matches the reference's stated limit

const ALLOWED_GENERAL_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "webp", "gif", "svg",
  "pdf",
  "mp4", "webm", "ogg", "mov", "avi", "mkv",
  "mp3", "wav", "aac", "flac", "m4a",
  "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv",
  "zip", "rar", "tar", "gz", "7z",
]);

/** Categorizes a file the same way the reference's file-manager does —
 *  drives which icon/tab a file shows under. */
export function classifyFileType(ext: string): "image" | "pdf" | "video" | "audio" | "document" | "archive" | "other" {
  const e = ext.toLowerCase();
  if (["jpg", "jpeg", "png", "webp", "gif", "svg"].includes(e)) return "image";
  if (e === "pdf") return "pdf";
  if (["mp4", "webm", "ogg", "mov", "avi", "mkv"].includes(e)) return "video";
  if (["mp3", "wav", "aac", "flac", "m4a"].includes(e)) return "audio";
  if (["doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"].includes(e)) return "document";
  if (["zip", "rar", "tar", "gz", "7z"].includes(e)) return "archive";
  return "other";
}

export async function saveLocalFile(
  file: Buffer,
  originalName: string,
  prefix = "uploads"
): Promise<LocalUploadResult & { fileType: string }> {
  const ext = originalName.split(".").pop()?.toLowerCase() || "bin";
  if (!ALLOWED_GENERAL_EXTENSIONS.has(ext)) {
    throw new Error(`File type ".${ext}" isn't allowed.`);
  }
  if (file.byteLength > MAX_GENERAL_UPLOAD_BYTES) {
    throw new Error("File too large (max 50MB).");
  }

  const key = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const absPath = path.join(UPLOAD_ROOT, key.replace(/^uploads\//, ""));

  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, file);

  return { filePath: key, publicUrl: buildPublicUrl(key), fileType: classifyFileType(ext) };
}

const GENERAL_CONTENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".zip": "application/zip",
  ".txt": "text/plain",
  ".csv": "text/csv",
};

/** Reads ANY locally-stored file (not just images) for /api/media/file
 *  to serve — same allow-`uploads/`-prefix-only + no-`..`-traversal rules
 *  as readLocalImage(), generalized to the File Manager's full file-type
 *  set instead of just images. */
export async function readLocalFile(requestedPath: string): Promise<{ data: Buffer; contentType: string } | null> {
  if (!requestedPath.startsWith("uploads/") || requestedPath.includes("..")) {
    return null;
  }
  const relative = requestedPath.replace(/^uploads\//, "");
  const absPath = path.join(UPLOAD_ROOT, relative);
  if (!absPath.startsWith(UPLOAD_ROOT)) {
    return null;
  }
  try {
    const data = await fs.readFile(absPath);
    const ext = path.extname(absPath).toLowerCase();
    const imageTypes: Record<string, string> = {
      ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
      ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
    };
    const contentType = imageTypes[ext] ?? GENERAL_CONTENT_TYPES[ext] ?? "application/octet-stream";
    return { data, contentType };
  } catch {
    return null;
  }
}

/** Absolute path resolution for a stored file — used by the bulk-download
 *  zip endpoint, which needs to stream file contents into an archive
 *  rather than return them as a single HTTP response. */
export function resolveLocalPath(requestedPath: string): string | null {
  if (!requestedPath.startsWith("uploads/") || requestedPath.includes("..")) return null;
  const relative = requestedPath.replace(/^uploads\//, "");
  const absPath = path.join(UPLOAD_ROOT, relative);
  if (!absPath.startsWith(UPLOAD_ROOT)) return null;
  return absPath;
}

/** Generic file delete (any type, not just images) — used by bulk
 *  delete/single delete in the File Manager. */
export async function deleteLocalFileByPath(filePath: string): Promise<void> {
  const relative = filePath.replace(/^uploads\//, "");
  const absPath = path.join(UPLOAD_ROOT, relative);
  if (!absPath.startsWith(UPLOAD_ROOT)) {
    throw new Error("Invalid file path.");
  }
  await fs.unlink(absPath).catch(() => {});
}

/** Writes a buffer pulled straight out of an import ZIP (see
 *  lib/postExportImport.ts) to local disk with no content-type/size
 *  validation — the original PHP importer doesn't re-validate bundled
 *  media either, it trusts the export archive. Returns the same
 *  "uploads/..." relative-path convention as saveLocalImage(). */
export async function saveImportedFile(data: Buffer, filename: string): Promise<string> {
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const relative = `imported/${safeName}`;
  const key = `uploads/${relative}`; // same "uploads/..." convention as saveLocalImage()/saveLocalFile()
  const absPath = path.join(UPLOAD_ROOT, relative);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, data);
  return key;
}
