import Link from "next/link";
import { guardPage } from "@/lib/pageGuard";
import { ExportPanel } from "@/components/admin/ExportPanel";
import { BulkImportPanel } from "@/components/admin/BulkImportPanel";

/** Export posts/pages as ZIP and import them back (here or on another StoryTimes site). */
export default async function ImportExportPage() {
  const denied = await guardPage((p) => p.tools.import_export, "You do not have permission to use Import & Export.");
  if (denied) return denied;

  return (
    <div className="ie-wrap">
      <div className="ie-grid">
        <ExportPanel />
        <BulkImportPanel />
      </div>
      <p className="ie-foot">
        <i className="fas fa-circle-info" /> Need a copy of the whole site (database + all media)? Use{" "}
        <Link href="/admin/backup-restore">Backup &amp; Restore</Link>.
      </p>
    </div>
  );
}
