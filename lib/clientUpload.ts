/**
 * Client-side fast-upload helper — shared by every image-upload UI
 * (ImageUploadField, RichTextEditor's toolbar, MediaLibraryModal).
 * Uploads the file bytes DIRECTLY to R2 via a presigned URL instead of
 * routing them through this Next.js server first — see the comment on
 * getPresignedUpload() in lib/storage.ts for why this is meaningfully
 * faster, especially for larger images or slower connections.
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
  const presignRes = await fetch("/api/media/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, contentType: file.type, fileSize: file.size, purpose }),
  });
  const presignData = await presignRes.json();
  if (!presignData.success) {
    throw new Error(presignData.message ?? "Failed to prepare upload");
  }

  const putRes = await fetch(presignData.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error("Upload to storage failed. Please try again.");
  }

  const confirmRes = await fetch("/api/media/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filePath: presignData.filePath,
      publicUrl: presignData.publicUrl,
      purpose,
      fileName: file.name,
    }),
  });
  const confirmData = await confirmRes.json();
  if (!confirmData.success) {
    throw new Error(confirmData.message ?? "Failed to finalize upload");
  }

  return { url: confirmData.url, filePath: confirmData.filePath, mediaId: confirmData.mediaId };
}
