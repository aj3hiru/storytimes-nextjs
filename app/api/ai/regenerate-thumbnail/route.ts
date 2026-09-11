import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getUserKeys } from "@/lib/ai/keys";
import { cloudflareCallWithFailover } from "@/lib/ai/cloudflare";
import { prisma } from "@/lib/db";
import { isStorageConfigured, uploadImage } from "@/lib/storage";

const activeRegenerations = new Set<number>();

/**
 * Generates (or re-generates) ONLY the featured thumbnail for a post —
 * for when "AI Generate" wrote the article fine but the thumbnail step
 * failed. Cloudflare-only, same as the original (Gemini is never used for
 * images on this site — see lib/ai/gemini.ts).
 */
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Not logged in" }, { status: 401 });
  }

  if (activeRegenerations.has(user.id)) {
    return NextResponse.json(
      { success: false, error: "A thumbnail regeneration is already in progress for your account." },
      { status: 429 }
    );
  }

  let body: { thumbnailPrompt?: string; title?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  let prompt = (body.thumbnailPrompt ?? "").trim();
  const title = (body.title ?? "").trim();
  if (!prompt) prompt = title;
  if (!prompt) {
    return NextResponse.json(
      { success: false, error: "Please enter a title or thumbnail prompt first, then try again." },
      { status: 400 }
    );
  }
  if (prompt.length > 2000) prompt = prompt.slice(0, 2000);

  if (!isStorageConfigured()) {
    return NextResponse.json(
      { success: false, error: "File storage isn't configured yet (R2 credentials missing) — see .env.example." },
      { status: 503 }
    );
  }

  const cfKeys = await getUserKeys(user.id, "cloudflare");
  if (cfKeys.length === 0) {
    return NextResponse.json(
      { success: false, error: "No active Cloudflare Workers AI key found on your account. Go to Admin → AI Features and add one, then try again." },
      { status: 400 }
    );
  }

  activeRegenerations.add(user.id);
  try {
    const cfResult = await cloudflareCallWithFailover(prompt, cfKeys, user.id);
    if (!cfResult.ok || !cfResult.imageBase64) {
      return NextResponse.json(
        {
          success: false,
          error: `Thumbnail generation failed (tried all ${cfKeys.length} Cloudflare key(s)): ${cfResult.error} — Cloudflare may be temporarily overloaded. Please wait a moment and try again.`,
        },
        { status: 502 }
      );
    }

    const buffer = Buffer.from(cfResult.imageBase64, "base64");
    const uploaded = await uploadImage(buffer, "image/webp", `ai-thumbnail-${Date.now()}.webp`, "uploads");

    const media = await prisma.media.create({
      data: {
        filePath: uploaded.filePath,
        fileType: "image",
        title: title || "AI thumbnail",
        uploadedBy: user.id,
        aiGenerated: true,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: user.id,
        actionType: "ai_regenerate_thumbnail",
        description: `Regenerated AI thumbnail for: ${title.slice(0, 80) || "(untitled)"}`,
      },
    });

    return NextResponse.json({ success: true, imageUrl: uploaded.publicUrl, mediaId: media.id });
  } finally {
    activeRegenerations.delete(user.id);
  }
}
