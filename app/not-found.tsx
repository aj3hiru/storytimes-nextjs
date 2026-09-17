import Link from "next/link";
import { redirect } from "next/navigation";
import { getPostTemplateSettings } from "@/lib/postTemplateSettings";

/**
 * New feature, no PHP equivalent — per explicit request: an admin toggle
 * (Post Template → 404 Redirect) that sends every visitor who lands on a
 * missing page to a chosen URL instead of seeing a "page not found"
 * screen at all. Next.js renders this file — the App Router's dedicated
 * global not-found page — both when a route genuinely doesn't match
 * anything, and whenever any page explicitly calls `notFound()` (as
 * PostReader.tsx already does for an unpublished/missing post or an
 * out-of-range chapter number), so this one place covers both cases.
 *
 * The URL is validated again here, not just trusted from what was saved
 * (see postTemplateAdmin.ts's own validation) — belt-and-suspenders,
 * since a redirect() call with a malformed target would throw on every
 * single 404 across the whole site, the worst possible place for an
 * unvalidated value to cause a crash.
 */
export default async function NotFound() {
  const pt = await getPostTemplateSettings();

  if (pt.redirect_404_enabled && pt.redirect_404_url) {
    const url = pt.redirect_404_url;
    const isSafe = url.startsWith("/") || /^https?:\/\//i.test(url);
    if (isSafe) redirect(url);
  }

  return (
    <div style={{ minHeight: "70vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "2rem" }}>
      <h1 style={{ fontSize: "clamp(3rem, 8vw, 5rem)", fontWeight: 800, margin: 0, lineHeight: 1 }}>404</h1>
      <p style={{ fontSize: "1.125rem", color: "#6b7280", margin: "0.75rem 0 1.5rem" }}>
        This page doesn&apos;t exist, or has been moved.
      </p>
      <Link
        href="/"
        style={{ padding: "0.65rem 1.5rem", borderRadius: "0.5rem", background: "#7c3aed", color: "#fff", fontWeight: 600, textDecoration: "none" }}
      >
        Go to Homepage
      </Link>
    </div>
  );
}
