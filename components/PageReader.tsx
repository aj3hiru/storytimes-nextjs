import { notFound } from "next/navigation";
import type { Metadata } from "next";
import "@/app/(public)/post.css";
import { getPublishedPageBySlug } from "@/lib/pages";
import { resolveSiteConfig } from "@/lib/config";
import { AdminHtml } from "@/components/AdminHtml";
import { ListingAds } from "@/components/shared/ListingAds";

export async function buildPageMetadata(slug: string): Promise<Metadata> {
  const page = await getPublishedPageBySlug(slug);
  if (!page) return {};
  const siteConfig = await resolveSiteConfig("");
  return {
    title: page.metaTitle || `${page.title} | ${siteConfig.siteName}`,
    description: page.metaDescription || undefined,
  };
}

export async function PageReader({ slug, preview = false }: { slug: string; preview?: boolean }) {
  const page = await getPublishedPageBySlug(slug, preview);
  if (!page) notFound();

  return (
    <main className="pst-wrap">
      {preview && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, background: "#7c3aed", color: "#fff", textAlign: "center", padding: "8px", fontSize: "14px", fontWeight: 600, zIndex: 9999 }}>
          Preview mode — this page is not live yet
        </div>
      )}
      <h1 className="pst-title">{page.title}</h1>

      <ListingAds page="page" position="before_content" />

      {/* Author-authored HTML from the page editor — same trust model as
          the rest of the CMS's content fields. Uses AdminHtml rather than
          raw dangerouslySetInnerHTML: this was the one remaining place
          still carrying the Phase 85 bug, where a <script> tag inside
          saved content renders into the DOM but is never executed by any
          browser. Static pages can legitimately contain embeds, so they
          need the same treatment every other content surface already got. */}
      <AdminHtml html={page.content ?? ""} className="entry-content" />

      <ListingAds page="page" position="after_content" />
    </main>
  );
}
