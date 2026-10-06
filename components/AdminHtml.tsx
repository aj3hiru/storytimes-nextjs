"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { SafeAdFrame } from "./SafeAdFrame";

/** document.write() called after the page has loaded implicitly nukes
 *  the whole current document in every browser — a handful of older/
 *  direct ad networks still ship tags that do this. Routed to
 *  SafeAdFrame instead of running inline (see that file for why). */
/**
 * Performance Settings → "Delay ads and tracking scripts" (<html data-delay-scripts>):
 *  - "interaction" (default): nothing in admin-saved HTML runs until the reader
 *    first touches, scrolls, moves the mouse or presses a key — the same idea
 *    as WP Rocket's "Delay JavaScript execution". The page shows and becomes
 *    usable with no ad/tracking work in the way.
 *  - "load": runs once the page has loaded and the browser is idle.
 * Ad slots additionally wait until they are within ~1000px of the screen.
 */
function delayMode(): "interaction" | "load" | null {
  if (typeof document === "undefined") return null;
  const v = document.documentElement.dataset.delayScripts;
  return v === "interaction" || v === "load" ? v : null;
}

const INTERACTION_EVENTS = ["pointerdown", "touchstart", "keydown", "wheel", "scroll", "mousemove"] as const;
let interacted = false;
const interactionWaiters = new Set<() => void>();

function whenUserActs(cb: () => void): () => void {
  if (interacted) {
    cb();
    return () => {};
  }
  if (interactionWaiters.size === 0) {
    const fire = () => {
      if (interacted) return;
      interacted = true;
      for (const ev of INTERACTION_EVENTS) window.removeEventListener(ev, fire);
      const waiting = [...interactionWaiters];
      interactionWaiters.clear();
      for (const w of waiting) w();
    };
    for (const ev of INTERACTION_EVENTS) window.addEventListener(ev, fire, { passive: true });
  }
  interactionWaiters.add(cb);
  return () => interactionWaiters.delete(cb);
}

function whenPageIdle(cb: () => void): () => void {
  let cancelled = false;
  const go = () => {
    if (cancelled) return;
    const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
    if (w.requestIdleCallback) w.requestIdleCallback(() => !cancelled && cb(), { timeout: 2500 });
    else setTimeout(() => !cancelled && cb(), 300);
  };
  if (document.readyState === "complete") go();
  else window.addEventListener("load", go, { once: true });
  return () => {
    cancelled = true;
    window.removeEventListener("load", go);
  };
}

function whenNearScreen(el: Element, cb: () => void): () => void {
  if (!("IntersectionObserver" in window)) {
    cb();
    return () => {};
  }
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        cb();
      }
    },
    { rootMargin: "1000px 0px" }
  );
  io.observe(el);
  return () => io.disconnect();
}

const INERT_TYPE = "text/st-delay";
const JS_TYPES = /^(|text\/javascript|application\/javascript|module|text\/ecmascript|application\/ecmascript)$/i;

/**
 * Makes every executable <script> in admin-saved HTML inert (type="text/st-delay")
 * before it reaches the page. Without this the browser runs the script while
 * parsing the server HTML AND AdminHtml runs it again after hydration — ad
 * loaders were executing twice, and nothing could be delayed. Non-JS scripts
 * (JSON-LD etc.) are left alone.
 */
function inertScripts(html: string): string {
  return html.replace(/<script\b([^>]*)>/gi, (tag, attrs: string) => {
    const typeMatch = /\btype\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    const type = typeMatch ? (typeMatch[2] ?? typeMatch[3] ?? typeMatch[4] ?? "").trim() : "";
    if (!JS_TYPES.test(type)) return tag;
    const rest = typeMatch ? attrs.replace(typeMatch[0], "") : attrs;
    return `<script type="${INERT_TYPE}"${type ? ` data-st-type="${type}"` : ""}${rest}>`;
  });
}

/** Runs the inert scripts in document order; one that follows an external
 *  non-async script waits for it, like the browser would. */
async function runScripts(container: HTMLElement): Promise<void> {
  const scripts = Array.from(container.querySelectorAll<HTMLScriptElement>(`script[type="${INERT_TYPE}"]`));
  for (const old of scripts) {
    if (!old.isConnected) continue;
    const s = document.createElement("script");
    for (const attr of Array.from(old.attributes)) {
      if (attr.name === "type" || attr.name === "data-st-type") continue;
      s.setAttribute(attr.name, attr.value);
    }
    const originalType = old.getAttribute("data-st-type");
    if (originalType) s.type = originalType;
    s.text = old.textContent || "";
    const blocking = Boolean(old.getAttribute("src")) && !old.hasAttribute("async") && !old.hasAttribute("defer");
    if (blocking) s.async = false;
    const loaded = blocking
      ? new Promise<void>((resolve) => {
          s.onload = () => resolve();
          s.onerror = () => resolve();
          setTimeout(resolve, 8000);
        })
      : null;
    old.parentNode?.replaceChild(s, old);
    if (loaded) await loaded;
  }
}

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
  const inertHtml = inertScripts(html);
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
  // false until the delay (if any) has passed — gates both inline scripts and the ad iframe.
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    const mode = delayMode();
    if (!mode || !html.trim() || !/<(script|iframe|ins)\b/i.test(html)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no delay: run right after mount
      setReady(true);
      return;
    }
    let stopVisible = () => {};
    const start = () => {
      if (allowFrame && el) stopVisible = whenNearScreen(el, () => setReady(true));
      else setReady(true);
    };
    const stopWait = mode === "interaction" ? whenUserActs(start) : whenPageIdle(start);
    return () => {
      stopWait();
      stopVisible();
    };
  }, [html, allowFrame, pathname]);

  useEffect(() => {
    if (useFrame || !ready) return; // SafeAdFrame handles its own script execution.
    const el = ref.current;
    // Guards against React 18 Strict Mode's dev-only double effect
    // invocation re-running (and re-firing) already-executed scripts —
    // without this, every ad/analytics hit would double-fire in dev.
    const runKey = `${pathname}::${html}`;
    if (!el || lastRunKey.current === runKey) return;
    lastRunKey.current = runKey;

    void runScripts(el).then(() => {
      pushAdsense(el);
      releaseEmptyReservations(el);
    });
  }, [html, useFrame, pathname, ready]);

  if (!html) return <div ref={ref} className={className} />;
  if (useFrame) return <div ref={ref} className={className}>{ready && <SafeAdFrame html={html} />}</div>;
  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: inertHtml }} suppressHydrationWarning />;
}

/**
 * Ad Inserter "Reserve height" is a min-height on the block: it never crops a
 * bigger ad. If the slot is still empty 10 s after its ad code ran (no fill),
 * the reserved space is let go so no blank box stays on the page.
 */
function releaseEmptyReservations(el: HTMLElement) {
  setTimeout(() => {
    el.querySelectorAll<HTMLElement>(".ai-block[style*='min-height']").forEach((block) => {
      const filled = Array.from(block.querySelectorAll("iframe, img, ins, video, canvas, div, a")).some((n) => {
        const r = (n as HTMLElement).getBoundingClientRect();
        return r.height > 8 && r.width > 8;
      });
      if (!filled) block.style.minHeight = "";
    });
  }, 10000);
}

function pushAdsense(el: HTMLElement) {

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
}
