"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { requireUser } from "./auth";

export async function addCountryRedirect(formData: FormData): Promise<void> {
  const user = await requireUser();
  if (!user || user.role !== "admin") throw new Error("Admin access required.");

  const countryCode = String(formData.get("countryCode") ?? "").trim().toUpperCase();
  const targetUrl = String(formData.get("targetUrl") ?? "").trim();
  if (!countryCode || !targetUrl) throw new Error("Country code and target URL are required.");

  await prisma.countryRedirection.upsert({
    where: { countryCode },
    create: { countryCode, targetUrl, status: true },
    update: { targetUrl },
  });

  revalidatePath("/admin/country-redirection");
  redirect("/admin/country-redirection?success=1");
}

export async function toggleCountryRedirect(id: number, status: boolean): Promise<void> {
  const user = await requireUser();
  if (!user || user.role !== "admin") throw new Error("Admin access required.");
  await prisma.countryRedirection.update({ where: { id }, data: { status } });
  revalidatePath("/admin/country-redirection");
}

export async function deleteCountryRedirect(id: number): Promise<void> {
  const user = await requireUser();
  if (!user || user.role !== "admin") throw new Error("Admin access required.");
  await prisma.countryRedirection.delete({ where: { id } });
  revalidatePath("/admin/country-redirection");
}
