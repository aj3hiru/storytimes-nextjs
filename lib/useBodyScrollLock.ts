"use client";

import { useEffect } from "react";

/**
 * Locks page scroll while a modal is open — matches the reference's own
 * `document.body.style.overflow = 'hidden'` pattern in spirit, but
 * applies it to `<html>` instead of `<body>`. Real bug fixed here:
 * toggling `body.style.overflow` reintroduced the exact class of bug
 * already fixed once before (see globals.css's note on `overflow-x` on
 * `body`) — briefly turning `body` into its own scrolling container
 * broke `.sidebar`'s `position: sticky` positioning the moment a modal
 * opened, visibly jumping/gapping the sidebar, and `overflow-x: hidden`
 * already lives permanently on `<html>` today with no such problem, so
 * toggling `overflow-y` there too for the lock keeps the sidebar's
 * actual scrolling context (the viewport/html) completely undisturbed.
 */
export function useBodyScrollLock(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const html = document.documentElement;
    const previousOverflowY = html.style.overflowY;
    html.style.overflowY = "hidden";
    return () => {
      html.style.overflowY = previousOverflowY;
    };
  }, [open]);
}
