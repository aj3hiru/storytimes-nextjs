import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * Step 2 of the fast-upload flow: the browser calls this ONLY after its
 * direct PUT to R2 (using the URL from /api/media/presign) already
 * succeeded — this just records the resulting file as a `media` row and,
 * for logo/favicon, updates the setting that points at it. No file bytes
 * pass through this server at all.
 */
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 });
  }

  let body: { filePath?: string; publicUrl?: string; purpose?: string; altText?: string; fileName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const filePath = body.filePath?.trim();
  const purpose = body.purpose ?? "post";
  if (!filePath) {
    return NextResponse.json({ success: false, message: "Missing filePath" }, { status: 400 });
  }

  const media = await prisma.media.create({
    data: {
      filePath,
      fileType: "image",
      altText: body.altText || null,
      title: body.fileName ?? null,
      uploadedBy: user.id,
    },
  });

  if (purpose === "logo") {
    await prisma.siteSetting.upsert({
      where: { settingKey: "site_logo" },
      create: { settingKey: "site_logo", settingValue: `/${filePath}` },
      update: { settingValue: `/${filePath}` },
    });
    const { revalidateTag } = await import("next/cache");
    revalidateTag("site-settings", "max");
    revalidateTag("header-settings", "max");
    revalidateTag("footer-settings", "max");
  } else if (purpose === "favicon") {
    await prisma.appConfig.upsert({
      where: { configKey: "site_favicon" },
      create: { configKey: "site_favicon", configValue: `/${filePath}` },
      update: { configValue: `/${filePath}` },
    });
    const { revalidateTag } = await import("next/cache");
    revalidateTag("app-config", "max");
  }

  return NextResponse.json({ success: true, mediaId: media.id, filePath, url: body.publicUrl ?? `/${filePath}` });
}
