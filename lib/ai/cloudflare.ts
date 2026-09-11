import type { AiApiKey } from "@prisma/client";
import { recordKeyResult } from "./keys";

export const CLOUDFLARE_IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

export interface CloudflareImageResult {
  ok: boolean;
  imageBase64?: string;
  error?: string;
  overloaded?: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Ports cloudflare_image_post_fields(): forces bright, well-lit, 16:9
 *  composition (a common FLUX failure mode is dark/moody output), and
 *  generates at 1024x576 — an exact 16:9, clean 2x2-tile multiple of 512
 *  so cost stays predictable regardless of the final display size. */
function buildStyledPrompt(prompt: string): { prompt: string; width: number; height: number; num_steps: number } {
  const styled =
    `${prompt}. Bright natural daylight lighting, vibrant true-to-life colors, ` +
    "well-lit scene, no dark or moody tones, no low-key lighting, " +
    "wide 16:9 cinematic composition, high detail, photorealistic.";
  return { prompt: styled, width: 1024, height: 576, num_steps: 4 };
}

function isOverloadedMessage(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("capacity") ||
    lower.includes("overloaded") ||
    lower.includes("try again")
  );
}

/** Single call against one (account_id, api_key) pair, WITH its own retry
 *  loop — ports cloudflare_generate_thumbnail() + the JSON/binary response
 *  parsing in cloudflare_parse_image_response(). Same simplification as
 *  before: the original resizes the raw 1024x576 generation down to the
 *  caller's target size (1200x675 by default) via GD; this returns the
 *  native 1024x576 image as-is rather than pulling in a local
 *  image-resize dependency — flagged rather than silently done. */
async function cloudflareGenerateThumbnail(
  prompt: string,
  accountId: string,
  apiKey: string,
  maxRetries = 2
): Promise<CloudflareImageResult> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CLOUDFLARE_IMAGE_MODEL}`;
  const postBody = buildStyledPrompt(prompt);

  let lastError = "Unknown error";
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(postBody),
      });
    } catch (err) {
      lastError = `Cloudflare network error: ${err instanceof Error ? err.message : "unknown"}`;
      if (attempt < maxRetries) {
        await sleep(2000);
        continue;
      }
      return { ok: false, error: lastError };
    }

    const contentType = res.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const data = await res.json().catch(() => null);
      if (!res.ok || data?.success === false) {
        const msg: string = data?.errors?.[0]?.message ?? `HTTP ${res.status}`;
        const overloaded = res.status === 429 || res.status === 503 || isOverloadedMessage(msg);
        lastError = `Cloudflare error: ${msg}`;
        if (overloaded && attempt < maxRetries) {
          await sleep(2000);
          continue;
        }
        return { ok: false, error: lastError, overloaded };
      }
      const b64 = data?.result?.image;
      if (typeof b64 === "string" && b64.length > 100) {
        return { ok: true, imageBase64: b64 };
      }
      return { ok: false, error: "Empty/invalid image data from Cloudflare." };
    }

    if (!res.ok) {
      lastError = `HTTP ${res.status}`;
      if ((res.status === 429 || res.status === 503) && attempt < maxRetries) {
        await sleep(2000);
        continue;
      }
      return { ok: false, error: lastError, overloaded: res.status === 429 || res.status === 503 };
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) {
      return { ok: false, error: "Empty/invalid image data from Cloudflare." };
    }
    return { ok: true, imageBase64: buf.toString("base64") };
  }

  return { ok: false, error: lastError };
}

/** Tries each (account, key) pair in order until one succeeds — each key
 *  still gets its own retry for transient overload first. Ports
 *  cloudflare_call_with_failover(). */
export async function cloudflareCallWithFailover(
  prompt: string,
  keys: AiApiKey[],
  userId: number
): Promise<CloudflareImageResult> {
  if (keys.length === 0) {
    return { ok: false, error: "No active Cloudflare API keys configured." };
  }

  let lastError = "Unknown error";
  for (const keyRow of keys) {
    if (!keyRow.cfAccountId) continue;
    const res = await cloudflareGenerateThumbnail(prompt, keyRow.cfAccountId, keyRow.apiKey);
    await recordKeyResult(userId, keyRow.id, "cloudflare", "image", res.ok, res.ok ? null : res.error);
    if (res.ok) return res;
    lastError = res.error ?? lastError;
  }
  return { ok: false, error: lastError };
}
