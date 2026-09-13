import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { saveLocalFile } from "@/lib/localStorage";

/**
 * File Manager's general-purpose upload endpoint — separate from
 * /api/media/upload (image-only, used by the post editor's featured-
 * image flow). Matches the reference's actual accepted types (Images,
 * PDFs, Videos, Audio, Docs, ZIPs, max 50MB) rather than being
 * restricted to images only.
 */
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, error: "No file uploaded" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await saveLocalFile(buffer, file.name, "uploads");

    const media = await prisma.media.create({
      data: {
        filePath: result.filePath,
        fileType: result.fileType,
        title: file.name,
        uploadedBy: user.id,
      },
    });

    return NextResponse.json({ success: true, id: media.id, path: result.filePath, file_type: result.fileType });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
