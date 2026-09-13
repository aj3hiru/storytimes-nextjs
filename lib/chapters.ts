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

  const strict = parseTopLevelChapters(trimmed);
  if (strict.hasChapters) return strict;

  // Real bug fixed here: the strict, byte-exact port of the reference's
  // algorithm only recognizes a chapter boundary at an H1 that's a
  // DIRECT child of the content root (or a <div> wrapping nothing but
  // one). This matched the reference's own PHP exactly, but broke in
  // practice for AI-generated posts: content comes back from Gemini as
  // plain top-level <h1>/<p> (per lib/ai/storyPrompt.ts's own explicit
  // instructions), but then round-trips through the Tiptap editor on
  // every save — Tiptap parses that HTML into its internal document
  // model and re-serializes it, and can nest headings differently than
  // the original literal markup (still visibly "just headings" to a
  // human, and still counted correctly by the admin editor's own live
  // badge, which searches for `<h1>` at ANY depth via DOMParser) than
  // this strict top-level-only check expects. The practical symptom
  // reported: the editor correctly said "5 chapters detected", the post
  // itself loaded fine, but every /chapter-N URL 404'd — because the
  // PUBLIC page's strict parser found zero top-level chapters at all.
  // Falls back to a lenient pass — find every <h1> anywhere in the
  // document, in document order, and split around those — only when
  // the strict pass finds none, so content that already parses
  // correctly under the exact original algorithm is completely
  // unaffected by this fallback.
  return parseChaptersLeniently(trimmed);
}

function parseTopLevelChapters(html: string): ParsedChapters {
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
    introHtml: hasChapters ? introHtml.trim() : html,
    chapters,
    total: chapters.length,
  };
}

/** Lenient fallback: finds every <h1> anywhere in the document (any
 *  nesting depth) in document order, and splits the ENTIRE flattened
 *  HTML string around those headings' positions. Deliberately simpler
 *  than the strict DOM-tree-based split above — good enough to recover
 *  a sane chapter list from real-world HTML the strict algorithm can't
 *  handle, without trying to replicate its exact node-by-node behavior. */
function parseChaptersLeniently(html: string): ParsedChapters {
  const root = parse(html, { lowerCaseTagName: true });
  const headings = root.querySelectorAll("h1");
  if (headings.length === 0) {
    return { hasChapters: false, introHtml: html, chapters: [], total: 0 };
  }

  const h1Regex = /<h1\b[^>]*>[\s\S]*?<\/h1>/gi;
  const matches = [...html.matchAll(h1Regex)];
  if (matches.length === 0) {
    return { hasChapters: false, introHtml: html, chapters: [], total: 0 };
  }

  const introHtml = parse(html.slice(0, matches[0].index).trim()).toString();
  const chapters: Chapter[] = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const startOfContent = (match.index ?? 0) + match[0].length;
    const endOfContent = i + 1 < matches.length ? matches[i + 1].index : html.length;
    const titleHtml = match[0].replace(/<\/?h1[^>]*>/gi, "");
    const titleNode = parse(titleHtml);
    chapters.push({
      number: i + 1,
      title: titleNode.text.trim(),
      // Re-parsed through node-html-parser and re-serialized — the raw
      // string slice can leave a dangling unclosed tag if the split
      // point falls inside a wrapper the strict pass didn't recognize
      // (e.g. the wrapper opens before the <h1> but closes after this
      // chapter's content starts); parsing it fixes that up
      // automatically the same way a browser's own lenient HTML
      // parsing would.
      contentHtml: parse(html.slice(startOfContent, endOfContent).trim()).toString(),
    });
  }

  return { hasChapters: true, introHtml, chapters, total: chapters.length };
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
