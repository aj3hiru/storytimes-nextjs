import { parse, type HTMLElement, type Node, NodeType } from "node-html-parser";

export interface Chapter {
  number: number;
  title: string;
  contentHtml: string;
}

export interface ParsedChapters {
  hasChapters: boolean;
  introHtml: string;
  chapters: Chapter[];
  total: number;
}

/**
 * Ports parseChaptersFromContent() from includes/functions.php EXACTLY:
 * posts.content is one HTML blob (there is no per-chapter table). A chapter
 * boundary is either:
 *   - a top-level <h1>...</h1>, or
 *   - a top-level <div> whose ONLY meaningful child is a single <h1>
 *     (i.e. it's just a styled wrapper around the heading — whitespace-only
 *     text nodes around it don't count against "only child").
 *
 * Everything before the first heading becomes `introHtml`. Everything
 * between one heading and the next becomes that chapter's `contentHtml`.
 */
export function parseChaptersFromContent(html: string): ParsedChapters {
  const trimmed = html?.trim() ?? "";
  if (trimmed === "") {
    return { hasChapters: false, introHtml: "", chapters: [], total: 0 };
  }

  const root = parse(html, { lowerCaseTagName: true });

  let introHtml = "";
  const chapters: Chapter[] = [];
  let current: Chapter | null = null;

  for (const node of root.childNodes) {
    const heading = findChapterHeading(node);

    if (heading) {
      if (current) chapters.push(current);
      current = {
        number: chapters.length + 1,
        title: heading.text.trim(),
        contentHtml: "",
      };
    } else {
      const nodeHtml = nodeToHtml(node);
      if (current) {
        current.contentHtml += nodeHtml;
      } else {
        introHtml += nodeHtml;
      }
    }
  }
  if (current) chapters.push(current);

  const hasChapters = chapters.length > 0;
  return {
    hasChapters,
    introHtml: hasChapters ? introHtml.trim() : trimmed,
    chapters,
    total: chapters.length,
  };
}

function findChapterHeading(node: Node): HTMLElement | null {
  if (node.nodeType !== NodeType.ELEMENT_NODE) return null;
  const el = node as HTMLElement;

  if (el.tagName?.toLowerCase() === "h1") return el;

  if (el.tagName?.toLowerCase() === "div") {
    const h1s = el.querySelectorAll("h1");
    if (h1s.length === 1) {
      const onlyHeading = el.childNodes.every((child) => {
        if (child === h1s[0]) return true;
        if (child.nodeType === NodeType.TEXT_NODE && child.text.trim() === "") return true;
        return false;
      });
      if (onlyHeading) return h1s[0];
    }
  }

  return null;
}

function nodeToHtml(node: Node): string {
  return "toString" in node ? String(node.toString()) : "";
}
