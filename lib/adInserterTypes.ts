export type AdInsertionType =
  | "disabled"
  | "before_post"
  | "before_content"
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
