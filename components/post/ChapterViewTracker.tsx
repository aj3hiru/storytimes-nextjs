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
    // Real bug fixed here (reported live: "intro pe visitor aa raha hai
    // to traffic count nahi ho raha jab tak chapter pe na jaaye"). This
    // used to `return` early for chapterNumber <= 0, skipping the intro
    // page of every chaptered story entirely — so a visitor who landed
    // on a story, read the intro and left without opening a chapter was
    // never counted anywhere: not in views, not in traffic sources, not
    // in unique visitors.
    //
    // That early-return was copied from the reference PHP's CHAPTER-level
    // tracker, where `if (chapterNum > 0)` is correct — but the reference
    // also fires a separate POST-level beacon on every page load
    // regardless of chapter (post.php → api/0f9e8d7c6n.php), and that
    // post-level one is what actually feeds post_stats_daily, visitor_log
    // and the hourly curve. This port only ever ported the chapter-level
    // half, so the intro had no tracker of any kind covering it. Rather
    // than adding a second parallel endpoint, chapter 0 is simply tracked
    // like any other page here (the route now accepts it) — same effect,
    // one code path instead of two that could drift.
    if (chapterNumber < 0) return;

    // Per explicit request: one view for the whole article per session,
    // no matter how many chapters get opened — not one per page. A
    // per-POST sessionStorage flag (not the per-chapter localStorage
    // cooldown below) makes every chapter after whichever page a
    // visitor lands on first a no-op: nothing fires for it at all, so
    // it can't add to the article's view count. This is a deliberate
    // choice knowing what it costs — the per-chapter granular tables
    // (postView, the "Avg. Chapters Read" stat this decision retired)
    // will no longer see real data for chapter 2 onward within a
    // session, since their request never gets sent. sessionStorage
    // (not localStorage) is what makes this reset per browser tab/
    // session rather than persisting like the 6-hour cooldown below —
    // a fresh tab reading the same article again is a new view.
    const sessionKey = `view_session_${postId}`;
    try {
      if (sessionStorage.getItem(sessionKey)) return;
    } catch {
      // If sessionStorage is unavailable, fall through and track as normal
      // rather than silently losing every view for this visitor.
    }

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
        try {
          sessionStorage.setItem(sessionKey, "1");
        } catch {
          // Non-fatal — see the guard above.
        }
      })
      .catch(() => {});
  }, [postId, slug, chapterNumber]);


  return null;
}
