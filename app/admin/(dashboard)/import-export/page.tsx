import { BulkImportPanel } from "@/components/admin/BulkImportPanel";

export default function ImportExportPage() {
  return (
    <div>
      <div className="toolbar">
        <h2 className="toolbar-title">Import &amp; Export</h2>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div className="card" style={{ padding: "1.5rem" }}>
          <h3 style={{ marginBottom: "1rem" }}>Export Posts (CSV)</h3>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download, not page navigation */}
          <a href="/api/admin/export-posts" className="btn btn-primary">
            <i className="fas fa-file-csv" /> Download CSV
          </a>
        </div>

        <BulkImportPanel />
      </div>
    </div>
  );
}
