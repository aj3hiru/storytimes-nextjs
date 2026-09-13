import { NextResponse, type NextRequest } from "next/server";
import { requireUser, canManageAllPosts, resolvePermissions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { deleteLocalFileByPath } from "@/lib/localStorage";

async function canAccessMedia(userId: number, canManageAll: boolean, mediaId: number) {
  const media = await prisma.media.findUnique({ where: { id: mediaId } });
  if (!media) return { media: null, allowed: false };
  return { media, allowed: canManageAll || media.uploadedBy === userId };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const mediaId = parseInt(id, 10);
  if (!Number.isFinite(mediaId)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const permissions = resolvePermissions(user);
  const canManageAll = canManageAllPosts(user.role, permissions, "edit") || permissions.media.manage_all;
  const { media, allowed } = await canAccessMedia(user.id, canManageAll, mediaId);
  if (!media || !allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({
    id: media.id,
    title: media.title ?? "",
    alt_text: media.altText ?? "",
    caption: media.caption ?? "",
    description: media.description ?? "",
    file_path: media.filePath,
  });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const mediaId = parseInt(id, 10);
  if (!Number.isFinite(mediaId)) return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });

  const permissions = resolvePermissions(user);
  const canManageAll = canManageAllPosts(user.role, permissions, "edit") || permissions.media.manage_all;
  const { media, allowed } = await canAccessMedia(user.id, canManageAll, mediaId);
  if (!media || !allowed) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim();
  const altText = String(form.get("alt_text") ?? "").trim();
  const caption = String(form.get("caption") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();

  await prisma.media.update({
    where: { id: mediaId },
    data: {
      title: title || null,
      altText: altText || null,
      caption: caption || null,
      description: description || null,
    },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const mediaId = parseInt(id, 10);
  if (!Number.isFinite(mediaId)) return NextResponse.json({ success: false, error: "Invalid id" }, { status: 400 });

  const permissions = resolvePermissions(user);
  const canManageAll = canManageAllPosts(user.role, permissions, "edit") || permissions.media.manage_all;
  const { media, allowed } = await canAccessMedia(user.id, canManageAll, mediaId);
  if (!media || !allowed) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  await prisma.media.delete({ where: { id: mediaId } });
  // Real gap fixed here: this used to only delete the DB row, leaving
  // the actual file behind on disk forever — a slow resource leak on
  // every single-file delete (bulk-delete already cleans up the file
  // correctly). Best-effort: a DB row succeeding but the disk cleanup
  // failing isn't worth failing the whole delete over.
  await deleteLocalFileByPath(media.filePath).catch(() => {});
  return NextResponse.json({ success: true });
}
