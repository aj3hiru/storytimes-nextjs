import { requireUser, canManageAllPosts, resolvePermissions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveMediaUrl } from "@/lib/urls";
import { FileManagerClient, type MediaItem } from "@/components/admin/FileManagerClient";

/**
 * Rebuilt to match the actual newbase.fast2tricks.com reference exactly
 * (verified against its screenshots and view-source) — an earlier pass
 * here was a bare grid with pagination-by-link and a single delete
 * button; no upload, no search/type/uploader filtering, no bulk
 * select/delete/download, and no click-to-view detail (title/caption/
 * alt text/description) at all.
 */
export default async function FileManagerPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; uploader?: string; fm_page?: string; fm_per_page?: string }>;
}) {
  const user = await requireUser();
  if (!user) return null;

  const permissions = resolvePermissions(user);
  const canManageAll = canManageAllPosts(user.role, permissions, "edit") || permissions.media.manage_all;

  const { q, type, uploader, fm_page, fm_per_page } = await searchParams;
  const page = Math.max(1, parseInt(fm_page ?? "1", 10) || 1);
  const perPage = [20, 50, 100].includes(Number(fm_per_page)) ? Number(fm_per_page) : 20;
  const activeType = type && type !== "all" ? type : "all";
  const search = (q ?? "").trim();
  const uploaderFilter = uploader && uploader !== "all" ? parseInt(uploader, 10) : null;

  const baseWhere = canManageAll ? {} : { uploadedBy: user.id };
  const where = {
    ...baseWhere,
    ...(activeType !== "all" ? { fileType: activeType } : {}),
    ...(uploaderFilter ? { uploadedBy: uploaderFilter } : {}),
    ...(search ? { filePath: { contains: search } } : {}),
  };

  const [total, media, allCount, imageCount, bannerCount, uploaders] = await Promise.all([
    prisma.media.count({ where }),
    prisma.media.findMany({
      where,
      orderBy: { uploadedAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.media.count({ where: baseWhere }),
    prisma.media.count({ where: { ...baseWhere, fileType: "image" } }),
    prisma.media.count({ where: { ...baseWhere, fileType: "banner" } }),
    canManageAll
      ? prisma.user.findMany({ orderBy: { username: "asc" }, select: { id: true, username: true } })
      : Promise.resolve([]),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  const items: MediaItem[] = media.map((m) => ({
    id: m.id,
    filePath: m.filePath,
    fileType: m.fileType,
    url: resolveMediaUrl(m.filePath),
    fileName: m.filePath.split("/").pop() ?? "",
  }));

  return (
    <FileManagerClient
      items={items}
      stats={{ total: allCount, images: imageCount, banners: bannerCount }}
      uploaders={uploaders}
      currentType={activeType}
      currentUploader={uploader ?? "all"}
      currentSearch={search}
      currentPerPage={perPage}
      page={page}
      totalPages={totalPages}
      totalFiltered={total}
      typeCounts={{ all: allCount, image: imageCount, banner: bannerCount }}
    />
  );
}
