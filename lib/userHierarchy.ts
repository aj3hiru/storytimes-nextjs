import type { UserRole } from "@prisma/client";
import type { Permissions } from "./permissions";
import { PERMISSION_SKELETON } from "./permissions";

/**
 * Role ranking and the rules for who may manage whom.
 *
 * The problem this solves: `users.create`/`edit`/`delete` used to be flat
 * booleans. Granting an editor "create users" let them create another
 * ADMIN, and the user list showed every account on the site including
 * admins — so a single delegated permission handed over the whole
 * installation. These helpers make delegation safe: you can only ever act
 * on someone strictly below you, and only on accounts you created.
 *
 * Every rule here is enforced SERVER-SIDE in lib/userAdmin.ts. The UI
 * filtering that matches it is a convenience, never the protection.
 */
export const ROLE_RANK: Record<UserRole, number> = {
  admin: 3,
  editor: 2,
  author: 1,
};

/** Roles a given actor is allowed to assign when creating or editing a
 *  user. Admins may assign anything; everyone else may only assign roles
 *  STRICTLY below their own — so an editor can create authors, never
 *  another editor and never an admin. */
export function assignableRoles(actorRole: UserRole): UserRole[] {
  if (actorRole === "admin") return ["author", "editor", "admin"];
  return (Object.keys(ROLE_RANK) as UserRole[])
    .filter((r) => ROLE_RANK[r] < ROLE_RANK[actorRole])
    .sort((a, b) => ROLE_RANK[a] - ROLE_RANK[b]);
}

export function canAssignRole(actorRole: UserRole, targetRole: UserRole): boolean {
  return assignableRoles(actorRole).includes(targetRole);
}

/**
 * May `actor` view/edit/delete `target`?
 *
 * Admins: anyone. Everyone else: only accounts strictly below their own
 * rank AND that they personally created. Both conditions matter — rank
 * alone would let one editor manage another editor's authors, and
 * creator alone would be bypassed the moment an account's role changed.
 */
export function canManageUser(
  actor: { id: number; role: UserRole },
  target: { id: number; role: UserRole; createdById: number | null }
): boolean {
  if (actor.role === "admin") return true;
  if (target.id === actor.id) return false; // own account is edited via My Profile
  if (ROLE_RANK[target.role] >= ROLE_RANK[actor.role]) return false;
  return target.createdById === actor.id;
}

/**
 * Narrows a permission set to what an actor is allowed to GRANT.
 *
 * You can never grant a permission you don't hold yourself — otherwise an
 * editor with `users.create` could mint an account with permissions they
 * were deliberately never given, then log in as it. Admins are
 * unrestricted; for everyone else each flag is ANDed with their own.
 */
export function clampPermissionsToActor(requested: Permissions, actor: { role: UserRole; permissions: Permissions }): Permissions {
  if (actor.role === "admin") return requested;

  const out = structuredClone(PERMISSION_SKELETON) as unknown as Record<string, unknown>;
  const req = requested as unknown as Record<string, unknown>;
  const mine = actor.permissions as unknown as Record<string, unknown>;

  for (const key of Object.keys(out)) {
    const base = out[key];
    if (typeof base === "boolean") {
      out[key] = Boolean(req[key]) && Boolean(mine[key]);
    } else if (typeof base === "object" && base !== null) {
      const section: Record<string, boolean> = {};
      const reqSection = (req[key] ?? {}) as Record<string, unknown>;
      const mineSection = (mine[key] ?? {}) as Record<string, unknown>;
      for (const sub of Object.keys(base as Record<string, unknown>)) {
        section[sub] = Boolean(reqSection[sub]) && Boolean(mineSection[sub]);
      }
      out[key] = section;
    }
  }
  return out as unknown as Permissions;
}

/**
 * The permission keys an actor may even SEE in the Advance Access panel.
 * Showing a checkbox that would be silently stripped on save is worse
 * than not showing it — it reads as a bug rather than a boundary.
 */
export function visiblePermissionKeys(actor: { role: UserRole; permissions: Permissions }): Set<string> {
  const keys = new Set<string>();
  const mine = actor.permissions as unknown as Record<string, unknown>;
  for (const key of Object.keys(PERMISSION_SKELETON)) {
    const base = (PERMISSION_SKELETON as unknown as Record<string, unknown>)[key];
    if (typeof base === "boolean") {
      if (actor.role === "admin" || mine[key]) keys.add(key);
    } else if (typeof base === "object" && base !== null) {
      for (const sub of Object.keys(base as Record<string, unknown>)) {
        const mineSection = (mine[key] ?? {}) as Record<string, unknown>;
        if (actor.role === "admin" || mineSection[sub]) keys.add(`${key}.${sub}`);
      }
    }
  }
  return keys;
}
