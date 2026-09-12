import "server-only";
import { saveLocalImage, deleteLocalImage } from "./localStorage";

/**
 * Local-disk-only image storage. R2/S3 support was removed entirely per
 * an explicit decision not to use Cloudflare R2 for this deployment —
 * this project no longer has any Cloudflare/AWS SDK dependency at all.
 * All uploads (featured images, logo, favicon, author photos) are saved
 * to local disk (see lib/localStorage.ts) and served through
 * /api/media/file.
 *
 * This is the right choice for THIS deployment target — a traditional
 * always-on server (PM2/systemd on a VPS) where local disk persists
 * normally. It is NOT appropriate on serverless hosts (Vercel etc.),
 * where local disk does not persist across deployments/instances — if
 * this project is ever moved to a serverless host, re-introduce an
 * object-storage backend (R2, S3, or similar) at that point.
 */

export interface UploadResult {
  filePath: string; // relative path stored in media.file_path
  publicUrl: string;
}

export async function uploadImage(
  file: Buffer,
  contentType: string,
  originalName: string,
  prefix = "uploads"
): Promise<UploadResult> {
  return saveLocalImage(file, contentType, originalName, prefix);
}

export async function deleteImage(filePath: string): Promise<void> {
  return deleteLocalImage(filePath);
}
