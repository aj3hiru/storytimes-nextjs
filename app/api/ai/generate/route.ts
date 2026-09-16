import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getUserKeys, getFeatureSettings } from "@/lib/ai/keys";
import { geminiCallWithFailover, geminiQuickThumbnailPrompt, GEMINI_TEXT_MODEL } from "@/lib/ai/gemini";
import { cloudflareCallWithFailover } from "@/lib/ai/cloudflare";
import { buildStorySystemInstruction, type StoryGenerationResult } from "@/lib/ai/storyPrompt";
import { getEffectiveStorySettings } from "@/lib/ai/storySettings";

interface GenerateRequestBody {
  prompt: string;
}

const MAX_GLOBAL_CONCURRENT_GENERATIONS = 5;
const activeUserGenerations = new Set<number>();
let activeGlobalGenerations = 0;

function stripJsonFences(text: string): string {
  return text.replace(/^```json\s*|\s*```$/g, "").trim();
}

/**
 * Rebuilt as a Server-Sent-Events stream so the client can show REAL
 * step-by-step progress (checking keys → writing article / generating
 * thumbnail in parallel → done) instead of a fake, hardcoded percentage.
 * Also restructures the pipeline into two real phases, per explicit
 * request: (1) a small, fast Gemini call generates JUST a thumbnail
 * prompt from the raw shot-list first, so (2) Cloudflare can start
 * generating the actual image immediately, running in parallel with the
 * (much slower) full-article Gemini call — rather than either waiting
 * for the whole article to finish first, or starting the image from the
 * raw, unrefined shot-list text.
 *
 * Each event is a line `data: {...}\n\n` (SSE format), with a `type`
 * field the client switches on: "status" (progress update), "thumbnail"
 * (image ready or failed), "complete" (final result), "error" (fatal).
 */
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return sseErrorResponse("Not authenticated", 401);
  }

  if (activeUserGenerations.has(user.id)) {
    return sseErrorResponse("You already have a generation in progress. Please wait for it to finish.", 429);
  }
  if (activeGlobalGenerations >= MAX_GLOBAL_CONCURRENT_GENERATIONS) {
    return sseErrorResponse("The AI generator is busy right now. Please try again in a moment.", 503);
  }

  let body: GenerateRequestBody;
  try {
    body = await request.json();
  } catch {
    return sseErrorResponse("Invalid JSON body", 400);
  }

  const rawPrompt = body.prompt?.trim();
  if (!rawPrompt) {
    return sseErrorResponse("Please paste a video shot-list / prompt first.", 400);
  }
  const prompt = rawPrompt.length > 12000 ? rawPrompt.slice(0, 12000) : rawPrompt;

  const [geminiKeys, cfKeys, featureSettings] = await Promise.all([
    getUserKeys(user.id, "gemini"),
    getUserKeys(user.id, "cloudflare"),
    getFeatureSettings(user.id),
  ]);

  // Real gap fixed here: previously, having zero Cloudflare keys just
  // silently skipped the thumbnail with no explanation at all — the
  // admin had no idea WHY no image appeared. Now surfaces a specific,
  // actionable message for each missing-key scenario.
  if (geminiKeys.length === 0) {
    return sseErrorResponse(
      "No Gemini API key found on your account. Go to AI Features → API Keys and add one, then try again.",
      400
    );
  }
  const wantsThumbnail = featureSettings.generateThumbnail;
  const missingCloudflare = wantsThumbnail && cfKeys.length === 0;

  const encoder = new TextEncoder();
  activeUserGenerations.add(user.id);
  activeGlobalGenerations++;

  const stream = new ReadableStream({
    async start(controller) {
      function send(type: string, data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`));
      }

      try {
        send("status", { step: "checking-keys", message: "Checking your API keys…" });
        if (missingCloudflare) {
          send("status", {
            step: "no-cloudflare",
            message: "No Cloudflare key found — the article will generate without a thumbnail. Add one under AI Features to enable thumbnails.",
          });
        }

        send("status", { step: "thumbnail-prompt", message: "Preparing the thumbnail prompt…" });
        const thumbPromptResult =
          wantsThumbnail && !missingCloudflare ? await geminiQuickThumbnailPrompt(geminiKeys, user.id, prompt) : null;
        const quickImagePrompt =
          thumbPromptResult?.ok && thumbPromptResult.text
            ? thumbPromptResult.text.trim().slice(0, 700)
            : prompt.replace(/\s+/g, " ").slice(0, 700);

        send("status", {
          step: "generating",
          message: wantsThumbnail && !missingCloudflare ? "Writing the article and generating the thumbnail…" : "Writing the article…",
        });

        // The user's own override for chapter count / word targets, falling
        // back to the admin's site-wide default for whatever they haven't
        // set themselves — see lib/ai/storySettings.ts.
        const storySettings = await getEffectiveStorySettings(user.id);
        const systemInstruction = buildStorySystemInstruction(storySettings);

        const requestBody = {
          contents: [
            {
              role: "user",
              parts: [
                {
                  text:
                    "Video shot-prompt from the user (scene-by-scene shot list — camera angles, dialogue/voice lines, SFX cues, visual descriptions):\n\n" +
                    prompt,
                },
              ],
            },
          ],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: 65536,
            thinkingConfig: { thinkingLevel: "low" },
          },
        };

        // The two calls fire together here (Promise.all), matching the
        // "start the thumbnail the moment its prompt is ready, don't wait
        // for the article" requirement — but we report on the THUMBNAIL
        // half as soon as IT resolves (it's much faster) rather than
        // waiting for both, so the client sees real, independent progress
        // for each half instead of one combined wait.
        const textPromise = geminiCallWithFailover(GEMINI_TEXT_MODEL, requestBody, geminiKeys, user.id, "text");
        const imgPromise =
          wantsThumbnail && !missingCloudflare
            ? cloudflareCallWithFailover(
                `A single striking, photorealistic thumbnail image capturing the most emotionally intense moment from this scene: ${quickImagePrompt}`,
                cfKeys,
                user.id
              ).then((res) => {
                if (res.ok) send("thumbnail", { status: "done" });
                else send("thumbnail", { status: "failed", error: res.error });
                return res;
              })
            : Promise.resolve(null);

        const [textResult, imgResult] = await Promise.all([textPromise, imgPromise]);

        if (!textResult.ok || !textResult.text) {
          send("error", { message: textResult.error ?? "Generation failed" });
          controller.close();
          return;
        }

        let parsed: Partial<StoryGenerationResult>;
        try {
          parsed = JSON.parse(stripJsonFences(textResult.text));
        } catch {
          send("error", { message: "Gemini returned output that wasn't valid JSON. Please try again." });
          controller.close();
          return;
        }

        send("status", { step: "verifying", message: "Verifying title, content, and thumbnail…" });

        const contentHtml = parsed.content_html ?? "";
        const chapterCount = (contentHtml.match(/<h1[^>]*>/gi) ?? []).length;
        const plainText = contentHtml.replace(/<[^>]+>/g, " ").trim();
        const wordCount = plainText ? plainText.split(/\s+/).length : 0;
        const guidelineWarning =
          chapterCount < 5 || wordCount < 3800
            ? `Heads up: generated story has ${chapterCount} chapter(s) and ~${wordCount} words ` +
              `(guideline is 5-6 chapters, 4,000-4,500 words). Review before publishing — you can regenerate to try again.`
            : null;

        send("complete", {
          title: parsed.title ?? "",
          content: contentHtml,
          metaDescription: parsed.meta_description ?? "",
          metaKeywords: parsed.meta_keywords ?? "",
          imagePrompt: parsed.image_prompt ?? "",
          fbDescription: parsed.fb_description ?? "",
          thumbnailPrompt: parsed.thumbnail_prompt ?? quickImagePrompt,
          thumbnailBase64: imgResult?.ok ? imgResult.imageBase64 ?? null : null,
          thumbnailError: imgResult && !imgResult.ok ? imgResult.error : null,
          guidelineWarning,
        });
        controller.close();
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : "Unexpected error during generation." });
        controller.close();
      } finally {
        activeUserGenerations.delete(user.id);
        activeGlobalGenerations--;
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function sseErrorResponse(message: string, status: number): Response {
  // Even error cases are returned as one SSE "error" event rather than a
  // plain JSON error body, so the client's single stream-parsing code
  // path handles every outcome without a separate non-streaming branch.
  const encoder = new TextEncoder();
  const body = encoder.encode(`data: ${JSON.stringify({ type: "error", message })}\n\n`);
  return new Response(body, { status, headers: { "Content-Type": "text/event-stream" } });
}
