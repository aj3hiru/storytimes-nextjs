import "server-only";
import type { ReactNode } from "react";
import { requireUser, resolvePermissions } from "./auth";
import type { Permissions } from "./permissions";

/**
 * Page-level access guard for admin routes.
 *
 * The gap this closes: middleware only proves "a session cookie is
 * present" — it deliberately does no permission work (see middleware.ts,
 * where that's explained). Every admin page therefore had to check its
 * own permissions, and most simply didn't — so anyone signed in could
 * reach Backup & Restore, Ad Inserter, Cron Manager, General Settings and
 * the rest just by typing the URL. The sidebar hiding a link is not
 * access control; it only hides the link.
 *
 * Returns JSX to render instead of the page when access is refused, or
 * `null` when it's allowed. Used as an early return at the top of a page
 * component, which works regardless of how that page's own JSX is
 * structured:
 *
 *     const denied = await guardPage((p) => p.settings.general);
 *     if (denied) return denied;
 *
 * Admins always pass — every page using this is an admin capability by
 * definition, and gating admins on individual flags would only create
 * ways to lock the site owner out of their own site.
 */
export async function guardPage(
  check: (p: Permissions) => boolean,
  message?: string
): Promise<ReactNode | null> {
  const user = await requireUser();
  if (!user) {
    return (
      <div className="empty-state">
        <h3>Access denied</h3>
        <p>You need to be signed in to view this page.</p>
      </div>
    );
  }
  if (user.role === "admin") return null;

  if (!check(resolvePermissions(user))) {
    return (
      <div className="empty-state">
        <h3>Access denied</h3>
        <p>{message ?? "You do not have permission to view this page."}</p>
      </div>
    );
  }
  return null;
}
