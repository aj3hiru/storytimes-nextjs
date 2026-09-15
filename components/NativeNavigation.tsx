"use client";

import { useEffect } from "react";

/**
 * Forces every in-app link on the public site to perform a REAL document
 * navigation instead of a Next.js client-side transition.
 *
 * Why: the browser's own loading indicator — the thin bar Chrome draws
 * under the address bar — only ever appears for a real document load. A
 * client-side transition never reloads the document, so that indicator
 * can never fire, which is why the previous attempt at this shipped a
 * custom bar instead. A custom bar is visibly not the same thing (it
 * rendered *below* the browser's own, as two separate bars), and what was
 * actually asked for is the native one.
 *
 * This replaces `NavigationProgress` entirely rather than sitting
 * alongside it — with real navigations the browser handles the indicator,
 * so a second custom bar would just be the duplicate that was reported.
 *
 * It also removes the need for the ad-re-running machinery to carry this
 * site: a real document load runs every ad network's script naturally on
 * every page, exactly as it would on any non-SPA site. (That machinery in
 * `AdminHtml` stays in place — it's still correct, and still matters for
 * the admin panel and for any transition this doesn't intercept.)
 *
 * Implemented as a single capture-phase click handler rather than by
 * converting every `<Link>` across dozens of components: one place to
 * reason about, and nothing to miss or reintroduce later.
 */
export function NativeNavigation() {
  useEffect(() => {
    function onClick(e: MouseEvent) {
      // Never interfere with anything the browser or another handler is
      // already treating specially.
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href) return;

      // Leave alone: new tabs, downloads, in-page anchors, and non-http
      // schemes (mailto:, tel:) — none of these are page navigations.
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      // External links already navigate for real; nothing to do.
      if (url.origin !== window.location.origin) return;
      // Same URL — let the default behaviour handle it rather than
      // triggering a pointless full reload.
      if (url.href === window.location.href) return;

      e.preventDefault();
      // A real navigation: the browser shows its own loading indicator,
      // and the destination page loads its scripts (ads included) the
      // ordinary way.
      window.location.assign(url.href);
    }

    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
