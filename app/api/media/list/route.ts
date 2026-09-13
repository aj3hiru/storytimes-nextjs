import { NextResponse, type NextRequest } from "next/server";
import { requireUser, canManageAllPosts, resolvePermissions } from "@/lib/auth";
import { prisma } from "@/lib/db";

const PER_PAGE = 24;

export async function GET(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const permissions = resolvePermissions(user);
  const canManageAll = canManageAllPosts(user.role, permissions, "edit") || permissions.media.manage_all;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const q = (searchParams.get("q") ?? "").trim();

  // Real bug fixed here: the actual reference includes BOTH 'image' AND
  // 'banner' types (`file_type IN ('image','banner')`) — this only
  // matched 'image', so every AI-generated thumbnail (tagged 'banner'
  // to distinguish it from manual uploads — see lib/aiThumbnail.ts)
  // never appeared in this picker at all, even though it showed up
  // correctly in the File Manager, which lists every type.
  const where = {
    fileType: { in: ["image", "banner"] },
    ...(canManageAll ? {} : { uploadedBy: user.id }),
    ...(q ? { title: { contains: q } } : {}),
  };

  const [total, images] = await Promise.all([
    prisma.media.count({ where }),
    prisma.media.findMany({
      where,
      orderBy: { uploadedAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: { id: true, filePath: true },
    }),
  ]);

  return NextResponse.json({
    images: images.map((m) => ({ id: m.id, file_path: m.filePath })),
    pages: Math.max(1, Math.ceil(total / PER_PAGE)),
  });
}
