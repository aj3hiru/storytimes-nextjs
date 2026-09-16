import type { NextRequest } from "next/server";
import { createHash } from "crypto";

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
  // Cloudflare first, since that's what actually fronts this deployment —
  // the previous order checked Vercel's header first, which is harmless
  // but misleading about where this really runs. Several other headers
  // are accepted too so a proxy change doesn't silently reduce every
  // visit to "unknown" again.
  //
  // IMPORTANT operational note: Cloudflare only sends CF-IPCountry when
  // **IP Geolocation is enabled** for the zone (Cloudflare dashboard →
  // Network → IP Geolocation). If every row is recording "XX", that
  // setting being off is by far the most likely cause — the code here
  // cannot invent a country the request never carried. The Cloudflare
  // Detector panel on /admin/country-redirection shows exactly which of
  // these headers the live request actually arrived with.
  const candidates = [
    "cf-ipcountry",
    "x-vercel-ip-country",
    "x-geo-country",
    "x-country-code",
    "cloudfront-viewer-country",
  ];
  for (const name of candidates) {
    const raw = request.headers.get(name);
    if (!raw) continue;
    const upper = raw.trim().toUpperCase();
    // Cloudflare uses "XX" for unknown and "T1" for Tor; neither is a
    // real country, so both fall through to the unknown bucket rather
    // than being charted as if they were places.
    if (upper === "XX" || upper === "T1") continue;
    if (/^[A-Z]{2}$/.test(upper)) return upper;
  }
  return "XX";
}

/**
 * Every domain here runs behind Cloudflare with the proxy on, so
 * `CF-Connecting-IP` always carries the visitor's real IP even though
 * the app itself only ever sees Cloudflare's edge IP on the raw
 * connection — falls back to the standard `x-forwarded-for` header for
 * any request that somehow reaches this without going through
 * Cloudflare (e.g. local development).
 */
function getRealVisitorIp(request: NextRequest): string {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return "0.0.0.0";
}

/**
 * A stable, cookie-less fallback visitor identifier — used only when the
 * regular `cms_visitor_id` cookie is missing (private/incognito
 * browsing, cookies blocked or cleared, or a visitor's very first
 * request before the cookie-set response reaches them). Without this,
 * every such request looked like a brand-new random visitor (the old
 * code did `randomBytes(16)` unconditionally whenever the cookie was
 * absent), meaningfully inflating "Unique Visitors" on the Analytics
 * page for any visitor who doesn't keep cookies.
 *
 * Hashes real IP (via Cloudflare's CF-Connecting-IP — every domain here
 * runs behind Cloudflare with the proxy on) + User-Agent + the current
 * date, so:
 * - The SAME cookie-less visitor, revisiting the SAME day, gets the SAME
 *   ID and is correctly counted as one unique visitor, not several.
 * - The date component makes it naturally roll over daily (matching how
 *   unique-visitor counting is inherently a per-day concept here), and
 *   means the raw IP is never stored anywhere — only this one-way,
 *   day-salted hash is.
 * This is deliberately a fallback, not a replacement for the cookie:
 * the cookie stays the primary identity (stable across days, works
 * correctly for the vast majority of real browsers), this only kicks in
 * when that cookie genuinely isn't available.
 */
export function getStableVisitorId(request: NextRequest): string {
  const ip = getRealVisitorIp(request);
  const ua = request.headers.get("user-agent") ?? "unknown";
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${ip}|${ua}|${day}`).digest("hex").slice(0, 32);
}
