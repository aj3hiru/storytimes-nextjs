import { geminiPooledCall } from "./gemini";
import type { KeyPool } from "./keyPool";
import { buildStorySystemInstruction } from "./storyPrompt";
import type { StoryLengthSettings } from "./storySettings";

/**
 * Parallel story generation — new, no PHP equivalent. Replaces the single
 * giant Gemini call that used to produce title + intro + every chapter +
 * SEO + Facebook text + thumbnail prompt all in one JSON response.
 *
 * Why: that one call ran 60-90 seconds and produced ~2,000+ words in one
 * go. Any overload or timeout part-way through threw the entire article
 * away, and every attempt landed on a single key. Now:
 *
 *   Step 1  one call writes the PLAN — title plus a heading and summary
 *           for every chapter — and, in the same response, the SEO and
 *           Facebook text and a one-line thumbnail scene. Those are
 *           written from the shot-list and the plan either way, so folding
 *           them in costs nothing in quality and saves requests.
 *   Step 2  the chapters are written at the same time, each on its own key
 *           from the pool. The introduction is written together with
 *           Chapter 1.
 *
 * Request count matters as much as speed: free-tier Gemini quotas are
 * counted in requests per Google Cloud project (a reported quota was 20).
 * Phase 151's first version of this pipeline used about 7 requests for a
 * 3-chapter article (plan, thumbnail prompt, intro, 3 chapters, SEO) —
 * 3-4x the old single call's 2, and it ran out of quota fast. This layout
 * uses 1 + chapterCount: 4 for a 3-chapter article.
 *
 * Every call reuses the complete, carefully tuned system instruction from
 * storyPrompt.ts — all safety, style, dialogue, and formatting rules —
 * unchanged, with a short TASK block appended at the end saying which
 * single piece this request produces and replacing that instruction's
 * final all-in-one JSON format. The rules are never rewritten or
 * summarized here, so nothing in them can drift from the tested version.
 */

export interface StoryPlan {
  title: string;
  intro_plan: string;
  chapters: { heading: string; summary: string }[];
  /** Present only when requested (see generatePlan's options). */
  meta_description?: string;
  meta_keywords?: string;
  fb_description?: string;
  thumbnail_prompt?: string;
  /** One short sentence for the image generator — replaces the separate
   *  quick-thumbnail-prompt request. */
  thumbnail_scene?: string;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function stripJsonFences(text: string): string {
  return text.replace(/^```json\s*|\s*```$/g, "").trim();
}

function parseJson<T>(text: string | undefined): Parsed<T> {
  if (!text) return { ok: false, error: "Empty response from Gemini." };
  try {
    return { ok: true, value: JSON.parse(stripJsonFences(text)) as T };
  } catch {
    return { ok: false, error: "Gemini returned output that wasn't valid JSON." };
  }
}

function taskBody(settings: StoryLengthSettings, task: string, userText: string, maxOutputTokens: number) {
  return {
    contents: [{ role: "user", parts: [{ text: userText }] }],
    systemInstruction: {
      parts: [
        {
          text:
            buildStorySystemInstruction(settings) +
            "\n\n==========\nTASK FOR THIS REQUEST — this replaces the all-in-one JSON output format described above. " +
            "Every writing, style, safety, and formatting rule above still applies in full; only the scope of this " +
            "single response changes.\n" +
            task,
        },
      ],
    },
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens,
      thinkingConfig: { thinkingLevel: "low" },
    },
  };
}

function shotListBlock(shotList: string): string {
  return (
    "Video shot-prompt from the user (scene-by-scene shot list — camera angles, dialogue/voice lines, SFX cues, visual descriptions):\n\n" +
    shotList
  );
}

function planBlock(plan: StoryPlan): string {
  const chapters = plan.chapters.map((c, i) => `Chapter ${i + 1} — "${c.heading}": ${c.summary}`).join("\n");
  return `STORY PLAN (already decided — follow it exactly):\nTitle: ${plan.title}\nIntroduction: ${plan.intro_plan}\n${chapters}`;
}

