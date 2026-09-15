import { NextResponse, type NextRequest } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Readable } from "stream";
import { requireUser } from "@/lib/auth";
import { verifyCsrfToken } from "@/lib/csrf";
import { getBackupStats, deleteBackup, resolveBackupPath } from "@/lib/backup/manageBackups";
import { scanRestoreZip } from "@/lib/backup/restoreBackup";
import { startBackupJob, startRestoreJob, getJob } from "@/lib/backup/backupJobs";

const TMP_DIR = path.join(process.cwd(), "backups", ".tmp");

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

async function requireAdmin() {
  const user = await requireUser();
  if (!user || user.role !== "admin") {
    return null;
  }
  return user;
}

export async function GET(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ success: false, message: "Admin access required." }, { status: 403 });

  const action = request.nextUrl.searchParams.get("action");

  if (action === "download") {
    const file = request.nextUrl.searchParams.get("file") ?? "";
    try {
      const fullPath = resolveBackupPath(file);
      const stat = fs.statSync(fullPath);
      const stream = Readable.toWeb(fs.createReadStream(fullPath)) as ReadableStream;
      return new NextResponse(stream, {
        headers: {
          "Content-Type": "application/zip",
          "Content-Disposition": `attachment; filename="${path.basename(fullPath)}"`,
          "Content-Length": String(stat.size),
        },
      });
    } catch (err) {
      return NextResponse.json({ success: false, message: err instanceof Error ? err.message : "Not found." }, { status: 404 });
    }
  }

  if (action === "progress") {
    const jobId = request.nextUrl.searchParams.get("jobId") ?? "";
    const job = getJob(jobId);
    if (!job) return NextResponse.json({ success: false, message: "Unknown job." }, { status: 404 });
    return NextResponse.json({ success: true, ...job });
  }

  // default: stats
  try {
    const stats = await getBackupStats();
    return NextResponse.json({ success: true, ...stats });
  } catch (err) {
    return NextResponse.json({ success: false, message: err instanceof Error ? err.message : "Failed to load stats." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await requireAdmin();
  if (!user) return NextResponse.json({ success: false, message: "Admin access required." }, { status: 403 });

  const form = await request.formData();
  const action = String(form.get("action") ?? "");
  const csrfToken = form.get("csrf_token");

  if (!(await verifyCsrfToken(typeof csrfToken === "string" ? csrfToken : null))) {
    return NextResponse.json({ success: false, message: "Invalid CSRF token — please refresh the page and try again." }, { status: 403 });
  }

  try {
    if (action === "create") {
      const label = String(form.get("label") ?? "manual");
      const includeMedia = form.get("include_media") === "1";
      // Started as a background job and returns immediately — a
      // full-site backup with lots of media can take a while, and
      // waiting for one HTTP request to finish that whole time risks
      // hitting a reverse-proxy timeout on a large site. The client
      // polls ?action=progress&jobId=... instead.
      const jobId = startBackupJob({ label, includeMedia, createdBy: user.username, userId: user.id });
      return NextResponse.json({ success: true, jobId });
    }

    if (action === "delete") {
      const file = String(form.get("file") ?? "");
      deleteBackup(file);
      return NextResponse.json({ success: true });
    }

    if (action === "scan" || action === "restore") {
      const file = form.get("restore_file");
      if (!file || !(file instanceof File)) {
        return NextResponse.json({ success: false, message: "No file uploaded." }, { status: 400 });
      }
      if (!file.name.toLowerCase().endsWith(".zip")) {
        return NextResponse.json({ success: false, message: "Please choose a .zip backup file." }, { status: 400 });
      }

      // Stream the upload straight to disk instead of buffering it in
      // memory (a full-site backup with media can be very large) — Web
      // File objects expose .stream(), piped via a Node Readable.
      ensureTmpDir();
      const tmpName = `${crypto.randomBytes(16).toString("hex")}.zip`;
      const tmpPath = path.join(TMP_DIR, tmpName);
      await new Promise<void>((resolve, reject) => {
        const nodeStream = Readable.fromWeb(file.stream() as import("stream/web").ReadableStream);
        const out = fs.createWriteStream(tmpPath);
        nodeStream.pipe(out).on("finish", () => resolve()).on("error", reject);
      });

      if (action === "scan") {
        try {
          const manifest = await scanRestoreZip(tmpPath);
          return NextResponse.json({ success: true, manifest });
        } catch (err) {
          // A bad/invalid file is reported immediately, right after the
          // upload finishes — this is deliberately NOT a generic 500;
          // scanRestoreZip() already produces a specific, friendly
          // message for every failure mode (not a zip, no manifest,
          // wrong manifest type, no database files inside).
          return NextResponse.json({ success: false, message: err instanceof Error ? err.message : "This doesn't look like a valid backup file." }, { status: 400 });
        } finally {
          fs.unlink(tmpPath, () => {});
        }
      }

      // action === "restore" — validate up front (before starting the
      // background job) so an obviously-wrong file is rejected
      // immediately instead of only failing after "restoring" starts.
      try {
        await scanRestoreZip(tmpPath);
      } catch (err) {
        fs.unlink(tmpPath, () => {});
        return NextResponse.json({ success: false, message: err instanceof Error ? err.message : "This doesn't look like a valid backup file." }, { status: 400 });
      }

      const confirmText = String(form.get("confirm_text") ?? "");
      const jobId = startRestoreJob(tmpPath, confirmText, () => fs.unlink(tmpPath, () => {}));
      return NextResponse.json({ success: true, jobId });
    }

    return NextResponse.json({ success: false, message: "Unknown action." }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ success: false, message: err instanceof Error ? err.message : "Operation failed." }, { status: 500 });
  }
}
