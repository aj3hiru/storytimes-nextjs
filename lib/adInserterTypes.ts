export type AdInsertionType =
  | "disabled"
  | "before_post"
  | "before_content"
  | "before_featured_image"
  | "after_featured_image"
  | "before_paragraph"
  | "after_paragraph"
  | "after_content"
  | "after_post"
  | "before_comments"
  | "after_comments"
  | "footer";

export type AdAlignment = "default" | "left" | "center" | "right" | "float-left" | "float-right";

export type AdPageType = "post" | "homepage" | "category" | "page" | "search" | "tag";

export const AD_INSERTION_OPTIONS: { value: AdInsertionType; label: string }[] = [
  { value: "disabled", label: "Disabled" },
  { value: "before_post", label: "Before post" },
  { value: "before_content", label: "Before content" },
  { value: "before_featured_image", label: "Before featured image" },
  { value: "after_featured_image", label: "After featured image" },
  { value: "before_paragraph", label: "Before paragraph" },
  { value: "after_paragraph", label: "After paragraph" },
  { value: "after_content", label: "After content" },
  { value: "after_post", label: "After post" },
  { value: "before_comments", label: "Before comments" },
  { value: "after_comments", label: "After comments" },
  { value: "footer", label: "Footer" },
];

export const AD_ALIGNMENT_OPTIONS: { value: AdAlignment; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
  { value: "float-left", label: "Float left" },
  { value: "float-right", label: "Float right" },
];

export const AD_PAGE_OPTIONS: { value: AdPageType; label: string }[] = [
  { value: "post", label: "Posts" },
  { value: "homepage", label: "Homepage" },
  { value: "category", label: "Category pages" },
  { value: "page", label: "Static pages" },
  { value: "search", label: "Search pages" },
  { value: "tag", label: "Tag / Archive pages" },
];

/**
 * Real gap fixed here: this used to be a drastically simplified model
 * (just `insertAfterParagraph`, no page-type targeting, no insertion-
 * point choice beyond "after this paragraph number", no alignment) —
 * this file's own earlier comment admitted as much ("bigger feature
 * not otherwise built yet"). Rebuilt to match the reference's actual
 * ad_inserter.json shape exactly: each of the 16 blocks independently
 * chooses WHERE it can appear (`pages` — any combination of post/
 * homepage/category/page/search/tag), WHICH insertion point within
 * that page (`insertion` — 10 options, including page-type-appropriate
 * ones like "before_comments" that only make sense on a post), and how
 * it's aligned (`alignment`). `paragraph` is only meaningful (and only
 * shown in the admin UI) when `insertion` is "before_paragraph" or
 * "after_paragraph".
 */
export interface AdBlock {
  id: number;
  label: string;
  code: string;
  enabled: boolean;
  pages: AdPageType[];
  insertion: AdInsertionType;
  alignment: AdAlignment;
  paragraph: number;
}

export interface AdInserterConfig {
  blocks: AdBlock[];
  globalHeader: string;
  globalFooter: string;
  adsTxtEnabled: boolean;
}

export function defaultAdInserterConfig(): AdInserterConfig {
  return {
    blocks: Array.from({ length: 16 }, (_, i) => ({
      id: i + 1,
      label: `Block ${i + 1}`,
      code: "",
      enabled: false,
      pages: ["post"],
      insertion: "disabled",
      alignment: "default",
      paragraph: 1,
    })),
    globalHeader: "",
    globalFooter: "",
    adsTxtEnabled: false,
  };
}

const INSERTIONS = new Set(AD_INSERTION_OPTIONS.map((o) => o.value));
const ALIGNMENTS = new Set(AD_ALIGNMENT_OPTIONS.map((o) => o.value));
const PAGES = new Set(AD_PAGE_OPTIONS.map((o) => o.value));

/** Insertion points that only exist on post pages. */
export const POST_ONLY_INSERTIONS: AdInsertionType[] = ["before_featured_image", "after_featured_image", "before_comments", "after_comments"];

/** Cleans one stored/submitted block; anything unknown falls back to a safe value. */
export function cleanAdBlock(raw: unknown, id: number): AdBlock {
  const b = (raw ?? {}) as Partial<AdBlock>;
  const label = typeof b.label === "string" && b.label.trim() ? b.label.trim().slice(0, 60) : `Block ${id}`;
  const pages = Array.isArray(b.pages) ? (b.pages.filter((p) => PAGES.has(p as AdPageType)) as AdPageType[]) : ["post" as AdPageType];
  const paragraph = Number(b.paragraph);
  return {
    id,
    label,
    code: typeof b.code === "string" ? b.code : "",
    enabled: !!b.enabled,
    pages: [...new Set(pages)],
    insertion: INSERTIONS.has(b.insertion as AdInsertionType) ? (b.insertion as AdInsertionType) : "disabled",
    alignment: ALIGNMENTS.has(b.alignment as AdAlignment) ? (b.alignment as AdAlignment) : "default",
    paragraph: Number.isFinite(paragraph) && paragraph >= 1 ? Math.floor(paragraph) : 1,
  };
}

/** Why an enabled block would not show anywhere (empty = it will show). */
export function adBlockProblems(b: AdBlock): string[] {
  const out: string[] = [];
  if (!b.code.trim()) out.push("Ad code is empty");
  if (b.insertion === "disabled") out.push("Insertion is set to Disabled");
  if (b.pages.length === 0) out.push("No page type is ticked");
  if (POST_ONLY_INSERTIONS.includes(b.insertion) && !b.pages.includes("post")) out.push("This insertion exists only on Posts — tick Posts");
  return out;
}
