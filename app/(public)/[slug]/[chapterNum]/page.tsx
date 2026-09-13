import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostReader, buildPostMetadata } from "@/components/post/PostReader";
import { prisma } from "@/lib/db";
import { parseChaptersFromContent } from "@/lib/chapters";

// See app/(public)/[slug]/page.tsx for why this is cached — same reasoning.
export const revalidate = 60;

/**
 * Real bug fixed here — the actual root cause of every chapter URL
 * 404ing despite looking correct in the address bar: this route used
 * to live at the folder path `[slug]/chapter-[chapterNum]/page.tsx` —
 * with the literal string "chapter-" baked directly INTO the folder
 * name, immediately followed by the dynamic segment. In that setup,
 * Next.js treats "chapter-" as a literal prefix it matches and STRIPS
 * from the URL before populating the dynamic param — so for the URL
 * `/chapter-1`, the `chapterNum` param Next.js actually handed to this
 * page was just `"1"`, not `"chapter-1"`.
 *
 * But `parseChapterParam()` below expects to receive the FULL string
 * `"chapter-1"` (matching `/^chapter-(\d+)$/`) — so with the literal
 * prefix silently already stripped by the folder-naming convention,
 * that regex could never match anything Next.js actually passed in,
 * and this page 404'd on every single request, no matter how correct
 * the URL looked. `generateStaticParams()` had the exact same blind
 * spot in the other direction: it explicitly returned
 * `chapterNum: "chapter-N"` (the full prefixed string) as the value
 * for the dynamic segment — which, combined with the FOLDER's own
 * literal "chapter-" prefix, built static paths shaped like
 * `/chapter-chapter-N` internally, matching neither the real URLs
 * users click nor what the runtime parser expected either.
 *
 * Fixed by moving this whole route to a plain `[chapterNum]` folder
 * (no literal prefix baked into the folder name at all) — the dynamic
 * segment now correctly receives the FULL raw URL segment
 * (`"chapter-1"`), which is exactly what `parseChapterParam()` and
 * `generateStaticParams()` already, correctly, assumed all along. No
 * change needed to either function's own logic — only to where the
 * folder lived relative to that literal prefix.
 */
function parseChapterParam(chapterNum: string): number | null {
  const match = /^chapter-(\d+)$/.exec(chapterNum);
  if (!match) return null;
  return parseInt(match[1], 10);
}

/**
 * Pre-renders every existing chapter of every published post at build
 * time — same "millisecond first load" reasoning as the intro-page route.
 * Each post's chapter count comes from parsing its content (chapters
 * aren't a separate DB table — see lib/chapters.ts), so this does one
 * pass over every published post's content at build time; a one-time
 * cost in exchange for zero-DB-query responses afterward.
 */
export async function generateStaticParams() {
  const posts = await prisma.post.findMany({
    where: { status: "published" },
    select: { slug: true, content: true },
  });

  const params: { slug: string; chapterNum: string }[] = [];
  for (const post of posts) {
    const { total } = parseChaptersFromContent(post.content);
    for (let i = 1; i <= total; i++) {
      params.push({ slug: post.slug, chapterNum: `chapter-${i}` });
    }
  }
  return params;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; chapterNum: string }>;
}): Promise<Metadata> {
  const { slug, chapterNum } = await params;
  const chapter = parseChapterParam(chapterNum);
  if (chapter === null) return {};
  return buildPostMetadata(slug, chapter);
}

export default async function ChapterPage({
  params,
}: {
  params: Promise<{ slug: string; chapterNum: string }>;
}) {
  const { slug, chapterNum } = await params;
  const chapter = parseChapterParam(chapterNum);
  if (chapter === null || chapter < 1) notFound();
  return <PostReader slug={slug} chapter={chapter} />;
}
