import "./cache-manager.css";
import { CacheManagerClient } from "@/components/admin/CacheManagerClient";

export default function CacheManagerPage() {
  return (
    <div>
      <div className="toolbar">
        <h2 className="toolbar-title">Cache Manager</h2>
      </div>
      <CacheManagerClient />
    </div>
  );
}
