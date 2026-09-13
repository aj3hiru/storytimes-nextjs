"use client";

import { useEffect } from "react";

/**
 * Real bug fixed here: multiple modals can be locked at once (e.g. the
 * FB Description "eye" button's AssetViewModal opens WHILE its parent
 * CopyLinksPanel's own lock condition — `modalOpen || assetModal !==
 * null` — is also still true), each independently calling this hook.
 * The previous version saved/restored a single captured "previous
 * value" per call — with two nested locks, the INNER one captures
 * "hidden" (already set by the outer one) as its own "previous" value,
 * so closing just the inner modal could restore straight back to
 * "hidden" instead of unlocking, leaving scroll stuck locked even
 * though every modal LOOKS closed. A module-level reference count
 * fixes this class of bug entirely regardless of how many modals are
 * open or the order they close in: the lock is only ever actually
 * removed when the count returns to zero.
 */
let lockCount = 0;

function acquireLock() {
  if (lockCount === 0) {
    document.documentElement.style.overflowY = "hidden";
  }
  lockCount++;
}

function releaseLock() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0) {
    document.documentElement.style.overflowY = "";
  }
}

export function useBodyScrollLock(open: boolean) {
  useEffect(() => {
    if (!open) return;
    acquireLock();
    return () => {
      releaseLock();
    };
  }, [open]);
}
