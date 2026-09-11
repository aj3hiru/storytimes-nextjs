import type { Metadata } from "next";
import { PostReader, buildPostMetadata } from "@/components/post/PostReader";
import { prisma } from "@/lib/db";

// ISR: serve a cached copy for up to 60s, regenerating in the background
// after that (stale-while-revalidate) — this is what keeps post pages
// loading in milliseconds regardless of how much concurrent AI-generation
// write load is happening elsewhere. `lib/postEditor.ts` also calls
// revalidatePath() on publish/update so changes show up immediately
// instead of waiting out the full 60s window.
export const revalidate = 60;

/**
 * Pre-renders every published post as a static file AT BUILD TIME — this
 * is what makes the very FIRST visitor to any existing post get a
 * millisecond response instead of waiting for a cold SSR render: there's
 * no database query on that request at all, Next.js just serves the
 * already-built HTML. Posts created after the build (dynamicParams
 * defaults to true) still render on-demand for their first visitor, then
 * join the same cached-and-fast pool — see the cache-warming call in
 * lib/postEditor.ts for how even THAT first-visitor gap gets closed.
 */
export async function generateStaticParams() {
  const posts = await prisma.post.findMany({
    where: { status: "published" },
    select: { slug: true },
  });
  return posts.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return buildPostMetadata(slug, 0);
}

export default async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PostReader slug={slug} chapter={0} />;
}
