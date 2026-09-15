"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "./db";
import { requireUser } from "./auth";

async function requireAdmin() {
  const user = await requireUser();
  if (!user || user.role !== "admin") throw new Error("Admin access required.");
  return user;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Create or update a rule. Mirrors admin/country-redirection.php's single
 * POST handler (action=create / action=update), including the "OTHER ->
 * manual_country" fallback and the same validation order.
 */
export async function saveCountryRedirect(formData: FormData): Promise<void> {
  const user = await requireAdmin();

  const editId = parseInt(String(formData.get("editId") ?? "0"), 10) || 0;

  let countryCode = String(formData.get("countryCode") ?? "").trim().toUpperCase();
  if (countryCode === "OTHER") {
    countryCode = String(formData.get("manualCountry") ?? "").trim().toUpperCase();
  }
  const targetUrl = String(formData.get("targetUrl") ?? "").trim();

  if (!countryCode || !targetUrl) {
    throw new Error("Both Country Code and Target URL are required.");
  }
  if (!isValidHttpUrl(targetUrl)) {
    throw new Error("Invalid Target URL.");
  }

  // The DB column is UNIQUE on countryCode (upsert-friendly), but that means
  // an edit that changes the code must not silently clobber an unrelated
  // existing row for that code — surface a clear error instead, same as a
  // real MySQL UNIQUE constraint violation would have in the PHP version.
  const clashing = await prisma.countryRedirection.findUnique({ where: { countryCode } });
  if (clashing && clashing.id !== editId) {
    throw new Error(`A redirection rule for ${countryCode} already exists. Edit that rule instead.`);
  }

  if (editId > 0) {
    await prisma.countryRedirection.update({
      where: { id: editId },
      data: { countryCode, targetUrl },
    });
    await prisma.activityLog.create({
      data: {
        userId: user.id,
        actionType: "redirect_update",
        description: `Updated Redirection (ID: ${editId}): ${countryCode} -> ${targetUrl}`,
      },
    });
    revalidatePath("/admin/country-redirection");
    redirect("/admin/country-redirection?success=updated");
  }

  const created = await prisma.countryRedirection.create({
    data: { countryCode, targetUrl, status: true },
  });
  await prisma.activityLog.create({
    data: {
      userId: user.id,
      actionType: "redirect_create",
      description: `Created Redirection for: ${countryCode} -> ${targetUrl} (ID: ${created.id})`,
    },
  });
  revalidatePath("/admin/country-redirection");
  redirect("/admin/country-redirection?success=created");
}

export async function toggleCountryRedirect(id: number, status: boolean): Promise<void> {
  const user = await requireAdmin();
  const row = await prisma.countryRedirection.update({ where: { id }, data: { status } });
  await prisma.activityLog.create({
    data: {
      userId: user.id,
      actionType: status ? "redirect_enable" : "redirect_disable",
      description: `${status ? "Enabled" : "Disabled"} Redirection (ID: ${id}): ${row.countryCode} -> ${row.targetUrl}`,
    },
  });
  revalidatePath("/admin/country-redirection");
}

export async function deleteCountryRedirect(id: number): Promise<void> {
  const user = await requireAdmin();
  const row = await prisma.countryRedirection.delete({ where: { id } });
  await prisma.activityLog.create({
    data: {
      userId: user.id,
      actionType: "redirect_delete",
      description: `Deleted Redirection (ID: ${id}): ${row.countryCode} -> ${row.targetUrl}`,
    },
  });
  revalidatePath("/admin/country-redirection");
}

export interface CloudflareDetectionInfo {
  isBehindCloudflare: boolean;
  cfIpCountry: string | null;
  cfRay: string | null;
  cfConnectingIp: string | null;
}

/**
 * Diagnostic helper for the admin panel — reports whether *this admin
 * request* is actually passing through Cloudflare, so you can tell at a
 * glance whether redirects have any chance of working in production.
 * Equivalent of getCloudflareDetectionInfo() in includes/country_redirect.php.
 */
export async function getCloudflareDetectionInfo(): Promise<CloudflareDetectionInfo> {
  const h = await headers();
  const cfRay = h.get("cf-ray");
  const cfConnectingIp = h.get("cf-connecting-ip");
  return {
    isBehindCloudflare: Boolean(cfRay || cfConnectingIp),
    cfIpCountry: h.get("cf-ipcountry"),
    cfRay,
    cfConnectingIp,
  };
}
