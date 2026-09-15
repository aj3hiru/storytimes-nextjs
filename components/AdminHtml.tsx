"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
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
  const lastRunKey = useRef<string | null>(null);
  const useFrame = allowFrame && usesDocumentWrite(html);
  // Real bug fixed here — "chapter buttons se doosre chapter pe jaane pe
  // ads load nahi hote": the re-run guard keyed on `html` alone. The ad
  // code for a given slot is IDENTICAL on every chapter, so after a
  // client-side navigation the guard saw an unchanged string and skipped
  // re-execution entirely — the new page got the ad markup but nothing
  // ever ran to fill it. Next.js client-side routing never reloads the
  // document, so there's no other moment at which these would fire.
  // Including the pathname means each distinct page re-runs its slots
  // once, while a re-render of the same page still doesn't double-fire.
  const pathname = usePathname();

  useEffect(() => {
    if (useFrame) return; // SafeAdFrame handles its own script execution.
    const el = ref.current;
    // Guards against React 18 Strict Mode's dev-only double effect
    // invocation re-running (and re-firing) already-executed scripts —
    // without this, every ad/analytics hit would double-fire in dev.
    const runKey = `${pathname}::${html}`;
    if (!el || lastRunKey.current === runKey) return;
    lastRunKey.current = runKey;

    const scripts = Array.from(el.querySelectorAll("script"));
    for (const oldScript of scripts) {
      const newScript = document.createElement("script");
      for (const attr of Array.from(oldScript.attributes)) {
        newScript.setAttribute(attr.name, attr.value);
      }
      newScript.text = oldScript.textContent || "";
      oldScript.parentNode?.replaceChild(newScript, oldScript);
    }

    // AdSense specifically needs one push() per unfilled <ins> slot — its
    // loader script only auto-scans slots present at the original document
    // load, so a slot that arrived via client-side navigation is never
    // picked up on its own no matter how many times the loader re-runs.
    // `data-adsbygoogle-status` is the attribute AdSense itself sets once
    // it has claimed a slot, so this only ever pushes genuinely unfilled
    // ones and can't double-fill.
    const unfilled = el.querySelectorAll("ins.adsbygoogle:not([data-adsbygoogle-status])");
    if (unfilled.length > 0) {
      try {
        const w = window as unknown as { adsbygoogle?: unknown[] };
        w.adsbygoogle = w.adsbygoogle || [];
        for (let i = 0; i < unfilled.length; i++) w.adsbygoogle.push({});
      } catch {
        // Ad blocker or the loader not present — never let this break the page.
      }
    }
    // Re-run whenever the HTML itself changes (e.g. chapter navigation
    // swaps contentHtml client-side) so the new copy's scripts fire too.
  }, [html, useFrame, pathname]);

  if (!html) return <div ref={ref} className={className} />;
  if (useFrame) return <SafeAdFrame html={html} />;
  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
