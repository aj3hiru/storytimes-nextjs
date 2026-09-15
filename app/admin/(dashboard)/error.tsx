"use client";

import { useEffect } from "react";

/**
 * Real gap fixed here — the likely cause of "Cache Manager gets stuck,
 * then other admin pages go blank": this admin dashboard segment had NO
 * error boundary anywhere. Next.js's default behavior with no error.tsx
 * present is to bubble a render failure up until something catches it —
 * in production, that can surface as an entirely blank page with no
 * visible error and no way to recover short of a full hard refresh,
 * which matches exactly what was reported (Cache Manager stuck loading,
 * subsequent navigation blank, only a hard refresh helping).
 *
 * This does not fix whatever underlying cause first throws (a stale
 * chunk reference right after an in-place `.next` rebuild, a genuine
 * server action failure, or anything else) — it makes SURE that when
 * something inside this admin shell does throw, the person sees an
 * actual message and a way to retry, instead of nothing at all.
 */
export default function AdminDashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin dashboard error boundary caught:", error);
  }, [error]);

  const isChunkError =
    /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i.test(
      error.message || ""
    );

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", padding: "2rem" }}>
      <div className="card" style={{ maxWidth: 480, padding: "2rem", textAlign: "center" }}>
        <i className="fas fa-triangle-exclamation" style={{ fontSize: "2rem", color: "var(--warning)", marginBottom: "1rem" }} />
        <h2 style={{ marginBottom: "0.5rem" }}>Something went wrong loading this page</h2>
        <p style={{ color: "var(--gray-500)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
          {isChunkError
            ? "This usually means the site was updated while this page was open. Reloading should fix it."
            : error.message || "An unexpected error occurred."}
        </p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
          <button type="button" className="btn btn-primary" onClick={() => reset()}>
            <i className="fas fa-rotate-right" /> Try Again
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>
            <i className="fas fa-arrows-rotate" /> Reload Page
          </button>
        </div>
      </div>
    </div>
  );
}
