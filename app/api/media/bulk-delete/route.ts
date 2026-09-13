import { NextResponse, type NextRequest } from "next/server";
import { requireUser, canManageAllPosts, resolvePermissions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteLocalFileByPath } from "@/lib/localStorage";

export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });

  const permissions = resolvePermissions(user);
  const canManageAll = canManageAllPosts(user.role, permissions, "edit") || permissions.media.manage_all;

  let body: { ids?: number[] };
  try {
    body = await request.json();
  } catch {
    const form = await request.formData();
    body = { ids: JSON.parse(String(form.get("ids") ?? "[]")) };
  }
  const ids = (body.ids ?? []).filter((id) => Number.isFinite(id));
  if (ids.length === 0) return NextResponse.json({ success: true, deleted: 0 });

  const rows = await prisma.media.findMany({
    where: { id: { in: ids }, ...(canManageAll ? {} : { uploadedBy: user.id }) },
    select: { id: true, filePath: true },
  });
  const deletableIds = rows.map((r) => r.id);

  await prisma.media.deleteMany({ where: { id: { in: deletableIds } } });
  // Best-effort disk cleanup — a DB row failing to have its file removed
  // isn't worth blocking the bulk-delete response over.
  await Promise.all(rows.map((r) => deleteLocalFileByPath(r.filePath).catch(() => {})));

  return NextResponse.json({ success: true, deleted: deletableIds.length });
}
