import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { saveAiThumbnail } from "@/lib/aiThumbnail";

/**
 * Saves the inline "quick thumbnail" base64 image that /api/ai/generate
 * already produced (in parallel with the Gemini text call) as a real
 * uploaded media row — separate from /api/ai/regenerate-thumbnail, which
 * generates a NEW image via Cloudflare. Using this instead of
 * regenerate-thumbnail right after AI Generate avoids a second, wasteful
 * Cloudflare call for an image that's already been produced.
 */
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Not logged in" }, { status: 401 });
  }

  let body: { imageBase64?: string; title?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.imageBase64) {
    return NextResponse.json({ success: false, error: "Missing image data" }, { status: 400 });
  }

  try {
    const { imageUrl, mediaId } = await saveAiThumbnail(body.imageBase64, body.title ?? "", user.id);
    return NextResponse.json({ success: true, imageUrl, mediaId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save thumbnail";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
