import type { AdBlock, AdInsertionType, AdPageType, AdAlignment } from "./adInserterTypes";
import { getAdInserterConfig } from "./adInserterSettings";

const ALIGNMENT_CLASS: Record<AdAlignment, string> = {
  default: "",
  left: "ai-block-left",
  center: "ai-block-center",
  right: "ai-block-right",
  "float-left": "ai-block-float-left",
  "float-right": "ai-block-float-right",
};

/**
 * Ported from the reference's own block-targeting model: each of the
 * 16 Ad Inserter blocks independently chooses which page type(s) it
 * can appear on AND which insertion point within that page — a block
 * only renders when BOTH match. Wraps the raw ad code in the same
 * `.ai-block`/alignment-class treatment the reference uses (see
 * post.css's `.ai-block`/`.ai-block-center`/etc. rules, already ported
 * for the WYSIWYG editor's own output — reused here since it's the
 * exact same "arbitrary embedded ad/script HTML, aligned and
 * width-capped consistently" concern).
 */
export async function getAdHtmlFor(page: AdPageType, insertion: AdInsertionType): Promise<string> {
  const config = await getAdInserterConfig();
  const matching = config.blocks.filter(
    (b: AdBlock) => b.enabled && b.insertion === insertion && b.pages.includes(page)
  );
  if (matching.length === 0) return "";
  return matching
    .map((b) => {
      const cls = ["ai-block", ALIGNMENT_CLASS[b.alignment]].filter(Boolean).join(" ");
      return `<div class="${cls}">${b.code}</div>`;
    })
    .join("");
}

/** For `before_paragraph`/`after_paragraph` blocks specifically — these
 *  need the block's own configured paragraph NUMBER too, not just page/
 *  insertion matching, so they're kept separate from getAdHtmlFor()
 *  rather than overloading one function with a third, sometimes-unused
 *  parameter. */
export async function getParagraphAdBlocks(
  page: AdPageType,
  insertion: "before_paragraph" | "after_paragraph"
): Promise<{ paragraph: number; html: string }[]> {
  const config = await getAdInserterConfig();
  return config.blocks
    .filter((b) => b.enabled && b.insertion === insertion && b.pages.includes(page))
    .map((b) => {
      const cls = ["ai-block", ALIGNMENT_CLASS[b.alignment]].filter(Boolean).join(" ");
      return { paragraph: Math.max(1, b.paragraph), html: `<div class="${cls}">${b.code}</div>` };
    });
}
