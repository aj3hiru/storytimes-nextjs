import { NextResponse, type NextRequest } from "next/server";
import { requireUser, canManageAllPosts, resolvePermissions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { resolveLocalPath } from "@/lib/localStorage";
import * as archiverNs from "archiver";
// The installed @types/archiver version's declaration doesn't expose a
// default-exported factory function (only class exports) — cast to the
// callable factory shape here; the actual `archiver` package IS callable
// this way at runtime (`archiver('zip', options)`), this is purely a
// type-declaration mismatch between the library and its @types package.
type ArchiverFactory = (format: "zip", options: { zlib: { level: number } }) => import("archiver").Archiver;
const createArchive = archiverNs as unknown as ArchiverFactory;
import { PassThrough } from "node:stream";

/**
 * Streams selected files as a single .zip — matches the reference's
 * "Download Selected" bulk action. Unlike the original PHP (which
 * writes a temp zip to disk and hands back a one-time download token),
 * this streams the archive directly in the response body — no temp file
 * to create or clean up, and no second request/token round-trip needed.
 */
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 });

  const permissions = resolvePermissions(user);
  const canManageAll = canManageAllPosts(user.role, permissions, "edit") || permissions.media.manage_all;

  let body: { ids?: number[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const ids = (body.ids ?? []).filter((id) => Number.isFinite(id));
  if (ids.length === 0) return NextResponse.json({ success: false, error: "No files selected" }, { status: 400 });

  const rows = await prisma.media.findMany({
    where: { id: { in: ids }, ...(canManageAll ? {} : { uploadedBy: user.id }) },
    select: { filePath: true },
  });
  if (rows.length === 0) return NextResponse.json({ success: false, error: "No accessible files found" }, { status: 404 });

  const archive = createArchive("zip", { zlib: { level: 6 } });
  const passthrough = new PassThrough();
  archive.pipe(passthrough);

  const usedNames = new Set<string>();
  for (const row of rows) {
    const absPath = resolveLocalPath(row.filePath);
    if (!absPath) continue;
    let name = row.filePath.split("/").pop() ?? `file-${Date.now()}`;
    // Avoid silently overwriting entries in the zip if two selected
    // files happen to share a filename.
    if (usedNames.has(name)) {
      const dot = name.lastIndexOf(".");
      name = dot > 0 ? `${name.slice(0, dot)}-${row.filePath}${name.slice(dot)}` : `${name}-${row.filePath}`;
    }
    usedNames.add(name);
    archive.file(absPath, { name });
  }
  archive.finalize();

  // @ts-expect-error — Node's Readable stream is a valid BodyInit at
  // runtime in the Next.js/Node runtime this route runs on, even though
  // the DOM lib's ReadableStream type used by NextResponse's TS
  // signature doesn't formally include it.
  return new NextResponse(passthrough, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="files-${Date.now()}.zip"`,
    },
  });
}
