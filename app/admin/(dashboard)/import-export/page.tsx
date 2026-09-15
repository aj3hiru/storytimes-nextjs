import { ExportPanel } from "@/components/admin/ExportPanel";
import { BulkImportPanel } from "@/components/admin/BulkImportPanel";

/**
 * Full parity rebuild of admin/import-export.php: category-filtered ZIP
 * export of Posts, one-click ZIP export of all Pages, and ZIP import with
 * per-slug conflict resolution (skip / replace / keep both). See
 * lib/postExportImport.ts for the port of the underlying PHP logic.
 */
export default function ImportExportPage() {
  return (
    <div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <ExportPanel />
        <BulkImportPanel />
      </div>
    </div>
  );
}
