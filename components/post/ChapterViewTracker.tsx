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

    // Always fetch a fresh token right before sending — never bake one into
    // the page at render time, since this page's HTML may be served from a
    // shared cache and a stale/mismatched visitor's token would silently
    // fail CSRF verification server-side.
    fetch("/api/csrf-token")
      .then((r) => r.json())
      .then((d: { token?: string }) => {
        const trackUrl = `/${slug}/chapter-${chapterNumber}/track-view`;
        const payload = new URLSearchParams({ id: String(postId), cTkn: d.token ?? "" });

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
