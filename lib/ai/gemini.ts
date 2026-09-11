import type { AiApiKey } from "@prisma/client";
import { recordKeyResult } from "./keys";

export const GEMINI_TEXT_MODEL = "gemini-3.6-flash";

export interface GeminiResult {
  ok: boolean;
  text?: string;
  error?: string;
  overloaded?: boolean;
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
      return { ok: false, error: `Network error contacting Gemini: ${err instanceof Error ? err.message : "unknown"}` };
    }
    clearTimeout(timeout);

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const msg: string = data?.error?.message ?? `Gemini API returned HTTP ${res.status}`;
      const overloaded = res.status === 503 || isOverloadedMessage(msg);
      if (overloaded && attempt < maxRetries) {
        await sleep(2000);
        continue;
      }
      const finalMsg = overloaded
        ? "Gemini is currently overloaded (high demand on Google's side) — this can take a little longer than usual."
        : msg;
      return { ok: false, error: finalMsg, overloaded };
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
  for (const keyRow of keys) {
    const res = await geminiCall(model, body, keyRow.apiKey, timeoutMs);
    await recordKeyResult(userId, keyRow.id, "gemini", task, res.ok, res.ok ? null : res.error);
    if (res.ok) return res;
    lastError = res.error ?? lastError;
    if (res.overloaded) anyOverloaded = true;
  }

  if (anyOverloaded) {
    lastError = `Gemini is currently overloaded on Google's side. We automatically tried all ${keys.length} of your Gemini key(s) but every one was busy — please wait a minute and try again.`;
  }
  return { ok: false, error: lastError };
}
