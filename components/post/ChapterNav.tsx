import Link from "next/link";
import { chapterUrl, postUrl } from "@/lib/urls";
import type { Chapter } from "@/lib/chapters";

const IconChevronLeft = () => (
  <svg className="cnb-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15.75 19.5 8.25 12l7.5-7.5" />
  </svg>
);
const IconChevronRight = () => (
  <svg className="cnb-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m8.25 4.5 7.5 7.5-7.5 7.5" />
  </svg>
);
const IconBook = () => (
  <svg className="cnb-ico" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
  </svg>
);

/**
 * Renders the "Prev Chapter N / Next Chapter N" (or "View Intro" / "End of
 * Story") card row shown below chapter content — 1:1 port of the
 * `$has_chapters && $chapter > 0` branch of post.php's chapter-navigation
 * block, including the exact fallback titles/labels.
 */
export function ChapterNav({
  slug,
  postTitle,
  chapters,
  chapter,
}: {
  slug: string;
  postTitle: string;
  chapters: Chapter[];
  chapter: number;
}) {
  const totalChapters = chapters.length;
  const prevTitle = chapter > 1 ? chapters[chapter - 2]?.title ?? `Chapter ${chapter - 1}` : postTitle;
  const nextTitle = chapter < totalChapters ? chapters[chapter]?.title ?? `Chapter ${chapter + 1}` : "";

  return (
    <nav className="chapter-navigation" aria-label="Chapter navigation">
      <div className="chapter-nav-grid chapter-nav-grid--titled">
        <div className="chapter-nav-cell chapter-nav-cell--prev">
          {chapter > 1 ? (
            <Link href={chapterUrl(slug, chapter - 1)} className="chapter-nav-btn chapter-nav-btn--titled chapter-nav-btn--prev">
              <IconChevronLeft />
              <span className="cnb-col">
                <span className="cnb-label">Prev Chapter {chapter - 1}</span>
                <span className="cnb-title">{prevTitle}</span>
              </span>
            </Link>
          ) : (
            <Link href={postUrl(slug)} className="chapter-nav-btn chapter-nav-btn--titled chapter-nav-btn--prev">
              <IconBook />
              <span className="cnb-col">
                <span className="cnb-label">View Intro</span>
                <span className="cnb-title">{prevTitle}</span>
              </span>
            </Link>
          )}
        </div>
        <div className="chapter-nav-cell chapter-nav-cell--next">
          {chapter < totalChapters ? (
            <Link href={chapterUrl(slug, chapter + 1)} className="chapter-nav-btn chapter-nav-btn--titled chapter-nav-btn--next">
              <span className="cnb-col cnb-col--right">
                <span className="cnb-label">Next Chapter {chapter + 1}</span>
                <span className="cnb-title">{nextTitle}</span>
              </span>
              <IconChevronRight />
            </Link>
          ) : (
            <span className="chapter-nav-btn chapter-nav-btn--titled disabled-btn chapter-nav-cell--next">
              <span className="cnb-col cnb-col--right">
                <span className="cnb-label">End of Story</span>
                <span className="cnb-title">Thanks for reading!</span>
              </span>
            </span>
          )}
        </div>
      </div>
    </nav>
  );
}

/**
 * Renders on the intro page (chapter 0) when the admin's post-template
 * setting `read_from_start` is on — shows "Start Reading" links into
 * chapter 1 (and a preview of chapter 2 if it exists).
 */
export function ChapterStartNav({
  slug,
  chapters,
}: {
  slug: string;
  chapters: Chapter[];
}) {
  if (chapters.length === 0) return null;
  const firstTitle = chapters[0]?.title ?? "Chapter 1";
  const secondTitle = chapters[1]?.title ?? "Chapter 2";
  const hasSecond = chapters.length >= 2;

  return (
    <nav className="chapter-navigation" aria-label="Start reading">
      <div className={`chapter-nav-grid chapter-nav-grid--titled${hasSecond ? "" : " chapter-nav-grid--single"}`}>
        <div className="chapter-nav-cell chapter-nav-cell--prev">
          <Link href={chapterUrl(slug, 1)} className="chapter-nav-btn chapter-nav-btn--titled chapter-nav-btn--prev">
            <span className="cnb-col">
              <span className="cnb-label">Start Reading</span>
              <span className="cnb-title">{firstTitle}</span>
            </span>
          </Link>
        </div>
        {hasSecond && (
          <div className="chapter-nav-cell chapter-nav-cell--next">
            <Link href={chapterUrl(slug, 2)} className="chapter-nav-btn chapter-nav-btn--titled chapter-nav-btn--next">
              <span className="cnb-col cnb-col--right">
                <span className="cnb-label">Chapter 2</span>
                <span className="cnb-title">{secondTitle}</span>
              </span>
              <IconChevronRight />
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
