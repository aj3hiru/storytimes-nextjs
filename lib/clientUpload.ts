/**
 * Client-side upload helper — shared by every image-upload UI
 * (ImageUploadField, RichTextEditor's toolbar, MediaLibraryModal).
 * Sends the file to this server (/api/media/upload), which saves it to
 * local disk and creates the `media` DB row in one request.
 *
 * (An earlier version of this project used Cloudflare R2 with presigned
 * URLs for direct browser-to-storage uploads. R2 support was removed
 * entirely by explicit choice — no subscription, not needed — so uploads
 * now always go through this server, which is simpler and has one less
 * moving part / one less paid service to depend on.)
 */
export interface UploadedImage {
  url: string;
  filePath: string;
  mediaId: number;
}

export async function uploadImageFast(
  file: File,
  purpose: "logo" | "favicon" | "author" | "post"
): Promise<UploadedImage> {
  const formData = new FormData();
  formData.set("file", file);
  formData.set("purpose", purpose);

  const res = await fetch("/api/media/upload", { method: "POST", body: formData });
  const data = await res.json();
  if (!data.success) {
    throw new Error(data.message ?? "Upload failed");
  }
  return { url: data.url, filePath: data.filePath, mediaId: data.mediaId };
}
