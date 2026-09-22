import { type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { getUserKeys, getFeatureSettings } from "@/lib/ai/keys";
import { geminiQuickThumbnailPromptPooled } from "@/lib/ai/gemini";
import { cloudflareCallWithFailover } from "@/lib/ai/cloudflare";
import { getEffectiveStorySettings } from "@/lib/ai/storySettings";
import { KeyPool, loadRotatedKeys } from "@/lib/ai/keyPool";
import {
  generatePlan,
  generateIntro,
  generateChapter,
  generateSeo,
  type StoryPlan,
  type SeoResult,
} from "@/lib/ai/storyPipeline";

interface GenerateRequestBody {
  prompt: string;
}

const MAX_GLOBAL_CONCURRENT_GENERATIONS = 5;
const activeUserGenerations = new Set<number>();
let activeGlobalGenerations = 0;

/**
 * Server-Sent-Events stream with real step-by-step progress. Rebuilt as a
 * parallel pipeline (see lib/ai/storyPipeline.ts and lib/ai/keyPool.ts):
 *
 *   planning  one short call writes the title and a heading + summary for
 *             each chapter. The quick thumbnail prompt runs alongside it
 *             on a different key, and Cloudflare starts the image as soon
 *             as that prompt is ready.
 *   writing   intro, each chapter and SEO/Facebook text are written at
 *             the same time — up to five keys working at once, rotating
 *             least-recently-used so no key always gets the same job, and
 *             a key that reports overload is benched while its task moves
 *             to a rested key.
 *   verifying pieces are assembled in chapter order.
 *
 * Event types: "status" (step change), "parts" (the list of pieces being
 * written), "part" (one piece done or failed), "thumbnail" (image ready or
 * failed), "complete" (final result), "error" (fatal).
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
    loadRotatedKeys(user.id, "gemini"),
    getUserKeys(user.id, "cloudflare"),
    getFeatureSettings(user.id),
  ]);

  if (geminiKeys.length === 0) {
    return sseErrorResponse(
      "No Gemini API key found on your account. Go to AI Features → API Keys and add one, then try again.",
      400
    );
  }

  // Real bug fixed here: only generateThumbnail was ever read — the Title,
  // Content and SEO toggles in "My Personal Toggles" were saved but never
  // checked, so turning Generate Content off still wrote a full article.
  // Each toggle now controls its own part of the pipeline below.
  const wantsTitle = featureSettings.generateTitle;
  const wantsContent = featureSettings.generateContent;
  const wantsSeo = featureSettings.generateSeo;
  const wantsThumbnail = featureSettings.generateThumbnail;
  if (!wantsTitle && !wantsContent && !wantsSeo && !wantsThumbnail) {
    return sseErrorResponse(
      "Every generation toggle is off in AI Features → My Personal Toggles. Turn on at least one, then try again.",
      400
    );
  }
  const missingCloudflare = wantsThumbnail && cfKeys.length === 0;
  const needsPlan = wantsTitle || wantsContent || wantsSeo;

  const encoder = new TextEncoder();
  activeUserGenerations.add(user.id);
  activeGlobalGenerations++;

  const stream = new ReadableStream({
    async start(controller) {
      // Real bugs fixed here (reported: "Network error — please try again"
      // on a healthy connection). That message comes from the browser when
      // this stream is cut off mid-generation, and two things here caused it:
      //
      // 1. Long silences. A part can wait out a Google rate-limit pause and
      //    then run a 30-90 second call, with nothing sent to the browser
      //    the whole time. Cloudflare and the reverse proxy in front of the
      //    app close a response that goes quiet for too long. A heartbeat
      //    (an SSE comment line, which the client's parser ignores because
      //    it only reads "data:" lines) now goes out every 15 seconds.
      //
      // 2. Writing after close. When a chapter failed, the stream was closed
      //    while the thumbnail was still running; when it finished it tried
      //    to write to the closed stream, which throws — inside a promise
      //    nothing was waiting on, i.e. an unhandled rejection, which can
      //    take down the whole Node process and every other request in it.
      //    Writes after close are now no-ops, and that promise is caught.
      let closed = false;
      function write(chunk: string) {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      }
      function send(type: string, data: Record<string, unknown>) {
        write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
      }
      const heartbeat = setInterval(() => write(": keep-alive\n\n"), 15_000);
      function close() {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // already closed by the runtime (e.g. the browser disconnected)
        }
      }
      function fail(message: string) {
        send("error", { message });
        close();
      }

      try {
        send("status", { step: "checking-keys", message: "Checking your API keys…" });
        if (missingCloudflare) {
          send("status", {
            step: "no-cloudflare",
            message: "No Cloudflare key found — the article will generate without a thumbnail. Add one under AI Features to enable thumbnails.",
          });
        }

        const pool = new KeyPool(geminiKeys);
        const settings = await getEffectiveStorySettings(user.id);

        // ── Thumbnail: starts immediately, alongside planning, on its own key.
        const imgPromise =
          wantsThumbnail && !missingCloudflare
            ? geminiQuickThumbnailPromptPooled(pool, user.id, prompt).then(async (tp) => {
                const quick = tp.ok && tp.text ? tp.text.trim().slice(0, 700) : prompt.replace(/\s+/g, " ").slice(0, 700);
                const res = await cloudflareCallWithFailover(
                  `A single striking, photorealistic thumbnail image capturing the most emotionally intense moment from this scene: ${quick}`,
                  cfKeys,
                  user.id
                );
                send("thumbnail", res.ok ? { status: "done" } : { status: "failed", error: res.error });
                return { res, quick };
              }).catch((err) => {
                const error = err instanceof Error ? err.message : "Thumbnail generation failed.";
                send("thumbnail", { status: "failed", error });
                return { res: { ok: false as const, error, imageBase64: undefined }, quick: "" };
              })
            : Promise.resolve(null);

        // ── Step 1: the plan.
        let plan: StoryPlan | null = null;
        if (needsPlan) {
          send("status", { step: "planning", message: "Planning the story…" });
          const planRes = await generatePlan(pool, user.id, settings, prompt);
          if (!planRes.ok) return fail(planRes.error);
          plan = planRes.value;
        }

        // ── Step 2: intro, every chapter and SEO at the same time.
        type Part = { key: string; label: string; run: () => Promise<{ ok: true; value: unknown } | { ok: false; error: string }> };
        const parts: Part[] = [];
        if (plan && wantsContent) {
          const p = plan;
          parts.push({ key: "intro", label: "Introduction", run: () => generateIntro(pool, user.id, settings, prompt, p) });
          p.chapters.forEach((_, i) =>
            parts.push({ key: `chapter-${i + 1}`, label: `Chapter ${i + 1}`, run: () => generateChapter(pool, user.id, settings, prompt, p, i) })
          );
        }
        if (plan && wantsSeo) {
          const p = plan;
          parts.push({ key: "seo", label: "SEO & Facebook text", run: () => generateSeo(pool, user.id, settings, prompt, p) });
        }

        send("status", { step: "writing", message: "Writing…" });
        send("parts", { parts: parts.map(({ key, label }) => ({ key, label })) });

        const runPart = async (part: Part) => {
          const r = await part.run();
          send("part", { key: part.key, status: r.ok ? "done" : "failed" });
          return r;
        };
        // Started 400 ms apart rather than all in the same instant: several
        // requests arriving at once is what trips a per-minute limit, even
        // when the total for the minute would have been fine.
        let results = await Promise.all(
          parts.map((part, i) => new Promise<void>((r) => setTimeout(r, i * 400)).then(() => runPart(part)))
        );

        // A part that failed every key it tried gets one more pass once the
        // rest are finished — by then the pool has rested keys again.
        const retryIdx = results.map((r, i) => (r.ok ? -1 : i)).filter((i) => i >= 0);
        if (retryIdx.length > 0) {
          const retried = await Promise.all(retryIdx.map((i) => runPart(parts[i])));
          results = results.map((r, i) => (retryIdx.includes(i) ? retried[retryIdx.indexOf(i)] : r));
        }

        const byKey = new Map(parts.map((p, i) => [p.key, results[i]]));
        const failed = parts.filter((p) => !byKey.get(p.key)?.ok);
        // Content is all-or-nothing: an article with a hole in the middle
        // isn't publishable, so a missing intro or chapter fails the run.
        const contentFailure = failed.find((p) => p.key === "intro" || p.key.startsWith("chapter-"));
        if (contentFailure) {
          const r = byKey.get(contentFailure.key);
          return fail(`${contentFailure.label} couldn't be written: ${r && !r.ok ? r.error : "unknown error"}`);
        }

        send("status", { step: "verifying", message: "Putting it all together…" });

        let contentHtml = "";
        if (plan && wantsContent) {
          const chunks = [byKey.get("intro"), ...plan.chapters.map((_, i) => byKey.get(`chapter-${i + 1}`))];
          contentHtml = chunks.map((r) => (r && r.ok ? (r.value as string) : "")).join("\n");
        }
        const seoRes = byKey.get("seo");
        const seo = seoRes && seoRes.ok ? (seoRes.value as SeoResult) : null;
        const img = await imgPromise;

        let guidelineWarning: string | null = null;
        if (wantsContent) {
          const chapterCount = (contentHtml.match(/<h1[^>]*>/gi) ?? []).length;
          const plainText = contentHtml.replace(/<[^>]+>/g, " ").trim();
          const wordCount = plainText ? plainText.split(/\s+/).length : 0;
          // Uses the configured targets (AI Features → Story Settings). This
          // check was still hard-coded to the old 5-chapter / 3,800-word
          // guideline from before those settings existed.
          const expectedMin = settings.introWords - 25 + settings.chapterCount * (settings.chapterWords - 50);
          if (chapterCount < settings.chapterCount || wordCount < expectedMin * 0.85) {
            guidelineWarning =
              `Heads up: the story came out at ${chapterCount} chapter(s) and ~${wordCount} words ` +
              `(target: ${settings.chapterCount} chapters, ~${expectedMin}+ words). Review before publishing.`;
          }
        }
        if (wantsSeo && !seo) {
          const r = byKey.get("seo");
          const note = `SEO & Facebook text couldn't be generated${r && !r.ok ? `: ${r.error}` : ""}.`;
          guidelineWarning = guidelineWarning ? `${guidelineWarning} ${note}` : note;
        }

        // An empty string means "not generated this time" — the client
        // leaves that field untouched rather than blanking it.
        send("complete", {
          title: wantsTitle && plan ? plan.title : "",
          content: contentHtml,
          metaDescription: seo?.meta_description ?? "",
          metaKeywords: seo?.meta_keywords ?? "",
          fbDescription: seo?.fb_description ?? "",
          thumbnailPrompt: seo?.thumbnail_prompt || img?.quick || "",
          thumbnailBase64: img?.res.ok ? img.res.imageBase64 ?? null : null,
          thumbnailError: img && !img.res.ok ? img.res.error : null,
          guidelineWarning,
        });
        close();
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : "Unexpected error during generation." });
        close();
      } finally {
        clearInterval(heartbeat);
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
      // Tells nginx-style reverse proxies not to buffer this response, so
      // each progress event and heartbeat reaches the browser immediately.
      "X-Accel-Buffering": "no",
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
