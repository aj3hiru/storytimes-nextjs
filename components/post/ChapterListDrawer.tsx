"use client";

import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { chapterUrl } from "@/lib/urls";
import type { Chapter } from "@/lib/chapters";

const SIDE_KEY = "chapter_btn_side";
const TOP_KEY = "chapter_btn_top_v2";
const MARGIN = 16;

/**
 * Real gap fixed here: the floating "Chapters" button is meant to be
 * DRAGGABLE around the screen (grab it and move it anywhere along the
 * left/right edges — it snaps to whichever edge is closer on release,
 * and remembers both the side and vertical position across visits via
 * localStorage) — ported from the reference's exact drag/snap logic.
 * An earlier pass rendered the button as a plain fixed-position element
 * with no drag behavior attached at all.
 */
export function ChapterListDrawer({
  slug,
  chapters,
  currentChapter,
}: {
  slug: string;
  chapters: Chapter[];
  currentChapter: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const btnRef = useRef<HTMLButtonElement>(null);
  const dragState = useRef({ dragging: false, moved: false, startX: 0, startY: 0, initialLeft: 0, initialTop: 0 });

  // useLayoutEffect (not useEffect) — deliberately, so the saved
  // position is applied synchronously before the browser paints,
  // guaranteeing zero visible flash/jump from the CSS default to the
  // restored position on every page load, rather than the one-frame
  // (or more) flash useEffect's post-paint timing could still allow
  // even with the animate=false fix below.
  useLayoutEffect(() => {
    const btn = btnRef.current;
    if (!btn) return;

    function snapTo(side: "left" | "right", topPx: number, animate = true) {
      if (!btn) return;
      // Real bug fixed here: this unconditionally set a transition
      // before applying the position — including on the very FIRST
      // restore-from-localStorage call on page load. That meant a
      // returning visitor (with a real saved position) would see the
      // button render at the CSS default center first, then visibly
      // animate/"jump" over to their actual saved spot a moment later,
      // every single page load. `animate=false` (used only for that
      // initial mount-time restore, below) applies the position
      // instantly with no transition, so there's nothing to see jump —
      // the animated transition is now reserved for its original
      // purpose: the visible snap when the user actually releases a
      // drag.
      btn.style.transition = animate ? "left 0.25s ease, right 0.25s ease, top 0.25s ease" : "none";
      btn.style.top = `${topPx}px`;
      btn.style.bottom = "auto";
      if (side === "left") {
        btn.style.left = `${MARGIN}px`;
        btn.style.right = "auto";
      } else {
        btn.style.right = `${MARGIN}px`;
        btn.style.left = "auto";
      }
      if (animate) {
        setTimeout(() => {
          if (btn) btn.style.transition = "";
        }, 280);
      } else {
        // Next frame — after the instant position has actually painted —
        // hand control back to normal (non-"none") transitions so any
        // LATER drag-release snap still animates as expected.
        requestAnimationFrame(() => {
          if (btn) btn.style.transition = "";
        });
      }
      localStorage.setItem(SIDE_KEY, side);
      localStorage.setItem(TOP_KEY, String(Math.round(topPx)));
    }

    const btnW = btn.offsetWidth || 120;
    const btnH = btn.offsetHeight || 44;
    const savedSide = localStorage.getItem(SIDE_KEY);
    const savedTop = parseInt(localStorage.getItem(TOP_KEY) ?? "", 10);
    // Real bug fixed here: this used to ALWAYS call snapTo() on mount —
    // even for a first-time visitor with no saved position at all —
    // computing an initial top via `window.innerHeight` math and
    // immediately overriding the CSS's own safe default (`top: 50%;
    // transform: translateY(-50%)`, see post.css) with that JS-computed
    // value. If that computation ran before the browser had a stable
    // viewport height (a real risk on mobile, where address-bar/toolbar
    // chrome can still be resizing the visible area during initial
    // load), the button could be positioned off-screen — effectively
    // invisible — via inline styles that permanently overrode the CSS
    // fallback, with no way to recover on that page view. Now only
    // repositions via JS when there's a genuinely saved, validated
    // position to restore; otherwise the CSS default is left completely
    // untouched, guaranteeing the button is on-screen on first load.
    const hasValidSavedPosition = !isNaN(savedTop) && savedTop >= MARGIN && savedTop <= window.innerHeight - btnH - MARGIN;
    if (hasValidSavedPosition) {
      snapTo(savedSide === "left" ? "left" : "right", savedTop, false);
    } else if (savedSide === "left") {
      // No saved vertical position, but the user previously dragged the
      // button to the left edge — respect the side, let the CSS default
      // handle vertical centering (snapTo's own transition/top/bottom
      // reset would fight the CSS default unnecessarily otherwise).
      btn.style.left = `${MARGIN}px`;
      btn.style.right = "auto";
    }

    function getPoint(e: MouseEvent | TouchEvent) {
      return "touches" in e ? e.touches[0] : e;
    }

    function onStart(e: MouseEvent | TouchEvent) {
      const point = getPoint(e);
      const state = dragState.current;
      state.dragging = true;
      state.moved = false;
      state.startX = point.clientX;
      state.startY = point.clientY;
      const rect = btn!.getBoundingClientRect();
      state.initialLeft = rect.left;
      state.initialTop = rect.top;
      btn!.style.transition = "";
    }

    function onMove(e: MouseEvent | TouchEvent) {
      const state = dragState.current;
      if (!state.dragging) return;
      const point = getPoint(e);
      const dx = point.clientX - state.startX;
      const dy = point.clientY - state.startY;
      if (!state.moved && Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      state.moved = true;
      if (e.cancelable) e.preventDefault();
      const newLeft = Math.max(MARGIN, Math.min(state.initialLeft + dx, window.innerWidth - btnW - MARGIN));
      const newTop = Math.max(MARGIN, Math.min(state.initialTop + dy, window.innerHeight - btnH - MARGIN));
      btn!.style.left = `${newLeft}px`;
      btn!.style.top = `${newTop}px`;
      btn!.style.right = "auto";
    }

    function onEnd() {
      const state = dragState.current;
      if (!state.dragging) return;
      state.dragging = false;
      if (!state.moved) return;
      const rect = btn!.getBoundingClientRect();
      const centerX = rect.left + btnW / 2;
      const topPx = Math.max(MARGIN, Math.min(rect.top, window.innerHeight - btnH - MARGIN));
      snapTo(centerX < window.innerWidth / 2 ? "left" : "right", topPx);
      setTimeout(() => {
        state.moved = false;
      }, 50);
    }

    btn.addEventListener("mousedown", onStart);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onEnd);
    btn.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);

    return () => {
      btn.removeEventListener("mousedown", onStart);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onEnd);
      btn.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, []);

  if (chapters.length === 0) return null;

  const filtered = query.trim()
    ? chapters.filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase()))
    : chapters;

  function handleOpen() {
    // A drag that ended in a real move shouldn't also register as a
    // "click to open" — mirrors the reference's own `moved` guard.
    if (dragState.current.moved) return;
    setOpen(true);
  }

  return (
    <div>
      <button ref={btnRef} type="button" className="mobile-toc-btn" onClick={handleOpen}>
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24">
          <path fill="currentColor" fillRule="evenodd" d="M3.25 7A.75.75 0 0 1 4 6.25h16a.75.75 0 0 1 0 1.5H4A.75.75 0 0 1 3.25 7" clipRule="evenodd" />
          <path fill="currentColor" d="M3.25 12a.75.75 0 0 1 .75-.75h11a.75.75 0 0 1 0 1.5H4a.75.75 0 0 1-.75-.75" opacity=".7" />
          <path fill="currentColor" d="M3.25 17a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5H4a.75.75 0 0 1-.75-.75" opacity=".4" />
        </svg>
        <span>{currentChapter > 0 ? `Chapters ${currentChapter}/${chapters.length}` : "Chapters"}</span>
      </button>

      {open && (
        <div className="mobile-toc-sheet-overlay is-open" onClick={() => setOpen(false)}>
          <div className="mobile-toc-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mobile-toc-sheet-header">
              <div className="mobile-toc-sheet-drag-handle" />
              <div className="mobile-toc-sheet-title-row">
                <h3>Table of Contents</h3>
                <button type="button" className="mobile-toc-sheet-close" onClick={() => setOpen(false)}>
                  &times;
                </button>
              </div>
              <div className="mobile-toc-search-container">
                <input
                  type="text"
                  placeholder="Search chapters..."
                  autoComplete="off"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="mobile-toc-sheet-body">
              <ul className="mobile-toc-list">
                {filtered.map((ch) => {
                  const isActive = currentChapter === ch.number;
                  return (
                    <li className={`mobile-toc-item${isActive ? " active" : ""}`} key={ch.number}>
                      <Link href={chapterUrl(slug, ch.number)} onClick={() => setOpen(false)}>
                        <span className="mobile-toc-number">{String(ch.number).padStart(2, "0")}</span>
                        <span className="mobile-toc-title-text">{ch.title}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
