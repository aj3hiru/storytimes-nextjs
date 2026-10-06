/**
 * Removes blank space an editor typed by accident at the very start or end
 * of a post/page: empty paragraphs (<p><br></p>, <p>&nbsp;</p>), stray <br>s
 * and leading/trailing spaces inside the first and last paragraph. Content
 * in between is never touched.
 */
const BLANK = String.raw`(?:\s|&nbsp;|&#160;|&#xa0;| |​|<br\s*\/?>)`;
const BLOCK = "p|div|h[1-6]|blockquote";
const INLINE = "p|div|h[1-6]|blockquote|span|strong|em|b|i|u|a";

const LEADING_EMPTY = new RegExp(String.raw`^(?:${BLANK}|<(${BLOCK})(?:\s[^>]*)?>${BLANK}*<\/\1>)+`, "i");
const TRAILING_EMPTY = new RegExp(String.raw`(?:${BLANK}|<(${BLOCK})(?:\s[^>]*)?>${BLANK}*<\/\1>)+$`, "i");
const LEADING_INSIDE = new RegExp(String.raw`^((?:<(?:${INLINE})(?:\s[^>]*)?>)+)${BLANK}+`, "i");
const TRAILING_INSIDE = new RegExp(String.raw`${BLANK}+((?:<\/(?:${INLINE})>)+)$`, "i");

export function trimContentEdges(html: string): string {
  let out = html;
  for (let i = 0; i < 5; i++) {
    const before = out;
    out = out.replace(LEADING_EMPTY, "").replace(TRAILING_EMPTY, "");
    out = out.replace(LEADING_INSIDE, "$1").replace(TRAILING_INSIDE, "$1");
    if (out === before) break;
  }
  return out;
}
