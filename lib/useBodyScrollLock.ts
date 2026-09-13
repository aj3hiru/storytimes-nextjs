"use client";

import { useEffect } from "react";

/**
 * Locks page scroll while a modal is open — matches the reference's own
 * `document.body.style.overflow = 'hidden'` pattern exactly (its FAQ
 * modal does this explicitly on open/close). Real bug fixed here: none
 * of this project's modals did this at all, so the page behind a modal
 * kept scrolling, and on short viewports the modal itself could render
 * partially off-screen with no way to see it was cut off.
 */
export function useBodyScrollLock(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);
}
