"use client";

import { useState, useTransition } from "react";
import { clearHomepageCache, clearAllSiteCache } from "@/lib/cacheManagerAdmin";

export default function CacheManagerPage() {
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div>
      <div className="toolbar">
        <h2 className="toolbar-title">Cache Manager</h2>
      </div>

      <div className="alert alert-info" style={{ marginBottom: "1.5rem" }}>
        <i className="fas fa-info-circle" /> This site uses Next.js&apos;s server-side render cache
        instead of the original&apos;s on-disk HTML cache files — there&apos;s nothing to physically
        delete. These buttons call <code>revalidatePath()</code> to force fresh renders.
      </div>

      {message && (
        <div className="alert alert-success">
          <i className="fas fa-check-circle" /> {message}
        </div>
      )}

      <div className="card" style={{ padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem", alignItems: "flex-start" }}>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await clearHomepageCache();
              setMessage("Homepage cache cleared.");
            })
          }
        >
          Clear Homepage Cache
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await clearAllSiteCache();
              setMessage("Site-wide cache cleared.");
            })
          }
        >
          Clear All Site Cache
        </button>
      </div>
    </div>
  );
}
