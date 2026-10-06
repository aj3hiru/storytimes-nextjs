import { redirect } from "next/navigation";

/** Sidebar settings now live in Post Template → Sidebar. */
export default function SidebarSettingsPage() {
  redirect("/admin/post-template?tab=sidebar");
}