export async function generatePlan(
  pool: KeyPool,
  userId: number,
  settings: StoryLengthSettings,
  shotList: string,
  options: { withSeo: boolean; withThumbnail: boolean }
): Promise<Parsed<StoryPlan>> {
  const extraFields: string[] = [];
  if (options.withSeo) {
    extraFields.push(
      '"meta_description": "an SEO meta description for this story, under 160 characters, in English"',
      '"meta_keywords": "5-8 comma-separated SEO keywords for this story, in English"',
      '"fb_description": "the complete Facebook post text per Section 8, newline-separated"',
      '"thumbnail_prompt": "the complete thumbnail image-generator prompt per Section 9, ending with the exact VISUAL STYLE block"'
    );
  }
  if (options.withThumbnail) {
    extraFields.push(
      '"thumbnail_scene": "ONE short, vivid English sentence (under 300 characters) describing a single photorealistic image of the story\'s most emotionally intense moment, following the safety rules in Section 0 — no text in the image"'
    );
  }
  const task =
    "Do NOT write the story yet. Plan it. Return ONLY this JSON:\n" +
    '{"title": "the main story title, per Section 1", ' +
    '"intro_plan": "3-4 sentences: what the introduction covers and the trailer-style scene it ends on", ' +
    '"chapters": [{"heading": "a 4-5 word chapter heading, per Section 3", "summary": "4-6 sentences: exactly what happens in this chapter, which characters appear, and the beat it ends on"}]' +
    (extraFields.length ? ", " + extraFields.join(", ") : "") +
    "}\n" +
    `The "chapters" array must contain exactly ${settings.chapterCount} objects, in story order, together covering the ` +
    "whole shot-list from the opening beat to the final resolution. Use the same character names throughout.";
  const res = await geminiPooledCall(pool, taskBody(settings, task, shotListBlock(shotList), 8192), userId, 90_000);
  if (!res.ok) return { ok: false, error: res.error ?? "Planning failed." };
  const parsed = parseJson<StoryPlan>(res.text);
  if (!parsed.ok) return parsed;
  const plan = parsed.value;
  if (!plan.title || !Array.isArray(plan.chapters) || plan.chapters.length === 0) {
    return { ok: false, error: "Gemini returned an incomplete story plan." };
  }
  // Trust the requested count over whatever came back, so the article
  // always has the number of chapters the settings asked for.
  plan.chapters = plan.chapters.slice(0, settings.chapterCount);
  return { ok: true, value: plan };
}

export async function generateChapter(
  pool: KeyPool,
  userId: number,
  settings: StoryLengthSettings,
  shotList: string,
  plan: StoryPlan,
  index: number
): Promise<Parsed<string>> {
  const total = plan.chapters.length;
  const chapter = plan.chapters[index];
  const withIntro = index === 0;
  const position =
    index === total - 1
      ? "This is the FINAL chapter: bring the story to its resolution."
      : "End this chapter on its planned beat, leading naturally into the next chapter.";
  const chapterRule =
    `Chapter ${index + 1} of ${total} follows Section 3 exactly (${settings.chapterWords - 50}–${settings.chapterWords + 50} words), ` +
    "covers only this chapter's events from the plan below, picks up where the previous chapter's summary ends, and " +
    `does not repeat or jump ahead to other chapters' events. ${position}`;
  const task = withIntro
    ? "Write ONLY the Introduction and Chapter 1. " +
      `The Introduction follows Section 2 exactly (${settings.introWords - 25}–${settings.introWords + 25} words), as clean ` +
      "<p> paragraphs with no heading, setting up exactly the story in the plan without giving away what happens in the chapters. " +
      `${chapterRule} Put the chapter's <p> paragraphs in chapter_html WITHOUT its heading. ` +
      'Return ONLY this JSON: {"intro_html": "...", "chapter_html": "..."}'
    : `Write ONLY Chapter ${index + 1}. ${chapterRule} Put the chapter's <p> paragraphs in chapter_html WITHOUT its heading. ` +
      'Return ONLY this JSON: {"chapter_html": "..."}';
  const res = await geminiPooledCall(
    pool,
    taskBody(settings, task, `${shotListBlock(shotList)}\n\n${planBlock(plan)}`, withIntro ? 10240 : 6144),
    userId,
    120_000
  );
  if (!res.ok) return { ok: false, error: res.error ?? `Chapter ${index + 1} failed.` };
  const parsed = parseJson<{ intro_html?: string; chapter_html?: string }>(res.text);
  if (!parsed.ok) return parsed;
  const stripH1 = (s: string) => s.replace(/<h1[^>]*>[\s\S]*?<\/h1>/gi, "").trim();
  const body = stripH1(parsed.value.chapter_html ?? "");
  if (!body) return { ok: false, error: `Gemini returned an empty Chapter ${index + 1}.` };
  // The site splits chapters on <h1>, so each chapter must carry exactly
  // one heading, at the very start, and the intro none at all.
  const chapterHtml = `<h1>${escapeHtml(chapter.heading)}</h1>\n${body}`;
  if (!withIntro) return { ok: true, value: chapterHtml };
  const intro = stripH1(parsed.value.intro_html ?? "");
  if (!intro) return { ok: false, error: "Gemini returned an empty introduction." };
  return { ok: true, value: `${intro}\n${chapterHtml}` };
}
