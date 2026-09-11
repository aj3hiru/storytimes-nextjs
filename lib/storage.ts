import "server-only";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2 is S3-API-compatible, so the AWS SDK works against it
 * directly by pointing `endpoint` at the account's R2 endpoint. Chosen
 * over local disk / other object storage because this project already
 * needs a Cloudflare account for the Workers AI thumbnail generation
 * (lib/ai/cloudflare.ts) — one provider, one bill, no local disk
 * dependency that breaks on serverless redeploys.
 */

export interface StorageConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
}

export function isStorageConfigured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME &&
      process.env.R2_PUBLIC_URL
  );
}

function getConfig(): StorageConfig {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.R2_BUCKET_NAME;
  const publicUrl = process.env.R2_PUBLIC_URL;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName || !publicUrl) {
    throw new Error(
      "Cloudflare R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_PUBLIC_URL."
    );
  }
  return { accountId, accessKeyId, secretAccessKey, bucketName, publicUrl };
}

function getClient(config: StorageConfig): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
}

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]);
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB

export interface UploadResult {
  filePath: string; // relative path stored in media.file_path (matches the original's convention)
  publicUrl: string;
}

/**
 * Uploads a file to R2 under `prefix/` (e.g. "uploads", "uploads/authors")
 * and returns the path to store in the `media` table. Validates type/size
 * the same way the original's upload_profile_image()/upload_favicon
 * handlers did.
 */
export async function uploadImage(
  file: Buffer,
  contentType: string,
  originalName: string,
  prefix = "uploads"
): Promise<UploadResult> {
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error("Invalid file type. Allowed: JPG, PNG, WebP, GIF, SVG.");
  }
  if (file.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error("File too large (max 5MB).");
  }

  const config = getConfig();
  const client = getClient(config);

  const ext = originalName.split(".").pop()?.toLowerCase() || "bin";
  const key = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  await client.send(
    new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: file,
      ContentType: contentType,
    })
  );

  return {
    filePath: key,
    publicUrl: `${config.publicUrl.replace(/\/+$/, "")}/${key}`,
  };
}

/** Deletes an object from R2 given the relative key stored in media.file_path. */
export async function deleteImage(filePath: string): Promise<void> {
  const config = getConfig();
  const client = getClient(config);
  await client.send(new DeleteObjectCommand({ Bucket: config.bucketName, Key: filePath }));
}

export interface PresignedUpload {
  uploadUrl: string; // PUT the raw file bytes here directly from the browser
  filePath: string;
  publicUrl: string;
}

/**
 * SPEED: the previous upload path was browser -> this Next.js server
 * (buffers the whole file in memory) -> R2 — a full extra network hop
 * (and a memory copy) for every single image, which is the main thing
 * that makes uploads feel slow, especially on a slower connection or for
 * a multi-MB photo. A presigned URL lets the browser PUT the file BYTES
 * straight to R2, skipping this server entirely for the actual transfer;
 * this server only ever handles the small, fast step of issuing the
 * signed URL and — after the browser confirms the direct upload
 * succeeded — creating the `media` DB row. Validates type/size up front,
 * same rules as uploadImage(), before ever contacting R2.
 */
export async function getPresignedUpload(
  contentType: string,
  originalName: string,
  fileSizeBytes: number,
  prefix = "uploads"
): Promise<PresignedUpload> {
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    throw new Error("Invalid file type. Allowed: JPG, PNG, WebP, GIF, SVG.");
  }
  if (fileSizeBytes > MAX_UPLOAD_BYTES) {
    throw new Error("File too large (max 5MB).");
  }

  const config = getConfig();
  const client = getClient(config);

  const ext = originalName.split(".").pop()?.toLowerCase() || "bin";
  const key = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({ Bucket: config.bucketName, Key: key, ContentType: contentType }),
    { expiresIn: 300 } // 5 minutes is plenty to start a direct upload
  );

  return {
    uploadUrl,
    filePath: key,
    publicUrl: `${config.publicUrl.replace(/\/+$/, "")}/${key}`,
  };
}
