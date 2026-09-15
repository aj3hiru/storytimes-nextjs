import "./backup-restore.css";
import { BackupRestorePanel } from "@/components/admin/BackupRestorePanel";

export default function BackupRestorePage() {
  return (
    <div>
      <div className="toolbar">
        <h2 className="toolbar-title">Backup &amp; Restore</h2>
      </div>
      <BackupRestorePanel />
    </div>
  );
}
