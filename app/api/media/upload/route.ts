import { NextResponse, type NextRequest } from "next/server";
import { revalidateTag } from "next/cache";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isStorageConfigured, uploadImage } from "@/lib/storage";

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

  const formData = await request.formData();
  const file = formData.get("file");
  // "logo" | "favicon" | "author" | "post" — controls the storage prefix
  // and, for logo/favicon, which settings key gets updated automatically.
  const purpose = String(formData.get("purpose") ?? "post");
  const altText = String(formData.get("altText") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, message: "No file uploaded" }, { status: 400 });
  }

  const prefixByPurpose: Record<string, string> = {
    logo: "uploads",
    favicon: "uploads",
    author: "uploads/authors",
    post: "uploads",
  };

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadImage(buffer, file.type, file.name, prefixByPurpose[purpose] ?? "uploads");

    const media = await prisma.media.create({
      data: {
        filePath: result.filePath,
        fileType: "image",
        altText: altText || null,
        title: file.name,
        uploadedBy: user.id,
      },
    });

    // Logo/favicon uploads also update the setting that points at them,
    // so the admin doesn't need a second step to "apply" the upload.
    if (purpose === "logo") {
      await prisma.siteSetting.upsert({
        where: { settingKey: "site_logo" },
        create: { settingKey: "site_logo", settingValue: `/${result.filePath}` },
        update: { settingValue: `/${result.filePath}` },
      });
      revalidateTag("site-settings", "max");
      revalidateTag("header-settings", "max");
      revalidateTag("footer-settings", "max"); // footer falls back to the site logo too
    } else if (purpose === "favicon") {
      await prisma.appConfig.upsert({
        where: { configKey: "site_favicon" },
        create: { configKey: "site_favicon", configValue: `/${result.filePath}` },
        update: { configValue: `/${result.filePath}` },
      });
      revalidateTag("app-config", "max");
    }

    return NextResponse.json({
      success: true,
      mediaId: media.id,
      filePath: result.filePath,
      url: result.publicUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
