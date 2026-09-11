import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { isStorageConfigured, getPresignedUpload } from "@/lib/storage";

/**
 * Step 1 of the fast-upload flow: issue a short-lived signed URL the
 * browser can PUT the file bytes to directly on R2 (see the comment on
 * getPresignedUpload() in lib/storage.ts for why this is faster than
 * routing the bytes through this server). Step 2 is /api/media/confirm,
 * called by the browser after the direct PUT succeeds.
 */
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 });
  }

  if (!isStorageConfigured()) {
    return NextResponse.json(
      {
        success: false,
        message:
          "File storage isn't configured yet. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and R2_PUBLIC_URL (see .env.example).",
      },
      { status: 503 }
    );
  }

  let body: { fileName?: string; contentType?: string; fileSize?: number; purpose?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const fileName = body.fileName ?? "upload.bin";
  const contentType = body.contentType ?? "application/octet-stream";
  const fileSize = body.fileSize ?? 0;
  const purpose = body.purpose ?? "post";

  const prefixByPurpose: Record<string, string> = {
    logo: "uploads",
    favicon: "uploads",
    author: "uploads/authors",
    post: "uploads",
  };

  try {
    const presigned = await getPresignedUpload(contentType, fileName, fileSize, prefixByPurpose[purpose] ?? "uploads");
    return NextResponse.json({ success: true, ...presigned });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to prepare upload";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
