/**
 * Initial-setup seed script — creates the one thing every fresh install
 * needs before anyone can log in: an admin account with a COMPLETE,
 * correctly-shaped permissions JSON (every section present, all true —
 * see lib/auth.ts's PERMISSION_SKELETON). A partial/hand-written
 * permissions JSON is exactly what caused a real
 * "Cannot read properties of undefined (reading 'access_file_manager')"
 * crash in an earlier deployment attempt where the admin account was
 * created ad-hoc outside of this script — this is the safe, supported
 * way to create that first account instead.
 *
 * Run via: npm run db:seed
 * Safe to re-run: uses upsert, so it won't duplicate the admin account
 * or the Default category on a second run.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const FULL_ADMIN_PERMISSIONS = {
  dashboard_access: true,
  blogs: {
    create: true, edit_own: true, edit_all: true, delete_own: true, delete_all: true,
    publish: true, unpublish: true, schedule: true, feature: true,
    manage_categories: true, manage_tags: true, manage_comments: true,
    view_drafts: true, manage_seo: true,
  },
  media: { upload: true, delete: true, manage_all: true },
  users: { create: true, edit: true, delete: true, suspend: true, change_roles: true, manage_permissions: true },
  authors: { create: true, edit: true, delete: true, approve: true, feature: true },
  analytics: { view_basic: true, view_advanced: true },
  ads: { manage_ads: true, view_revenue: true },
  settings: { general: true, seo: true, smtp: true, api_keys: true, maintenance_mode: true },
  pages: { create: true, edit: true, delete: true },
  files: { access_file_manager: true },
  security: { view_logs: true, manage_blacklist: true, manage_recaptcha: true },
};

async function main() {
  // The "Default" fallback category (id 1) — protected/un-deletable
  // elsewhere in the admin (see lib/categoryAdmin.ts), so it needs to
  // exist from the very first run.
  await prisma.category.upsert({
    where: { slug: "default" },
    create: { name: "Default", slug: "default" },
    update: {},
  });

  const username = process.env.SEED_ADMIN_USERNAME ?? "admin";
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.upsert({
    where: { username },
    create: {
      username,
      email,
      passwordHash,
      role: "admin",
      status: "active",
      permissions: JSON.stringify(FULL_ADMIN_PERMISSIONS),
    },
    update: {
      // Re-running the seed refreshes permissions to the full set too —
      // exactly the repair an incomplete/legacy permissions JSON needs.
      permissions: JSON.stringify(FULL_ADMIN_PERMISSIONS),
      status: "active",
    },
  });

  await prisma.author.upsert({
    where: { userId: admin.id },
    create: {
      userId: admin.id,
      fullName: "Site Admin",
      name: "Admin",
      slug: "admin",
      email,
      status: "active",
    },
    update: {},
  });

  console.log(`Seed complete. Admin login: ${username} / ${process.env.SEED_ADMIN_PASSWORD ? "(from SEED_ADMIN_PASSWORD)" : password}`);
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log("NOTE: using the default password since SEED_ADMIN_PASSWORD wasn't set — change it after first login, or set SEED_ADMIN_USERNAME/SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD env vars before seeding a real deployment.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
