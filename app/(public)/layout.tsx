import "./site.css";
import { HeaderSwitcher } from "@/components/layout/header/HeaderSwitcher";
import { Footer } from "@/components/layout/Footer";
import { AdminBar } from "@/components/AdminBar";
import { getCodeSnippets } from "@/lib/codeSnippets";
import { getAdInserterConfig } from "@/lib/adInserterSettings";

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [snippets, ads] = await Promise.all([getCodeSnippets(), getAdInserterConfig()]);

  return (
    <>
      {/* Floating staff toolbar — ports the `if (!empty($_SESSION['user_id']))`
          admin-bar check at the top of the original components/header.php.
          IMPORTANT: this is a client component that fetches its own
          session state AFTER the page loads (see AdminBar.tsx), rather
          than checking auth here in the layout. This page is ISR-cached
          (see `export const revalidate` on the post/homepage/category
          routes) so every visitor gets the same cached HTML for
          millisecond loads — if this layout checked auth itself, the
          cached HTML would bake in whichever visitor happened to trigger
          that cache generation (showing a random staff member's admin
          bar to the public, or vice versa). Self-fetching keeps the
          cached page identical for everyone while still layering the bar
          in for staff. */}
      <AdminBar />
      {/* 'header' snippet: ideally <head>, but Next.js App Router only lets
          the root layout render real <head> tags. Script tags (the
          overwhelming majority of real-world use here — GA, verification
          tags) execute correctly from anywhere in the document; <meta>/
          <link> tags placed here won't behave as if they were in <head>. */}
      {snippets.header && (
        <div dangerouslySetInnerHTML={{ __html: snippets.header }} />
      )}
      {ads.globalHeader && (
        <div className="ad-slot ad-slot--global-header" dangerouslySetInnerHTML={{ __html: ads.globalHeader }} />
      )}
      <HeaderSwitcher />
      {/* 'body' snippet — matches components/header.php echoing $_cs['body']
          right after the header markup. */}
      {snippets.body && (
        <div dangerouslySetInnerHTML={{ __html: snippets.body }} />
      )}
      {children}
      {ads.globalFooter && (
        <div className="ad-slot ad-slot--global-footer" dangerouslySetInnerHTML={{ __html: ads.globalFooter }} />
      )}
      <Footer />
      {/* 'footer' snippet — matches components/footer.php echoing
          $_cs['footer'] at the very end of the page. */}
      {snippets.footer && (
        <div dangerouslySetInnerHTML={{ __html: snippets.footer }} />
      )}
    </>
  );
}
