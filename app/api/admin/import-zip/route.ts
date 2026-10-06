import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser, resolvePermissions } from "@/lib/auth";
import { scanImportZip, commitImportZip, type ImportDecision } from "@/lib/postExportImport";

export const dynamic = "force-dynamic";
export const maxDuration = 3600;

/**
 * ZIP import. A route handler, not a server action: server actions cap the
 * request body (1 MB by default), which large export ZIPs exceed.
 *   mode=scan   → JSON { type, conflicts }
 *   mode=commit → NDJSON stream: {t:"start",total} {t:"item",...} {t:"done",result} | {t:"error",message}
 */
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user || (user.role !== "admin" && !resolvePermissions(user).tools.import_export)) {
    return NextResponse.json({ success: false, message: "You do not have permission to use Import & Export." }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ success: false, message: "Could not read the upload." }, { status: 400 });
  }
  const file = form.get("importFile");
  if (!(file instanceof File)) return NextResponse.json({ success: false, message: "No file uploaded." }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());

  if (form.get("mode") !== "commit") {
    try {
      return NextResponse.json({ success: true, scan: await scanImportZip(buffer) });
    } catch (err) {
      return NextResponse.json({ success: false, message: err instanceof Error ? err.message : "Failed to read ZIP file." }, { status: 400 });
    }
  }

  let decisions: Record<string, ImportDecision> = {};
  try {
    decisions = JSON.parse(String(form.get("decisions") ?? "{}"));
  } catch {}

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      let started = false;
      try {
        const result = await commitImportZip(buffer, decisions, user.id, (p) => {
          if (!started) {
            started = true;
            send({ t: "start", total: p.total });
          }
          send({ t: "item", ...p });
        });
        revalidatePath("/", "layout");
        send({ t: "done", result });
      } catch (err) {
        send({ t: "error", message: err instanceof Error ? err.message : "Import failed." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
