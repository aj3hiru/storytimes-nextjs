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

  const where = {
    fileType: "image",
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
