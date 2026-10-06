import "./site.css";
import "./post.css";
import { HeaderSwitcher } from "@/components/layout/header/HeaderSwitcher";
import { Footer } from "@/components/layout/Footer";
import { AdminBar } from "@/components/AdminBar";
import { NativeNavigation } from "@/components/NativeNavigation";
import { AdminHtml } from "@/components/AdminHtml";
import { getCodeSnippets } from "@/lib/codeSnippets";
import { getAdInserterConfig } from "@/lib/adInserterSettings";

const SPECULATION_RULES = JSON.stringify({
  prefetch: [
    {
      source: "document",
      where: {
        and: [
          { href_matches: "/*" },
          { not: { href_matches: "/admin*" } },
          { not: { href_matches: "/api/*" } },
          { not: { href_matches: "/*.xml" } },
          { not: { selector_matches: "[rel~=nofollow], [target=_blank], [download]" } },
        ],
      },
      eagerness: "moderate",
    },
  ],
});

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
      {/* Makes internal links do real document navigations, so the
          BROWSER's own loading indicator appears — see NativeNavigation.
          The previous custom progress bar is gone; it rendered as a second
          bar below the browser's own and wasn't what was wanted. */}
      <NativeNavigation />
      {/* Load the next page while the reader is about to click (hover, touch, or a link sitting on
          screen) so it opens straight from memory. Prefetch only, never prerender — a prerendered
          page would run ad scripts for a page nobody looked at. */}
      <script type="speculationrules" dangerouslySetInnerHTML={{ __html: SPECULATION_RULES }} />
      <AdminBar />
      {/* 'header' snippet: ideally <head>, but Next.js App Router only lets
          the root layout render real <head> tags. Script tags (the
          overwhelming majority of real-world use here — GA, verification
          tags) execute correctly from anywhere in the document; <meta>/
          <link> tags placed here won't behave as if they were in <head>.
          Real critical bug fixed here: raw dangerouslySetInnerHTML NEVER
          executes <script> tags — a browser DOM-spec rule, not a React
          limitation. Every Code Snippets field and Ad Inserter's global
          header/footer are saved specifically to run script tags (GA/
          GTM/verification/ad code) — they were being saved correctly and
          rendered into the page's real HTML, but silently never actually
          running at all. AdminHtml re-creates each <script> tag after
          mount (browsers DO execute scripts created that way), fixing
          this everywhere admin-saved HTML mixes into a real page. */}
      {snippets.header && <AdminHtml html={snippets.header} className="admin-snippet-slot" />}
      {ads.globalHeader && <AdminHtml html={ads.globalHeader} className="ad-slot ad-slot--global-header" allowFrame />}
      <HeaderSwitcher />
      {/* 'body' snippet — matches components/header.php echoing $_cs['body']
          right after the header markup. */}
      {snippets.body && <AdminHtml html={snippets.body} className="admin-snippet-slot" />}
      {children}
      {ads.globalFooter && <AdminHtml html={ads.globalFooter} className="ad-slot ad-slot--global-footer" allowFrame />}
      <Footer />
      {/* 'footer' snippet — matches components/footer.php echoing
          $_cs['footer'] at the very end of the page. */}
      {snippets.footer && <AdminHtml html={snippets.footer} className="admin-snippet-slot" />}
    </>
  );
}
