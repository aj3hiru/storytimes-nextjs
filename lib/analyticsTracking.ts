import type { NextRequest } from "next/server";

const SOURCE_MAP: [needle: string, source: string][] = [
  ["google.", "google"],
  ["facebook.", "facebook"],
  ["fb.", "facebook"],
  ["instagram.", "instagram"],
  ["twitter.", "twitter"],
  ["x.com", "twitter"],
  ["t.co", "twitter"],
  ["youtube.", "youtube"],
  ["youtu.be", "youtube"],
  ["whatsapp.", "whatsapp"],
  ["wa.me", "whatsapp"],
  ["telegram.", "telegram"],
  ["t.me", "telegram"],
  ["pinterest.", "pinterest"],
  ["linkedin.", "linkedin"],
  ["bing.", "bing"],
  ["yahoo.", "yahoo"],
  ["duckduckgo.", "other_search"],
  ["reddit.", "reddit"],
];

/** Ports classify_traffic_source() from api/0f9e8d7c6n.php exactly. */
export function classifyTrafficSource(referrer: string, ownHost: string): string {
  const ref = referrer.trim();
  if (!ref) return "direct";

  let host: string;
  try {
    host = new URL(ref).host.toLowerCase();
  } catch {
    return "direct";
  }
  if (!host || host === ownHost.toLowerCase()) return "direct";

  host = host.replace(/^www\./, "");
  for (const [needle, source] of SOURCE_MAP) {
    if (host.includes(needle)) return source;
  }
  return "other";
}

/**
 * Reads the visitor's country from whichever CDN geo header is present —
 * Vercel's `x-vercel-ip-country` (same header middleware.ts already uses
 * for country-redirect) or Cloudflare's `CF-IPCountry` if this ends up
 * deployed behind Cloudflare instead. "XX" when neither is present,
 * matching the original's unknown-country fallback.
 */
export function getVisitorCountry(request: NextRequest): string {
  const raw = request.headers.get("x-vercel-ip-country") ?? request.headers.get("cf-ipcountry") ?? "XX";
  const upper = raw.toUpperCase();
  return /^[A-Z]{2}$/.test(upper) ? upper : "XX";
}
