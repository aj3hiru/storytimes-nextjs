import { guardPage } from "@/lib/pageGuard";
import { getFooterSettings } from "@/lib/footer";
import { resolveSiteConfig } from "@/lib/config";
import { FooterEditor } from "@/components/admin/FooterEditor";

export default async function FooterCustomizerPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  // Direct-URL access guard — see lib/pageGuard.tsx.
  const denied = await guardPage((p) => p.settings.general, "Only users with Settings access can customize the footer.");
  if (denied) return denied;

  const { success } = await searchParams;
  const [footer, siteConfig] = await Promise.all([getFooterSettings(), resolveSiteConfig("")]);

  return (
    <div>

      {success && (
        <div className="alert alert-success">
          <i className="fas fa-check-circle" /> Footer settings saved!
        </div>
      )}

      <FooterEditor initial={footer} siteName={siteConfig.siteName} />
    </div>
  );
}
