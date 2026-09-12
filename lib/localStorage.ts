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
  publicUrl: string; // e.g. "/api/media/file?path=uploads%2F1234-abcd.webp"
}

function buildPublicUrl(filePath: string): string {
  return `/api/media/file?path=${encodeURIComponent(filePath)}`;
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
