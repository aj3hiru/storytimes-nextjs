import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getUserKeys, getFeatureSettings } from "@/lib/ai/keys";
import { geminiCallWithFailover, GEMINI_TEXT_MODEL } from "@/lib/ai/gemini";
import { cloudflareCallWithFailover } from "@/lib/ai/cloudflare";
import { STORY_SYSTEM_INSTRUCTION, type StoryGenerationResult } from "@/lib/ai/storyPrompt";

interface GenerateRequestBody {
  /** The raw video shot-list / prompt the user pastes in. Matches
   *  $_POST['prompt'] in your latest ai-generate.php exactly (a single
   *  freeform textarea, not a structured multi-field form — the
   *  structure comes entirely from the system instruction). */
  prompt: string;
}

const MAX_GLOBAL_CONCURRENT_GENERATIONS = 5;
const activeUserGenerations = new Set<number>();
let activeGlobalGenerations = 0;

function stripJsonFences(text: string): string {
  return text.replace(/^```json\s*|\s*```$/g, "").trim();
}

/**
 * Re-verified against your latest admin/api/ai-generate.php + the
 * session-lock-fix. Ports:
 *  - the full "Story Writing Guidelines" system instruction (verbatim, in
 *    lib/ai/storyPrompt.ts)
 *  - structured JSON output via Gemini's responseMimeType (more reliable
 *    than asking for JSON in the prompt text, which an earlier pass of
 *    this port did)
 *  - all 7 output fields: title, content_html, meta_description,
 *    meta_keywords, image_prompt, fb_description, thumbnail_prompt
 *  - the "quick thumbnail" behavior: the Cloudflare call fires in
 *    parallel with the Gemini text call, built from the RAW shot-list
 *    (truncated to 700 chars) rather than waiting for Gemini's own
 *    refined image_prompt field, which doesn't exist until the text
 *    response comes back
 *  - per-user + global concurrency guards
 *
 * Simplified vs. the original: this doesn't attempt the PHP's exact
 * curl_multi "fire both with the single healthiest key, only fail over to
 * the full key list if that fails" two-tier dance — geminiCallWithFailover
 * /cloudflareCallWithFailover already try the healthiest key first as the
 * first iteration of their own loop, so Promise.all([...]) here achieves
 * the same practical outcome with one code path instead of two.
 */
export async function POST(request: NextRequest) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ success: false, message: "Not authenticated" }, { status: 401 });
  }

  if (activeUserGenerations.has(user.id)) {
    return NextResponse.json(
      { success: false, message: "You already have a generation in progress. Please wait for it to finish." },
      { status: 429 }
    );
  }
  if (activeGlobalGenerations >= MAX_GLOBAL_CONCURRENT_GENERATIONS) {
    return NextResponse.json(
      { success: false, message: "The AI generator is busy right now. Please try again in a moment." },
      { status: 503 }
    );
  }

  let body: GenerateRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const prompt = body.prompt?.trim();
  if (!prompt) {
    return NextResponse.json({ success: false, message: "Please paste a video shot-list / prompt first." }, { status: 400 });
  }

  const [geminiKeys, cfKeys, featureSettings] = await Promise.all([
    getUserKeys(user.id, "gemini"),
    getUserKeys(user.id, "cloudflare"),
    getFeatureSettings(user.id),
  ]);

  if (geminiKeys.length === 0) {
    return NextResponse.json(
      { success: false, message: "No active Gemini API keys — add one under AI Features first." },
      { status: 400 }
    );
  }

  activeUserGenerations.add(user.id);
  activeGlobalGenerations++;

  try {
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
      systemInstruction: { parts: [{ text: STORY_SYSTEM_INSTRUCTION }] },
      generationConfig: {
        responseMimeType: "application/json",
        maxOutputTokens: 65536,
        thinkingConfig: { thinkingLevel: "low" },
      },
    };

    const wantsThumbnail = featureSettings.generateThumbnail && cfKeys.length > 0;
    const quickImagePrompt = prompt.replace(/\s+/g, " ").slice(0, 700);

    const [textResult, imgResult] = await Promise.all([
      geminiCallWithFailover(GEMINI_TEXT_MODEL, requestBody, geminiKeys, user.id, "text"),
      wantsThumbnail
        ? cloudflareCallWithFailover(
            `A single striking, photorealistic thumbnail image capturing the most emotionally intense moment from this scene: ${quickImagePrompt}`,
            cfKeys,
            user.id
          )
        : Promise.resolve(null),
    ]);

    if (!textResult.ok || !textResult.text) {
      return NextResponse.json({ success: false, message: textResult.error ?? "Generation failed" }, { status: 502 });
    }

    let parsed: Partial<StoryGenerationResult>;
    try {
      parsed = JSON.parse(stripJsonFences(textResult.text));
    } catch {
      return NextResponse.json(
        { success: false, message: "Gemini returned output that wasn't valid JSON. Please try again." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      title: parsed.title ?? "",
      content: parsed.content_html ?? "",
      metaDescription: parsed.meta_description ?? "",
      metaKeywords: parsed.meta_keywords ?? "",
      imagePrompt: parsed.image_prompt ?? "",
      fbDescription: parsed.fb_description ?? "",
      thumbnailPrompt: parsed.thumbnail_prompt ?? "",
      thumbnailBase64: imgResult?.ok ? imgResult.imageBase64 ?? null : null,
    });
  } finally {
    activeUserGenerations.delete(user.id);
    activeGlobalGenerations--;
  }
}
