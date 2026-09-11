"use client";

import { useState } from "react";
import Link from "next/link";
import { chapterUrl } from "@/lib/urls";
import type { Chapter } from "@/lib/chapters";

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

  if (chapters.length === 0) return null;

  const filtered = query.trim()
    ? chapters.filter((c) => c.title.toLowerCase().includes(query.trim().toLowerCase()))
    : chapters;

  return (
    <div>
      <button type="button" className="mobile-toc-btn" onClick={() => setOpen(true)}>
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
