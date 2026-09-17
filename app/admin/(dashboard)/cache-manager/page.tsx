import { guardPage } from "@/lib/pageGuard";
import "./cache-manager.css";
import { CacheManagerClient } from "@/components/admin/CacheManagerClient";
import { ViewCountAuditPanel } from "@/components/admin/ViewCountAuditPanel";
import { requireUser } from "@/lib/auth";

export default async function CacheManagerPage() {
  // Direct-URL access guard — see lib/pageGuard.tsx.
  const denied = await guardPage((p) => p.tools.cache_manager, "You do not have permission to use the Cache Manager.");
  if (denied) return denied;

  const user = await requireUser();

  return (
    <div>
      {/* isProduction computed here (a Server Component, where reading
          process.env is always safe) and passed down as a plain prop —
          CacheManagerClient itself is a client component, and reading
          process.env.NODE_ENV directly from client code is unreliable
          across bundlers/deploy setups even though Next.js's own
          bundler typically inlines it safely. */}
      <CacheManagerClient isProduction={process.env.NODE_ENV === "production"} />

      {/* Admin-only, deliberately: this tool WRITES corrective rows into
          the stats tables, and its server actions enforce admin in their
          own right (see lib/viewCountAudit.ts). Rendering it for an
          editor who merely holds `tools.cache_manager` would show a
          button that always errors — the page guard above is about
          reaching the Cache Manager at all, which is a lower bar than
          repairing site-wide analytics data. */}
      {user?.role === "admin" && (
        <div style={{ marginTop: "1.5rem" }}>
          <ViewCountAuditPanel />
        </div>
      )}
    </div>
  );
}
