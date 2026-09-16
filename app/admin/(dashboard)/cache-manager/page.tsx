import { guardPage } from "@/lib/pageGuard";
import "./cache-manager.css";
import { CacheManagerClient } from "@/components/admin/CacheManagerClient";

export default async function CacheManagerPage() {
  // Direct-URL access guard — see lib/pageGuard.tsx.
  const denied = await guardPage((p) => p.tools.cache_manager, "You do not have permission to use the Cache Manager.");
  if (denied) return denied;

  return (
    <div>
      {/* isProduction computed here (a Server Component, where reading
          process.env is always safe) and passed down as a plain prop —
          CacheManagerClient itself is a client component, and reading
          process.env.NODE_ENV directly from client code is unreliable
          across bundlers/deploy setups even though Next.js's own
          bundler typically inlines it safely. */}
      <CacheManagerClient isProduction={process.env.NODE_ENV === "production"} />
    </div>
  );
}
