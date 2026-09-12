import "server-only";
import { prisma } from "./db";
import { uploadImage } from "./storage";

/**
 * Shared by both /api/ai/regenerate-thumbnail (generates a NEW image via
 * Cloudflare, then saves it) and /api/ai/save-generated-thumbnail (saves
 * an image ALREADY generated inline by /api/ai/generate's "quick
 * thumbnail" step, avoiding a second, wasteful Cloudflare call for the
 * same image).
 */
export async function saveAiThumbnail(
  imageBase64: string,
  title: string,
  userId: number
): Promise<{ imageUrl: string; mediaId: number }> {
  const buffer = Buffer.from(imageBase64, "base64");
  const uploaded = await uploadImage(buffer, "image/webp", `ai-thumbnail-${Date.now()}.webp`, "uploads");

  const media = await prisma.media.create({
    data: {
      filePath: uploaded.filePath,
      fileType: "image",
      title: title || "AI thumbnail",
      uploadedBy: userId,
      aiGenerated: true,
    },
  });

  return { imageUrl: uploaded.publicUrl, mediaId: media.id };
}
