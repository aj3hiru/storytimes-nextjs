import { NextResponse } from "next/server";
import { getAdInserterConfig } from "@/lib/adInserterSettings";
import { prisma } from "@/lib/db";

/**
 * Real gap fixed here: Ad Inserter's "Ads.txt" tab (content + an
 * enabled toggle) had nothing actually serving `/ads.txt` to real
 * crawlers/ad networks — the setting existed but had no effect at all.
 * Stored content lives in the same `ad_inserter` app_config row's
 * sibling key for simplicity (one extra key, not a whole new table for
 * a single text blob), served here as the standard plain-text file ad
 * networks expect at this exact well-known path.
 */
export async function GET() {
  const config = await getAdInserterConfig();
  if (!config.adsTxtEnabled) {
    return new NextResponse("", { status: 404 });
  }
  const row = await prisma.appConfig.findUnique({ where: { configKey: "ads_txt_content" } });
  const content = row?.configValue ?? "";
  return new NextResponse(content, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
