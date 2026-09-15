"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Thin top progress bar shown during client-side navigation.
 *
 * Next.js App Router never reloads the document on an internal link, so
 * the browser's own loading indicator never appears — a person clicking
 * "next chapter" gets no feedback at all until the new page renders,
 * which on a slow connection reads as "the button didn't work". This
 * restores the familiar browser-loading feel.
 *
 * Implemented by watching for the click and for the pathname actually
 * changing, rather than by any router event API: the App Router exposes
 * no public navigation-start event, so intercepting the click is what's
 * actually available. Only plain left-clicks on same-origin, non-target
 * links start the bar — modifier-clicks open a new tab and never navigate
 * this document, so showing a bar for them would leave it stuck on.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // The route key captured when a navigation started, held in STATE (not
  // a ref) because it's read during render — refs aren't safe to read
  // while rendering, which the react-hooks/refs rule correctly flags.
  const [startedKey, setStartedKey] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A completed navigation ends the bar. Derived from the current route
  // rather than by calling setState inside an effect (which the
  // react-hooks/set-state-in-effect rule correctly flags, since it causes
  // an extra render pass): `doneKey` changes the moment the new route is
  // live, so comparing it to the key captured at click time tells us the
  // navigation finished without any effect having to write state.
  const doneKey = `${pathname}?${searchParams?.toString() ?? ""}`;
  // Active exactly while a navigation has started and the live route is
  // still the one we started from. The moment Next.js swaps in the new
  // route, doneKey changes, this flips false, and the bar disappears —
  // no effect writes state to make that happen.
  const active = startedKey !== null && startedKey !== doneKey;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      // Skip anything that isn't an in-app navigation to a different URL.
      if (/^(https?:)?\/\//i.test(href) && !href.startsWith(window.location.origin)) return;
      if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      const target = new URL(href, window.location.href);
      if (target.pathname === window.location.pathname && target.search === window.location.search) return;

      setStartedKey(`${window.location.pathname}?${window.location.search.replace(/^\?/, "")}`);
      // Safety valve: if a navigation is cancelled or fails, never leave
      // the bar running forever.
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setStartedKey(null), 10000);
    }

    // Back/forward. The browser fires popstate the moment the entry
    // changes, but React hasn't rendered the previous route yet — so
    // this is a genuine navigation-in-progress and gets a bar exactly
    // like a forward click does. Without this, pressing Back gave no
    // feedback at all, which is the case most likely to read as a crash
    // because the person is already unsure whether anything happened.
    function onPopState() {
      setStartedKey(`${window.location.pathname}?${window.location.search.replace(/^\?/, "")}`);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setStartedKey(null), 10000);
    }

    document.addEventListener("click", onClick, { capture: true });
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("popstate", onPopState);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!active) return null;
  return (
    <div className="nav-progress" role="progressbar" aria-label="Loading page">
      <div className="nav-progress-bar" />
    </div>
  );
}
