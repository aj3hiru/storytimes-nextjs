"use client";

import { useRouter } from "next/navigation";

export interface DashboardFilterOption {
  id: number;
  username: string;
  /** Shown next to the name so an admin/editor can tell apart same-named
   *  accounts and see at a glance who's an author vs. another editor. */
  role: string;
}

/**
 * New feature, no PHP equivalent — per explicit request: lets an admin
 * pick ANY user's dashboard to view, and an editor pick from their own
 * assigned authors (plus themselves). Never shown to authors, who have
 * nothing else to filter to.
 *
 * The option list itself already reflects who the viewer is ALLOWED to
 * pick (computed server-side by resolveDashboardScope() and passed in as
 * `options`) — this component doesn't do its own authorization, it just
 * navigates to `?user=<id>`, and the server route validates that
 * selection again before using it. Belt-and-suspenders: even if someone
 * hand-crafted a URL with a user id outside their allowed set, the
 * server-side check in resolveDashboardScope() silently falls back to
 * the viewer's own dashboard rather than trusting the URL.
 */
export function DashboardUserFilter({
  options,
  currentUserId,
}: {
  options: DashboardFilterOption[];
  currentUserId: number;
}) {
  const router = useRouter();

  // A lone option (just yourself) isn't worth a dropdown — matches the
  // same "don't show a filter with nothing to filter to" reasoning used
  // for the Analytics author filter.
  if (options.length <= 1) return null;

  return (
    <div className="db-user-filter">
      <i className="fas fa-user-clock db-user-filter-icon" />
      <select
        className="db-user-filter-select"
        value={currentUserId}
        onChange={(e) => {
          const id = e.target.value;
          router.push(id ? `/admin/dashboard?user=${id}` : "/admin/dashboard");
        }}
        aria-label="View a different user's dashboard"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.username} ({o.role})
          </option>
        ))}
      </select>
    </div>
  );
}
