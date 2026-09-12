import { notFound } from "next/navigation";
import "@/app/(public)/site.css";
import "@/app/(public)/post.css";
import { prisma } from "@/lib/db";
import { PostReader } from "@/components/post/PostReader";
import { PageReader } from "@/components/PageReader";

export default async function DraftPreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slug) notFound();

  // Ports draft.php's lookup order: try posts first, then pages, 404 if
  // neither matches — auth for this whole /admin/* segment is already
  // enforced by app/admin/layout.tsx (equivalent to require_login.php).
  const post = await prisma.post.findFirst({ where: { slug }, select: { id: true } });
  if (post) {
    return <PostReader slug={slug} chapter={0} preview />;
  }

  const page = await prisma.page.findFirst({ where: { slug }, select: { id: true } });
  if (page) {
    return <PageReader slug={slug} preview />;
  }

  notFound();
}
