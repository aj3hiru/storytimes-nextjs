import "./cache-manager.css";
import { CacheManagerClient } from "@/components/admin/CacheManagerClient";

export default function CacheManagerPage() {
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
