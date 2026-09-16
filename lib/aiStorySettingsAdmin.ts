"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "./auth";
import {
  getDefaultStorySettings,
  saveDefaultStorySettings,
  saveUserStorySettingsOverride,
} from "./ai/storySettings";

/** Admin-only: sets the site-wide default every user's generations use
 *  unless they've set their own override. */
export async function saveStoryDefaultAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!user || user.role !== "admin") throw new Error("Admin access required.");

  // Read the current default once as a fallback for any field the form
  // didn't send a usable number for, rather than three separate reads.
  const current = await getDefaultStorySettings();
  const chapterCount = Number(formData.get("chapterCount"));
  const introWords = Number(formData.get("introWords"));
  const chapterWords = Number(formData.get("chapterWords"));

  await saveDefaultStorySettings({
    chapterCount: chapterCount > 0 ? chapterCount : current.chapterCount,
    introWords: introWords > 0 ? introWords : current.introWords,
    chapterWords: chapterWords > 0 ? chapterWords : current.chapterWords,
  });

  revalidatePath("/admin/ai-features");
}

/** Any user: sets just their own override. Leaving a field blank clears
 *  that specific override (falls back to the admin default for it),
 *  rather than requiring all three to be set together. */
export async function saveMyStoryOverrideAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!user) throw new Error("Not authenticated.");

  const chapterCountRaw = String(formData.get("chapterCount") ?? "").trim();
  const introWordsRaw = String(formData.get("introWords") ?? "").trim();
  const chapterWordsRaw = String(formData.get("chapterWords") ?? "").trim();

  await saveUserStorySettingsOverride(user.id, {
    chapterCount: chapterCountRaw ? Number(chapterCountRaw) : undefined,
    introWords: introWordsRaw ? Number(introWordsRaw) : undefined,
    chapterWords: chapterWordsRaw ? Number(chapterWordsRaw) : undefined,
  });

  revalidatePath("/admin/ai-features");
}
