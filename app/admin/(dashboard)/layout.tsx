import { redirect } from "next/navigation";
import { requireUser, resolvePermissions } from "@/lib/auth";
import { resolveSiteConfig } from "@/lib/config";
import { getHeaderSettings } from "@/lib/navigation";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminBarContent } from "@/components/AdminBar";
import { AdminDialogProvider } from "@/components/admin/AdminDialogProvider";
import "../admin.css";

export default async function AdminDashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user) {
    redirect("/admin-login");
  }

  const permissions = resolvePermissions(user);
  if (!permissions.dashboard_access && user.role !== "admin") {
    redirect("/admin-login");
  }

  const [siteConfig, header] = await Promise.all([resolveSiteConfig(""), getHeaderSettings()]);
  // Same rule as the public header: the logo when one is set, else the site title.
  const siteLogo = header.displayMode === "logo" ? header.logoUrl : "";

  return (
    <AdminDialogProvider>
      <AdminBarContent username={user.username} role={user.role} permissions={permissions} />
      <AdminShell role={user.role} permissions={permissions} siteName={siteConfig.siteName} siteLogo={siteLogo}>
        {children}
      </AdminShell>
    </AdminDialogProvider>
  );
}
