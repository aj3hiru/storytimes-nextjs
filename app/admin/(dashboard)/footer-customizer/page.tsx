import { getFooterSettings } from "@/lib/footer";
import { FooterEditor } from "@/components/admin/FooterEditor";

export default async function FooterCustomizerPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string }>;
}) {
  const { success } = await searchParams;
  const footer = await getFooterSettings();

  return (
    <div>
      <div className="toolbar">
        <h2 className="toolbar-title">Footer</h2>
      </div>

      <div className="alert alert-info" style={{ marginBottom: "1.5rem" }}>
        <i className="fas fa-info-circle" /> Footer colors (purple background) are fixed in code to
        match your latest design update, not editable here — only content (newsletter, brand,
        link groups, copyright) is configurable.
      </div>

      {success && (
        <div className="alert alert-success">
          <i className="fas fa-check-circle" /> Footer settings saved!
        </div>
      )}

      <FooterEditor initial={footer} />
    </div>
  );
}
