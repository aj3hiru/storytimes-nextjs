import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PostReader, buildPostMetadata } from "@/components/post/PostReader";
import { prisma } from "@/lib/db";
import { parseChaptersFromContent } from "@/lib/chapters";

// See app/(public)/[slug]/page.tsx for why this is cached — same reasoning.
export const revalidate = 60;

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
