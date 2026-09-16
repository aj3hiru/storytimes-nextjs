import { guardPage } from "@/lib/pageGuard";
import "./backup-restore.css";
import { BackupRestorePanel } from "@/components/admin/BackupRestorePanel";

export default async function BackupRestorePage() {
  // Direct-URL access guard — see lib/pageGuard.tsx.
  const denied = await guardPage((p) => p.tools.backup_restore, "You do not have permission to use Backup & Restore.");
  if (denied) return denied;

  return (
    <div>
      <BackupRestorePanel />
    </div>
  );
}
