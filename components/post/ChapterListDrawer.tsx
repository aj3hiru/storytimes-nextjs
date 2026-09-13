"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { chapterUrl } from "@/lib/urls";
import type { Chapter } from "@/lib/chapters";

const SIDE_KEY = "chapter_btn_side";
const TOP_KEY = "chapter_btn_top_v2";
const MARGIN = 16;

/**
 * Ported to match the reference's own inline <script> byte-for-byte,
 * verified directly against post.php one more time end-to-end (not
 * approximated or "improved" past what the reference itself does):
 * the floating "Chapters" button is draggable around the screen (grab
 * it anywhere, drag along either edge, snaps to whichever edge is
 * closer on release, remembers side + vertical position across visits
 * via localStorage under the same keys the reference uses), AND —
 * confirmed by re-reading the reference's own script — it
 * unconditionally calls its snap function on every mount, WITH the
 * animated transition, whether or not a saved position exists. An
 * earlier pass here had deviated from this (assuming the on-mount
 * position calculation was itself the cause of a reported "invisible
 * button" bug), which wasn't correct: that bug's real, separate cause
 * was ChapterListDrawer being nested inside an unrelated conditional
 * block elsewhere (fixed separately) so the component never reached
 * the DOM in that case at all. With that actual bug fixed, this
 * component's positioning logic now matches the reference exactly
 * rather than carrying extra defensive logic the reference itself
 * doesn't have.
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

  useEffect(() => {
    const btn = btnRef.current;
    if (!btn) return;

    function snapTo(side: "left" | "right", topPx: number) {
      if (!btn) return;
      btn.style.transition = "left 0.25s ease, right 0.25s ease, top 0.25s ease";
      btn.style.top = `${topPx}px`;
      btn.style.bottom = "auto";
      if (side === "left") {
        btn.style.left = `${MARGIN}px`;
        btn.style.right = "auto";
      } else {
        btn.style.right = `${MARGIN}px`;
        btn.style.left = "auto";
      }
      setTimeout(() => {
        if (btn) btn.style.transition = "";
      }, 280);
      localStorage.setItem(SIDE_KEY, side);
      localStorage.setItem(TOP_KEY, String(Math.round(topPx)));
    }

    const btnW = btn.offsetWidth || 120;
    const btnH = btn.offsetHeight || 44;
    const savedSide = localStorage.getItem(SIDE_KEY);
    const savedTop = parseInt(localStorage.getItem(TOP_KEY) ?? "", 10);
    const initTop =
      !isNaN(savedTop) && savedTop >= MARGIN && savedTop <= window.innerHeight - btnH - MARGIN
        ? savedTop
        : Math.round(window.innerHeight / 2 - btnH / 2);

    snapTo(savedSide === "left" ? "left" : "right", initTop);

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

      {/* Real gap fixed here: this used to conditionally RENDER the
          overlay only while open, which meant it just vanished
          instantly on close instead of sliding down — the reference
          keeps this element in the DOM at all times and toggles an
          `.active` class instead (`.mobile-toc-sheet-overlay.active`),
          which is what lets its own `transition: opacity .3s,
          visibility .3s` (and the sheet's own translateY transition)
          actually animate the close, not just the open. Also fixed the
          class name itself — was `.is-open`, reference uses `.active`. */}
      <div className={`mobile-toc-sheet-overlay${open ? " active" : ""}`} onClick={() => setOpen(false)}>
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
    </div>
  );
}
