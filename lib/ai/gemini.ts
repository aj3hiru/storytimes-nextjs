import type { AiApiKey } from "@prisma/client";
import { recordKeyResult } from "./keys";
import type { KeyPool } from "./keyPool";

export const GEMINI_TEXT_MODEL = "gemini-3.6-flash";

export interface GeminiResult {
  ok: boolean;
  text?: string;
  error?: string;
  /** Temporary: HTTP 503 or an "overloaded/high demand" message. */
  overloaded?: boolean;
  /** HTTP 429 — a rate limit or quota. Gemini applies these per Google
   *  Cloud PROJECT, not per API key, so every key from the same project
   *  shares one limit. Switching keys doesn't help; waiting does. */
  rateLimited?: boolean;
  /** Google's own suggested wait (RetryInfo.retryDelay), when it sends one. */
  retryAfterMs?: number;
}

/** Reads RetryInfo.retryDelay (e.g. "23s") out of a Gemini error body. */
function parseRetryDelayMs(data: unknown): number | undefined {
  const details = (data as { error?: { details?: Array<Record<string, unknown>> } })?.error?.details;
  if (!Array.isArray(details)) return undefined;
  for (const d of details) {
    const delay = d?.retryDelay;
    if (typeof delay === "string") {
      const m = delay.match(/^(\d+(?:\.\d+)?)s$/);
      if (m) return Math.round(parseFloat(m[1]) * 1000);
    }
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isOverloadedMessage(msg: string): boolean {
  const lower = msg.toLowerCase();
  return lower.includes("high demand") || lower.includes("overloaded") || lower.includes("unavailable");
}

/**
 * Single call against one API key, WITH its own built-in retry loop —
 * ported from gemini_call() in your latest includes/ai_image_helpers.php.
 * An earlier pass of this port dropped this retry loop on the (wrong)
 * assumption that cross-key failover alone was equivalent; it isn't —
 * retrying the SAME key on a transient overload is faster and doesn't
 * burn through your other keys' quota for what's usually a few-second
 * blip on Google's side.
 */
async function geminiCall(
  model: string,
  body: unknown,
  apiKey: string,
  timeoutMs: number,
  maxRetries = 2
): Promise<GeminiResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timeout);
      if (attempt < maxRetries) {
        await sleep(3000);
        continue;
      }
      // Network errors and timeouts are temporary, not a fault of this key.
      return { ok: false, overloaded: true, error: `Network error contacting Gemini: ${err instanceof Error ? err.message : "unknown"}` };
    }
    clearTimeout(timeout);

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const msg: string = data?.error?.message ?? `Gemini API returned HTTP ${res.status}`;
      const rateLimited = res.status === 429;
      const overloaded = !rateLimited && (res.status === 503 || isOverloadedMessage(msg));
      const retryAfterMs = parseRetryDelayMs(data);
      if ((overloaded || rateLimited) && attempt < maxRetries) {
        await sleep(Math.min(retryAfterMs ?? 2000, 30_000));
        continue;
      }
      // Real bug fixed here: this used to replace Google's message with a
      // generic "overloaded" sentence before returning — so the UI, the
      // key's lastError and ai_generation_log all recorded that same
      // sentence, and the actual cause (which quota, what limit) was
      // thrown away. Google's own text is kept now, with the status code.
      return { ok: false, error: `HTTP ${res.status}: ${msg}`, overloaded, rateLimited, retryAfterMs };
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") {
      return { ok: false, error: "No text in Gemini response" };
    }
    return { ok: true, text };
  }

  return { ok: false, error: "Gemini request failed after retries." };
}

/**
 * Tries each key in order (healthiest first, per getUserKeys()'s
 * ordering) until one succeeds — each attempt still gets geminiCall()'s
 * own retry for transient overload on that same key first. Ports
 * gemini_call_with_failover(), including the friendlier aggregate
 * "all N keys were busy" message when every failure was an overload.
 */
export async function geminiCallWithFailover(
  model: string,
  body: unknown,
  keys: AiApiKey[],
  userId: number,
  task: "text" | "image",
  timeoutMs = 170_000
): Promise<GeminiResult> {
  if (keys.length === 0) {
    return { ok: false, error: "No active Gemini API keys configured." };
  }

  let lastError = "Unknown error";
  let anyOverloaded = false;
  let anyRateLimited = false;
  for (const keyRow of keys) {
    const res = await geminiCall(model, body, keyRow.apiKey, timeoutMs);
    await recordKeyResult(userId, keyRow.id, "gemini", task, res.ok, res.ok ? null : res.error);
    if (res.ok) return res;
    lastError = res.error ?? lastError;
    if (res.overloaded) anyOverloaded = true;
    if (res.rateLimited) anyRateLimited = true;
  }

  if (anyRateLimited) {
    lastError = `Google's rate limit was hit on your Gemini key(s). Limits apply per Google Cloud project, not per key — please wait a minute and try again. Google said: ${lastError}`;
  } else if (anyOverloaded) {
    lastError = `Gemini is currently overloaded on Google's side. We tried all ${keys.length} of your Gemini key(s) — please wait a minute and try again. Google said: ${lastError}`;
  }
  return { ok: false, error: lastError };
}

