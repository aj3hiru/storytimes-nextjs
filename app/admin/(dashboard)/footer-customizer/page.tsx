import { getFooterSettings } from "@/lib/footer";
import { resolveSiteConfig } from "@/lib/config";
import { FooterEditor } from "@/components/admin/FooterEditor";

export default async function FooterCustomizerPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
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
