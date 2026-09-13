import { notFound } from "next/navigation";
import "@/app/(public)/site.css";
import "@/app/(public)/post.css";
import { prisma } from "@/lib/db";
import { PostReader } from "@/components/post/PostReader";
import { PageReader } from "@/components/PageReader";
import { HeaderSwitcher } from "@/components/layout/header/HeaderSwitcher";
import { Footer } from "@/components/layout/Footer";

/**
 * Real bug fixed here: this route lives under /admin/* (not inside the
 * (public) route group), so it never inherited app/(public)/layout.tsx
 * at all — meaning the site's own header/nav and footer were completely
 * missing from every draft preview, which just rendered the bare post/
 * page content with no site chrome around it. Explicitly rendering the
 * same HeaderSwitcher/Footer the public layout uses (both self-contained
 * — no props needed) fixes this without duplicating that layout's other
 * responsibilities (code snippets, ad slots, the staff AdminBar) that
 * aren't relevant to a draft-preview-only page.
 */
export default async function DraftPreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!slug) notFound();

  // Ports draft.php's lookup order: try posts first, then pages, 404 if
  // neither matches — auth for this whole /admin/* segment is already
  // enforced by app/admin/layout.tsx (equivalent to require_login.php).
  const post = await prisma.post.findFirst({ where: { slug }, select: { id: true } });
  if (post) {
    return (
      <>
        <HeaderSwitcher />
        <PostReader slug={slug} chapter={0} preview />
        <Footer />
      </>
    );
  }

  const page = await prisma.page.findFirst({ where: { slug }, select: { id: true } });
  if (page) {
    return (
      <>
        <HeaderSwitcher />
        <PageReader slug={slug} preview />
        <Footer />
      </>
    );
  }

  notFound();
}
