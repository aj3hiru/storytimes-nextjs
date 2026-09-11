import { RestorePanel } from "@/components/admin/RestorePanel";

export default function BackupRestorePage() {
  return (
    <div>
      <div className="toolbar">
        <h2 className="toolbar-title">Backup &amp; Restore</h2>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <div className="card" style={{ padding: "1.5rem" }}>
          <h3 style={{ marginBottom: "1rem" }}>Export</h3>
          <p style={{ color: "var(--gray-600)", fontSize: "0.875rem", marginBottom: "1rem" }}>
            Downloads posts, categories, tags, authors, pages, and settings as JSON.
          </p>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- file download, not page navigation */}
          <a href="/api/admin/backup" className="btn btn-primary">
            <i className="fas fa-download" /> Download JSON Backup
          </a>
        </div>

        <RestorePanel />
      </div>
    </div>
  );
}
