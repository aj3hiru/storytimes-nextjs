import Link from "next/link";
import { postUrl, chapterUrl } from "@/lib/urls";
import type { Chapter } from "@/lib/chapters";

/**
 * Real gap fixed here: the reference's post page shows a persistent
 * desktop Table-of-Contents widget in the sidebar (visible at ≥1200px
 * — the mobile floating "Chapters" button takes over below that, see
 * post.css's matching breakpoints) — this was missing entirely, with
 * only the mobile drawer (ChapterListDrawer.tsx) implemented.
 */
export function DesktopTocSidebar({
  slug,
  title,
  chapters,
  currentChapter,
}: {
  slug: string;
  title: string;
  chapters: Chapter[];
  currentChapter: number;
}) {
  if (chapters.length === 0) return null;

  return (
    <div className="toc-desktop">
      <div className="toc-desktop-header">
        <Link href={postUrl(slug)} className="toc-desktop-header-link">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24">
            <path fill="currentColor" fillRule="evenodd" d="M3.25 7A.75.75 0 0 1 4 6.25h16a.75.75 0 0 1 0 1.5H4A.75.75 0 0 1 3.25 7" clipRule="evenodd" />
            <path fill="currentColor" d="M3.25 12a.75.75 0 0 1 .75-.75h11a.75.75 0 0 1 0 1.5H4a.75.75 0 0 1-.75-.75" opacity=".7" />
            <path fill="currentColor" d="M3.25 17a.75.75 0 0 1 .75-.75h5a.75.75 0 0 1 0 1.5H4a.75.75 0 0 1-.75-.75" opacity=".4" />
          </svg>
          <span className="toc-desktop-title-text">{title}</span>
        </Link>
      </div>
      <div className="toc-desktop-title-row">
        <span className="toc-desktop-title">Table of Contents</span>
        <span className="toc-desktop-count">{chapters.length}</span>
      </div>
      <ol className="toc-desktop-list">
        {chapters.map((ch) => {
          const isActive = currentChapter === ch.number;
          return (
            <li className="toc-desktop-item" key={ch.number}>
              <Link href={chapterUrl(slug, ch.number)} className={`toc-desktop-link${isActive ? " active" : ""}`}>
                <span className="toc-desktop-number">{String(ch.number).padStart(2, "0")}</span>
                <span className="toc-desktop-title-text">{ch.title}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
