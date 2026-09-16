import { prisma } from "../db";

/** The three knobs that shape a generated story's length. Chapter count
 *  is exact; intro/chapter word counts are TARGETS — the prompt still
 *  asks Gemini for a tight range around each (±~10%), matching how the
 *  original prompt always expressed lengths as ranges rather than exact
 *  numbers, since asking an LLM for one precise word count tends to
 *  produce worse, more padded writing than asking for a natural range. */
export interface StoryLengthSettings {
  chapterCount: number;
  introWords: number;
  chapterWords: number;
}

/** Hard floors/ceilings — not exposed as a choice, just a sanity clamp so
 *  a typo in either settings screen can't produce a prompt asking for
 *  something absurd (a 40-chapter story, a one-word intro, etc). */
const BOUNDS = {
  chapterCount: { min: 1, max: 10 },
  introWords: { min: 150, max: 800 },
  chapterWords: { min: 300, max: 1200 },
};

function clamp(value: number, key: keyof typeof BOUNDS): number {
  const { min, max } = BOUNDS[key];
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** What ships if neither an admin default nor a user override has ever
 *  been set — matches this project's own current defaults (3 chapters,
 *  ~475-word intro, ~650-word chapters) rather than the original PHP's
 *  5-6/300-350/600-700, per explicit request to shorten stories. */
const FALLBACK: StoryLengthSettings = { chapterCount: 3, introWords: 475, chapterWords: 650 };

const CONFIG_KEYS = {
  chapterCount: "ai_default_chapter_count",
  introWords: "ai_default_intro_words",
  chapterWords: "ai_default_chapter_words",
} as const;

/** The admin's site-wide default — what every user gets unless they've
 *  set their own override. Reads AppConfig directly (uncached, small
 *  table, read once per generation) rather than going through the
 *  cached getAppConfig() used for public-page settings, since this only
 *  runs inside an authenticated admin action, not on every page view. */
export async function getDefaultStorySettings(): Promise<StoryLengthSettings> {
  const rows = await prisma.appConfig.findMany({
    where: { configKey: { in: Object.values(CONFIG_KEYS) } },
  });
  const map = new Map(rows.map((r) => [r.configKey, r.configValue]));

  const chapterCount = Number(map.get(CONFIG_KEYS.chapterCount));
  const introWords = Number(map.get(CONFIG_KEYS.introWords));
  const chapterWords = Number(map.get(CONFIG_KEYS.chapterWords));

  return {
    chapterCount: Number.isFinite(chapterCount) && chapterCount > 0 ? clamp(chapterCount, "chapterCount") : FALLBACK.chapterCount,
    introWords: Number.isFinite(introWords) && introWords > 0 ? clamp(introWords, "introWords") : FALLBACK.introWords,
    chapterWords: Number.isFinite(chapterWords) && chapterWords > 0 ? clamp(chapterWords, "chapterWords") : FALLBACK.chapterWords,
  };
}

export async function saveDefaultStorySettings(settings: StoryLengthSettings): Promise<void> {
  await Promise.all([
    prisma.appConfig.upsert({
      where: { configKey: CONFIG_KEYS.chapterCount },
      create: { configKey: CONFIG_KEYS.chapterCount, configValue: String(clamp(settings.chapterCount, "chapterCount")) },
      update: { configValue: String(clamp(settings.chapterCount, "chapterCount")) },
    }),
    prisma.appConfig.upsert({
      where: { configKey: CONFIG_KEYS.introWords },
      create: { configKey: CONFIG_KEYS.introWords, configValue: String(clamp(settings.introWords, "introWords")) },
      update: { configValue: String(clamp(settings.introWords, "introWords")) },
    }),
    prisma.appConfig.upsert({
      where: { configKey: CONFIG_KEYS.chapterWords },
      create: { configKey: CONFIG_KEYS.chapterWords, configValue: String(clamp(settings.chapterWords, "chapterWords")) },
      update: { configValue: String(clamp(settings.chapterWords, "chapterWords")) },
    }),
  ]);
}

/** The settings a specific user's generation should actually use: their
 *  own override for any of the three fields they've set, falling back to
 *  the admin's site-wide default for whichever ones they haven't. */
export async function getEffectiveStorySettings(userId: number): Promise<StoryLengthSettings> {
  const [defaults, row] = await Promise.all([
    getDefaultStorySettings(),
    prisma.aiFeatureSettings.findUnique({ where: { userId }, select: { chapterCount: true, introWords: true, chapterWords: true } }),
  ]);

  return {
    chapterCount: row?.chapterCount != null ? clamp(row.chapterCount, "chapterCount") : defaults.chapterCount,
    introWords: row?.introWords != null ? clamp(row.introWords, "introWords") : defaults.introWords,
    chapterWords: row?.chapterWords != null ? clamp(row.chapterWords, "chapterWords") : defaults.chapterWords,
  };
}

export async function saveUserStorySettingsOverride(
  userId: number,
  settings: Partial<StoryLengthSettings>
): Promise<void> {
  await prisma.aiFeatureSettings.upsert({
    where: { userId },
    create: {
      userId,
      chapterCount: settings.chapterCount != null ? clamp(settings.chapterCount, "chapterCount") : null,
      introWords: settings.introWords != null ? clamp(settings.introWords, "introWords") : null,
      chapterWords: settings.chapterWords != null ? clamp(settings.chapterWords, "chapterWords") : null,
    },
    update: {
      chapterCount: settings.chapterCount != null ? clamp(settings.chapterCount, "chapterCount") : null,
      introWords: settings.introWords != null ? clamp(settings.introWords, "introWords") : null,
      chapterWords: settings.chapterWords != null ? clamp(settings.chapterWords, "chapterWords") : null,
    },
  });
}
