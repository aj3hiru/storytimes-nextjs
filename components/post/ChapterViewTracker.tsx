"use client";

import { useEffect } from "react";

const COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours, matches the original

export function ChapterViewTracker({
  postId,
  slug,
  chapterNumber,
}: {
  postId: number;
  slug: string;
  chapterNumber: number;
}) {
  useEffect(() => {
    if (chapterNumber <= 0) return;

    const cooldownKey = `view_cooldown_${postId}_ch${chapterNumber}`;
    const now = Date.now();
    const lastTracked = Number(localStorage.getItem(cooldownKey) ?? 0);
    if (lastTracked && now - lastTracked < COOLDOWN_MS) return;

    // Real bug fixed here — the reported "traffic source sirf Direct
    // bata raha hai, Google/Facebook se aane wale bhi Direct". This
    // request itself fires from a useEffect, well after the page has
    // already loaded — so the browser sets THIS request's own Referer
    // header to the current page's own URL, not wherever the visitor
    // actually came from. The track-view route was comparing that
    // self-referencing header against the site's own host and always
    // matching, so every visit fell into "direct" regardless of how the
    // person really arrived.
    //
    // `document.referrer` is the right tool here instead: the browser
    // sets it once, at the moment of the actual page navigation, to
    // wherever the visitor's PREVIOUS page really was — google.com,
    // facebook.com, etc. Captured once up front (before any client-side
    // navigation on THIS page could overwrite it) and sent explicitly in
    // the payload, so the server no longer has to guess from a header
    // that was never going to carry the real answer.
    const originalReferrer = document.referrer;

    // Always fetch a fresh token right before sending — never bake one into
    // the page at render time, since this page's HTML may be served from a
    // shared cache and a stale/mismatched visitor's token would silently
    // fail CSRF verification server-side.
    fetch("/api/csrf-token")
      .then((r) => r.json())
      .then((d: { token?: string }) => {
        const trackUrl = `/${slug}/chapter-${chapterNumber}/track-view`;
        const payload = new URLSearchParams({ id: String(postId), cTkn: d.token ?? "", ref: originalReferrer });

        let beaconSent = false;
        if (navigator.sendBeacon) {
          beaconSent = navigator.sendBeacon(trackUrl, payload);
        }
        if (!beaconSent) {
          fetch(trackUrl, { method: "POST", body: payload, keepalive: true }).catch(() => {});
        }
        localStorage.setItem(cooldownKey, String(now));
      })
      .catch(() => {});
  }, [postId, slug, chapterNumber]);


  return null;
}
