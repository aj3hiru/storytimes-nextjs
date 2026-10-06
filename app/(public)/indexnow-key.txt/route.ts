import { indexNowKey } from "@/lib/indexNow";

export const dynamic = "force-dynamic";

export async function GET() {
  return new Response(await indexNowKey(), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
