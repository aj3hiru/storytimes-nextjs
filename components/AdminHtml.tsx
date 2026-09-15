"use client";

import { useEffect, useRef } from "react";
import { SafeAdFrame } from "./SafeAdFrame";

/** document.write() called after the page has loaded implicitly nukes
 *  the whole current document in every browser — a handful of older/
 *  direct ad networks still ship tags that do this. Routed to
 *  SafeAdFrame instead of running inline (see that file for why). */
function usesDocumentWrite(html: string): boolean {
  return /document\s*\.\s*write/i.test(html);
}

/**
 * Renders HTML that may contain <script> tags saved by admins (Ad
 * Inserter blocks, global header/footer, Code Snippets) — used anywhere
 * that HTML gets mixed into real page content (entry-content, homepage,
 * layout header/footer).
 *
 * Why this exists: `dangerouslySetInnerHTML` inserts <script> tags into
 * the DOM, but the browser never executes them (a deliberate DOM-spec
 * rule, not a React limitation) — so AdSense/GA/any real ad or tracking
 * snippet would sit there completely inert. This component:
 *   1. Server-renders the HTML as-is via dangerouslySetInnerHTML, same as
 *      before — so real content (post text, etc.) still shows up in the
 *      initial HTML for fast paint and for search engines/crawlers.
 *   2. After mount, finds every <script> tag already sitting in that
 *      container and replaces each with a freshly created <script>
 *      element (browsers DO execute scripts created this way), so ad/
 *      analytics code actually runs.
 *
 * It never sets, reads, or overrides width/height — ad sizing is left
 * 100% to the ad network's own script/CSS. Setting a size here would
 * fight whatever the ad script sets on its own <ins>/<iframe> and cause
 * exactly the flicker/reflow this is meant to avoid.
 *
 * `allowFrame`: pass true only for STANDALONE ad-block slots (before/
 * after post, footer, comments, featured image — see PostReader.tsx /
 * homepage page.tsx). When the block's code contains document.write(),
 * it's rendered inside SafeAdFrame's sandboxed iframe instead of inline,
 * so it can't wipe the real page. Left false (default) for Global
 * Header/Footer, Code Snippets, and the post body itself — those are
 * far more likely to carry Google Analytics/GTM/verification tags that
 * MUST execute in the main window to track the real page; an iframe
 * would silently break them, which would be a worse regression than the
 * rare document.write ad tag this guards against.
 */
export function AdminHtml({ html, className, allowFrame }: { html: string; className?: string; allowFrame?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const lastRunHtml = useRef<string | null>(null);
  const useFrame = allowFrame && usesDocumentWrite(html);

  useEffect(() => {
    if (useFrame) return; // SafeAdFrame handles its own script execution.
    const el = ref.current;
    // Guards against React 18 Strict Mode's dev-only double effect
    // invocation re-running (and re-firing) already-executed scripts —
    // without this, every ad/analytics hit would double-fire in dev.
    if (!el || lastRunHtml.current === html) return;
    lastRunHtml.current = html;

    const scripts = Array.from(el.querySelectorAll("script"));
    for (const oldScript of scripts) {
      const newScript = document.createElement("script");
      for (const attr of Array.from(oldScript.attributes)) {
        newScript.setAttribute(attr.name, attr.value);
      }
      newScript.text = oldScript.textContent || "";
      oldScript.parentNode?.replaceChild(newScript, oldScript);
    }
    // Re-run whenever the HTML itself changes (e.g. chapter navigation
    // swaps contentHtml client-side) so the new copy's scripts fire too.
  }, [html, useFrame]);

  if (!html) return <div ref={ref} className={className} />;
  if (useFrame) return <SafeAdFrame html={html} />;
  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
