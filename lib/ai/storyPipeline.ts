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
 *   Step 1  one short call writes the PLAN — title plus a heading and
 *           summary for every chapter. Small, fast, and it's what keeps
 *           separately-written chapters telling one consistent story.
 *   Step 2  intro, each chapter, and SEO/Facebook text are written at
 *           the same time, each on its own key from the pool. Each call
 *           is a few hundred words, and a failure costs only that one
 *           part, which retries on another key.
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
}

export interface SeoResult {
  meta_description: string;
  meta_keywords: string;
  fb_description: string;
  thumbnail_prompt: string;
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
  shotList: string
): Promise<Parsed<StoryPlan>> {
  const task =
    "Do NOT write the story yet. Plan it. Return ONLY this JSON:\n" +
    '{"title": "the main story title, per Section 1", ' +
    '"intro_plan": "3-4 sentences: what the introduction covers and the trailer-style scene it ends on", ' +
    '"chapters": [{"heading": "a 4-5 word chapter heading, per Section 3", "summary": "4-6 sentences: exactly what happens in this chapter, which characters appear, and the beat it ends on"}]}\n' +
    `The "chapters" array must contain exactly ${settings.chapterCount} objects, in story order, together covering the ` +
    "whole shot-list from the opening beat to the final resolution. Use the same character names throughout.";
  const res = await geminiPooledCall(pool, taskBody(settings, task, shotListBlock(shotList), 4096), userId, 60_000);
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

export async function generateIntro(
  pool: KeyPool,
  userId: number,
  settings: StoryLengthSettings,
  shotList: string,
  plan: StoryPlan
): Promise<Parsed<string>> {
  const task =
    `Write ONLY the Introduction, following Section 2 exactly (${settings.introWords - 25}–${settings.introWords + 25} words), ` +
    "as clean <p> paragraphs with no heading. It must set up exactly the story in the plan below and must not give away " +
    'what happens in the chapters. Return ONLY this JSON: {"intro_html": "..."}';
  const res = await geminiPooledCall(
    pool,
    taskBody(settings, task, `${shotListBlock(shotList)}\n\n${planBlock(plan)}`, 4096),
    userId,
    90_000
  );
  if (!res.ok) return { ok: false, error: res.error ?? "Introduction failed." };
  const parsed = parseJson<{ intro_html: string }>(res.text);
  if (!parsed.ok) return parsed;
  const html = (parsed.value.intro_html ?? "").replace(/<h1[^>]*>[\s\S]*?<\/h1>/gi, "").trim();
  return html ? { ok: true, value: html } : { ok: false, error: "Gemini returned an empty introduction." };
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
  const position =
    index === total - 1
      ? "This is the FINAL chapter: bring the story to its resolution."
      : "End this chapter on its planned beat, leading naturally into the next chapter.";
  const task =
    `Write ONLY Chapter ${index + 1} of ${total}, following Section 3 exactly (${settings.chapterWords - 50}–${settings.chapterWords + 50} words). ` +
    `Start with exactly <h1>${chapter.heading}</h1> followed by <p> paragraphs. Cover only this chapter's events from the ` +
    "plan below — pick up where the previous chapter's summary ends and do not repeat or jump ahead to other chapters' events. " +
    `${position} Return ONLY this JSON: {"chapter_html": "..."}`;
  const res = await geminiPooledCall(
    pool,
    taskBody(settings, task, `${shotListBlock(shotList)}\n\n${planBlock(plan)}`, 6144),
    userId,
    90_000
  );
  if (!res.ok) return { ok: false, error: res.error ?? `Chapter ${index + 1} failed.` };
  const parsed = parseJson<{ chapter_html: string }>(res.text);
  if (!parsed.ok) return parsed;
  let html = (parsed.value.chapter_html ?? "").trim();
  if (!html) return { ok: false, error: `Gemini returned an empty Chapter ${index + 1}.` };
  // The site splits chapters on <h1>, so each chapter must carry exactly
  // one heading, at the very start. Normalize whatever came back.
  html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/gi, "").trim();
  return { ok: true, value: `<h1>${escapeHtml(chapter.heading)}</h1>\n${html}` };
}

export async function generateSeo(
  pool: KeyPool,
  userId: number,
  settings: StoryLengthSettings,
  shotList: string,
  plan: StoryPlan
): Promise<Parsed<SeoResult>> {
  const task =
    "Do NOT write the story. Using the shot-list and the story plan below, return ONLY this JSON:\n" +
    '{"meta_description": "an SEO meta description for this story, under 160 characters, in English", ' +
    '"meta_keywords": "5-8 comma-separated SEO keywords for this story, in English", ' +
    '"fb_description": "the complete Facebook post text per Section 8, newline-separated", ' +
    '"thumbnail_prompt": "the complete thumbnail image-generator prompt per Section 9, ending with the exact VISUAL STYLE block"}';
  const res = await geminiPooledCall(
    pool,
    taskBody(settings, task, `${shotListBlock(shotList)}\n\n${planBlock(plan)}`, 4096),
    userId,
    60_000
  );
  if (!res.ok) return { ok: false, error: res.error ?? "SEO text failed." };
  return parseJson<SeoResult>(res.text);
}
