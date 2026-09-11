import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!user) {
    redirect("/admin-login");
  }
  return children;
}