/**
 * A small, fast, TEXT-ONLY Gemini call that generates just a thumbnail
 * image prompt from the raw shot-list — deliberately separate from (and
 * much smaller than) the full structured-JSON article call. Lets
 * Cloudflare start generating the actual thumbnail image immediately,
 * running in parallel with the full article generation, instead of
 * either waiting for the whole article to finish first or using the raw,
 * unrefined shot-list text as the image prompt.
 */
function quickThumbnailBody(shotList: string) {
  return {
    contents: [
      {
        role: "user",
        parts: [
          {
            text:
              "Read this video shot-list and write ONE short, vivid English sentence (under 300 characters) " +
              "describing a single photorealistic thumbnail image capturing the story's most emotionally intense " +
              "or visually striking moment. Suitable for an AI image generator. No text or words in the image. " +
              "Reply with ONLY the sentence, nothing else — no quotes, no labels.\n\nShot list:\n\n" +
              shotList,
          },
        ],
      },
    ],
    generationConfig: { maxOutputTokens: 300, thinkingConfig: { thinkingLevel: "low" } },
  };
}

export async function geminiQuickThumbnailPrompt(
  keys: AiApiKey[],
  userId: number,
  shotList: string
): Promise<GeminiResult> {
  return geminiCallWithFailover(GEMINI_TEXT_MODEL, quickThumbnailBody(shotList), keys, userId, "image", 30_000);
}

/** Same small call, run through the shared KeyPool so it takes its own
 *  key instead of colliding with the story-planning call running at the
 *  same moment. */
export async function geminiQuickThumbnailPromptPooled(pool: KeyPool, userId: number, shotList: string): Promise<GeminiResult> {
  return geminiPooledCall(pool, quickThumbnailBody(shotList), userId, 30_000);
}

/**
 * One task run through the shared KeyPool — powers the parallel generation
 * pipeline (lib/ai/storyPipeline.ts). All pacing lives in the pool: a key
 * that fails rests (how long depends on why — see keyPool.ts), and the
 * next attempt goes to whichever key is rested. Keys that fail for a
 * non-temporary reason (invalid key, permission) are excluded from this
 * task. geminiCall() runs with no same-key retries of its own here, so it
 * can't fire extra requests behind the pool's back — every request spent
 * counts against a free-tier quota.
 */
export async function geminiPooledCall(
  pool: KeyPool,
  body: unknown,
  userId: number,
  timeoutMs: number
): Promise<GeminiResult> {
  const MAX_ATTEMPTS = Math.min(pool.size + 2, 12);
  const deadline = Date.now() + 240_000;
  const excluded = new Set<number>();
  let attempts = 0;
  let lastError = "Unknown error";
  let sawRateLimit = false;
  let sawOverload = false;

  while (attempts < MAX_ATTEMPTS && Date.now() < deadline) {
    const key = await pool.acquire(excluded);
    if (!key) break;
    attempts++;
    let res: GeminiResult;
    try {
      res = await geminiCall(GEMINI_TEXT_MODEL, body, key.apiKey, timeoutMs, 0);
    } catch (err) {
      res = { ok: false, overloaded: true, error: err instanceof Error ? err.message : "Unexpected error calling Gemini" };
    }
    pool.release(key.id, res);
    await recordKeyResult(userId, key.id, "gemini", "text", res.ok, res.ok ? null : res.error);
    if (res.ok) return res;
    lastError = res.error ?? lastError;
    if (res.rateLimited) sawRateLimit = true;
    else if (res.overloaded) sawOverload = true;
    else excluded.add(key.id);
  }

  if (sawRateLimit) {
    return {
      ok: false,
      rateLimited: true,
      error:
        "Your Gemini keys have run out of quota for now. Gemini quotas apply per Google Cloud project — keys from the " +
        "same project share one quota, and free-tier quotas are small. Wait and try again, add keys from other Google " +
        `Cloud projects, or enable billing on the project. Google said: ${lastError}`,
    };
  }
  if (sawOverload) {
    return { ok: false, overloaded: true, error: `Gemini was overloaded for this part after ${attempts} attempt(s). Google said: ${lastError}` };
  }
  return { ok: false, error: lastError };
}
